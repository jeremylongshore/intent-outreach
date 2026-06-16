/**
 * pipeline_core/connectors/hunter.ts — Hunter.io connector.
 *
 * Self-serve BYO-key with a generous free tier (50 searches/mo) — the connector
 * that lets an indie user run a full campaign for $0. Best-in-class docs.
 *
 * Endpoints (Hunter v2, auth via `api_key` query param):
 *   - Domain search: GET https://api.hunter.io/v2/domain-search?domain=...
 *   - Email finder:  GET https://api.hunter.io/v2/email-finder?domain=...&full_name=...
 *   - Email verify:  GET https://api.hunter.io/v2/email-verifier?email=...
 */

import { httpJson } from "../http.js";
import { getSecret, hasSecret } from "../secrets.js";
import type { Contact, Enrichment, Lead } from "../models.js";
import type {
  Connector,
  EnrichInput,
  EnrichOutput,
  ResearchInput,
  ResearchOutput,
} from "./types.js";

const BASE = "https://api.hunter.io/v2";
const KEY_ENV = "HUNTER_API_KEY";

interface HunterEmail {
  value?: string;
  first_name?: string;
  last_name?: string;
  position?: string;
  linkedin?: string;
}
interface HunterDomainSearch {
  data?: { organization?: string; emails?: HunterEmail[] };
}
interface HunterFinder {
  data?: { email?: string; score?: number };
}

export const hunterConnector: Connector = {
  name: "hunter",
  displayName: "Hunter.io",
  tier: "free",
  keyEnvVar: KEY_ENV,
  phases: ["research", "enrich"],
  note: "Self-serve key; 50 free searches/mo. Email finding + verification.",

  isConfigured() {
    return hasSecret(KEY_ENV);
  },

  async research({ domain }: ResearchInput): Promise<ResearchOutput> {
    const res = await httpJson<HunterDomainSearch>(`${BASE}/domain-search`, {
      query: { domain, api_key: getSecret(KEY_ENV), limit: 10 },
    });
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
      title: e.position,
      linkedin: e.linkedin ?? undefined,
      source: "hunter",
    }));
    return { leads: [lead], contacts, raw: res };
  },

  async enrich({ lead, contacts }: EnrichInput): Promise<EnrichOutput> {
    const needy = contacts.filter((c) => !c.email).slice(0, 10);
    const now = new Date().toISOString();
    const enrichments: Enrichment[] = [];
    for (const c of needy) {
      const res = await httpJson<HunterFinder>(`${BASE}/email-finder`, {
        query: { domain: lead.domain, full_name: c.name, api_key: getSecret(KEY_ENV) },
      });
      const email = res.data?.email;
      if (email && email.includes("@")) {
        enrichments.push({
          subjectType: "contact",
          subjectKey: email,
          provider: "hunter",
          verifiedEmail: email,
          data: (res.data ?? {}) as Record<string, unknown>,
          fetchedAt: now,
        });
      }
    }
    return { enrichments };
  },
};
