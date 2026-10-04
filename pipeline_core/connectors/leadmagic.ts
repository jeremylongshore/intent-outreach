/**
 * pipeline_core/connectors/leadmagic.ts — LeadMagic connector.
 *
 * LeadMagic is a paid AI-native data platform specialising in email + mobile
 * finding and company enrichment. Enrich-phase only: it fills in emails for
 * contacts that came back from research connectors without one.
 *
 * Endpoints (auth via X-API-Key header):
 *   - Email finder: POST https://api.leadmagic.io/email-finder
 *
 * The finder is name-keyed and paid per lookup, so contacts with "(unknown)" or
 * single-token names are skipped before any request (see _per-item.ts).
 */

import { z } from "zod";
import { httpJson } from "../http.js";
import { hasSecret } from "../secrets.js";
import type { Enrichment } from "../models.js";
import { forEachContact } from "./_per-item.js";
import { parseVendor, pickAllowed, useSecret } from "./_shared.js";
import type { Connector, EnrichInput, EnrichOutput } from "./types.js";

const BASE = "https://api.leadmagic.io";
const KEY_ENV = "LEADMAGIC_API_KEY";

function headers(): Record<string, string> {
  return { "X-API-Key": useSecret(KEY_ENV) };
}

const EmailFinderSchema = z
  .object({
    email: z.string().nullish(),
    first_name: z.string().nullish(),
    last_name: z.string().nullish(),
    company: z.string().nullish(),
    title: z.string().nullish(),
    linkedin_url: z.string().nullish(),
  })
  .passthrough();

/** B2B fields kept in enrichment `data`. */
const LEADMAGIC_ALLOW = [
  "email",
  "email_status",
  "first_name",
  "last_name",
  "company",
  "company_name",
  "title",
  "linkedin_url",
] as const;

/** Split "First Last" → { first, last }. */
function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  const first = parts[0] ?? "";
  const last = parts.length > 1 ? parts.slice(1).join(" ") : "";
  return { first, last };
}

export const leadmagicConnector: Connector = {
  name: "leadmagic",
  displayName: "LeadMagic",
  tier: "paid",
  keyEnvVar: KEY_ENV,
  phases: ["enrich"],
  note: "Paid provider access required; check current terms. Email and mobile finding plus company enrichment.",

  isConfigured() {
    return hasSecret(KEY_ENV);
  },

  async enrich({ lead, contacts, signal }: EnrichInput): Promise<EnrichOutput> {
    const now = new Date().toISOString();
    const { results, failures } = await forEachContact<Enrichment>(
      contacts,
      10,
      async (c) => {
        const { first, last } = splitName(c.name);
        const res = parseVendor(
          EmailFinderSchema,
          await httpJson(`${BASE}/email-finder`, {
            signal,
            method: "POST",
            headers: headers(),
            json: { first_name: first, last_name: last, domain: lead.domain },
          }),
        );
        const email = res.email;
        if (!email || !email.includes("@")) return null;
        return {
          subjectType: "contact",
          subjectKey: email,
          provider: "leadmagic",
          verifiedEmail: email,
          contactName: c.name,
          data: pickAllowed(res as Record<string, unknown>, LEADMAGIC_ALLOW),
          fetchedAt: now,
        };
      },
      { filter: (c) => !c.email },
    );
    return { enrichments: results, failures, raw: { failures } };
  },
};
