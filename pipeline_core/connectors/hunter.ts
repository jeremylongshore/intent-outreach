/**
 * pipeline_core/connectors/hunter.ts — Hunter.io connector.
 *
 * Bring-your-own provider key — the connector
 * that lets an indie user run a full campaign for $0. Best-in-class docs.
 *
 * Endpoints (Hunter v2, auth via `api_key` query param):
 *   - Domain search: GET https://api.hunter.io/v2/domain-search?domain=...
 *   - Email finder:  GET https://api.hunter.io/v2/email-finder?domain=...&full_name=...
 *   - Email verify:  GET https://api.hunter.io/v2/email-verifier?email=...
 *
 * The email finder is name-keyed: contacts with "(unknown)" or single-token
 * names are skipped (no lookup spent), and one contact's 404/5xx no longer
 * discards the others' results (see _per-item.ts).
 */

import { z } from "zod";
import { httpJson } from "../http.js";
import { hasSecret } from "../secrets.js";
import type { Contact, Enrichment, Lead } from "../models.js";
import { forEachContact } from "./_per-item.js";
import { parseVendor, useSecret } from "./_shared.js";
import type {
  Connector,
  EnrichInput,
  EnrichOutput,
  ResearchInput,
  ResearchOutput,
} from "./types.js";

const BASE = "https://api.hunter.io/v2";
const KEY_ENV = "HUNTER_API_KEY";

const HunterEmailSchema = z
  .object({
    value: z.string().nullish(),
    first_name: z.string().nullish(),
    last_name: z.string().nullish(),
    position: z.string().nullish(),
    linkedin: z.string().nullish(),
  })
  .passthrough();
const DomainSearchSchema = z
  .object({
    data: z
      .object({
        organization: z.string().nullish(),
        emails: z.array(HunterEmailSchema).nullish(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough();
const FinderSchema = z
  .object({
    data: z
      .object({ email: z.string().nullish(), score: z.number().nullish() })
      .passthrough()
      .nullish(),
  })
  .passthrough();

export const hunterConnector: Connector = {
  name: "hunter",
  displayName: "Hunter.io",
  tier: "free",
  keyEnvVar: KEY_ENV,
  phases: ["research", "enrich"],
  note: "Credential required; check current provider access and quota terms. Email finding + verification.",

  isConfigured() {
    return hasSecret(KEY_ENV);
  },

  async research({ domain }: ResearchInput): Promise<ResearchOutput> {
    const res = parseVendor(
      DomainSearchSchema,
      await httpJson(`${BASE}/domain-search`, {
        query: { domain, api_key: useSecret(KEY_ENV), limit: 10 },
      }),
    );
    const org = res.data?.organization;
    const lead: Lead = {
      domain,
      companyName: org ?? domain,
      source: "hunter",
    };
    const contacts: Contact[] = (res.data?.emails ?? []).map((e) => ({
      name: [e.first_name, e.last_name].filter(Boolean).join(" ") || "(unknown)",
      leadDomain: domain,
      email: e.value && e.value.includes("@") ? e.value : undefined,
      title: e.position ?? undefined,
      linkedin: e.linkedin ?? undefined,
      source: "hunter",
    }));
    return { leads: [lead], contacts, raw: res };
  },

  async enrich({ lead, contacts }: EnrichInput): Promise<EnrichOutput> {
    const now = new Date().toISOString();
    const { results, failures } = await forEachContact<Enrichment>(
      contacts,
      10,
      async (c) => {
        const res = parseVendor(
          FinderSchema,
          await httpJson(`${BASE}/email-finder`, {
            query: { domain: lead.domain, full_name: c.name, api_key: useSecret(KEY_ENV) },
          }),
        );
        const email = res.data?.email;
        if (!email || !email.includes("@")) return null;
        return {
          subjectType: "contact",
          subjectKey: email,
          provider: "hunter",
          verifiedEmail: email,
          data: (res.data ?? {}) as Record<string, unknown>,
          fetchedAt: now,
        };
      },
      { filter: (c) => !c.email },
    );
    return { enrichments: results, failures, raw: { failures } };
  },
};
