/**
 * pipeline_core/connectors/leadmagic.ts — LeadMagic connector.
 *
 * LeadMagic is a paid AI-native data platform specialising in email + mobile
 * finding and company enrichment. Enrich-phase only: it fills in emails for
 * contacts that came back from research connectors without one.
 *
 * Endpoints (auth via X-API-Key header):
 *   - Email finder: POST https://api.leadmagic.io/email-finder
 */

import { httpJson } from "../http.js";
import { getSecret, hasSecret } from "../secrets.js";
import type { Enrichment } from "../models.js";
import type { Connector, EnrichInput, EnrichOutput } from "./types.js";

const BASE = "https://api.leadmagic.io";
const KEY_ENV = "LEADMAGIC_API_KEY";

function headers(): Record<string, string> {
  return { "X-API-Key": getSecret(KEY_ENV) };
}

interface LeadMagicEmailFinderResponse {
  email?: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  title?: string;
  linkedin_url?: string;
}

/** Split "First Last" → { first, last }. Defensive: single-token names go to first. */
function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 0) return { first: "", last: "" };
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
  note: "Paid ($49/mo); email + mobile finding, company enrichment, AI-native.",

  isConfigured() {
    return hasSecret(KEY_ENV);
  },

  async enrich({ lead, contacts }: EnrichInput): Promise<EnrichOutput> {
    const needy = contacts.filter((c) => !c.email).slice(0, 10);
    if (needy.length === 0) return { enrichments: [] };

    const now = new Date().toISOString();
    const enrichments: Enrichment[] = [];

    for (const c of needy) {
      const { first, last } = splitName(c.name);
      const res = await httpJson<LeadMagicEmailFinderResponse>(
        `${BASE}/email-finder`,
        {
          method: "POST",
          headers: headers(),
          json: {
            first_name: first,
            last_name: last,
            domain: lead.domain,
          },
        },
      );

      const email = res.email;
      if (!email || !email.includes("@")) continue;

      enrichments.push({
        subjectType: "contact",
        subjectKey: email,
        provider: "leadmagic",
        verifiedEmail: email,
        data: res as Record<string, unknown>,
        fetchedAt: now,
      });
    }

    return { enrichments };
  },
};
