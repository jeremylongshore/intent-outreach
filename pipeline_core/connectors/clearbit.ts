/**
 * pipeline_core/connectors/clearbit.ts — Clearbit (legacy) connector.
 *
 * NOTE: Clearbit was acquired by HubSpot in 2023 and folded into HubSpot Breeze
 * Intelligence. New API keys are no longer issued. This connector works only with
 * a pre-2024 key obtained before the acquisition.
 *
 * Endpoints (Clearbit v2, auth via Authorization: Bearer <key>):
 *   - Person lookup:  GET https://person.clearbit.com/v2/people/find?email=<email>
 *   - Company lookup: GET https://company.clearbit.com/v2/companies/find?domain=<domain>
 *
 * Clearbit is asynchronous for new lookups — the person endpoint may return HTTP 202
 * (Accepted) with an empty or non-JSON body while it fetches data in the background.
 * We treat a 202 or an empty/non-object body as "no data this call" and skip rather
 * than throw. Results appear synchronously on subsequent calls once Clearbit has
 * cached the lookup.
 */

import { httpJson, HttpError } from "../http.js";
import { getSecret, hasSecret } from "../secrets.js";
import type { Enrichment } from "../models.js";
import type {
  Connector,
  EnrichInput,
  EnrichOutput,
} from "./types.js";

const PERSON_BASE = "https://person.clearbit.com/v2";
const COMPANY_BASE = "https://company.clearbit.com/v2";
const KEY_ENV = "CLEARBIT_API_KEY";

function headers(): Record<string, string> {
  return { Authorization: `Bearer ${getSecret(KEY_ENV)}` };
}

interface ClearbitPerson {
  email?: string;
  name?: { fullName?: string };
  phone?: string;
  [key: string]: unknown;
}

interface ClearbitCompany {
  name?: string;
  domain?: string;
  [key: string]: unknown;
}

/**
 * Attempt a Clearbit lookup and return the parsed JSON, or null when Clearbit
 * signals "not ready yet" (HTTP 202) or the body is absent/not an object. Any
 * other non-2xx status propagates as HttpError so the caller sees the real error.
 */
async function tryFetch<T extends Record<string, unknown>>(
  url: string,
  query: Record<string, string>,
): Promise<T | null> {
  try {
    const result = await httpJson<T>(url, {
      method: "GET",
      headers: headers(),
      query,
    });
    // If the response is not a populated object, treat as "no data".
    if (!result || typeof result !== "object" || Object.keys(result).length === 0) {
      return null;
    }
    return result;
  } catch (err) {
    // HTTP 202 = Clearbit is looking up the record asynchronously; not an error.
    if (err instanceof HttpError && err.status === 202) {
      return null;
    }
    throw err;
  }
}

export const clearbitConnector: Connector = {
  name: "clearbit",
  displayName: "Clearbit (legacy)",
  tier: "legacy",
  keyEnvVar: KEY_ENV,
  phases: ["enrich"],
  note: "Legacy: new API keys are no longer issued (folded into HubSpot Breeze). Works only with a pre-2024 key.",

  isConfigured() {
    return hasSecret(KEY_ENV);
  },

  async enrich({ lead, contacts }: EnrichInput): Promise<EnrichOutput> {
    const now = new Date().toISOString();
    const enrichments: Enrichment[] = [];

    // Enrich up to 10 contacts that have an email address.
    const withEmail = contacts.filter((c) => Boolean(c.email)).slice(0, 10);
    for (const contact of withEmail) {
      const person = await tryFetch<ClearbitPerson>(`${PERSON_BASE}/people/find`, {
        email: contact.email!,
      });
      if (person) {
        enrichments.push({
          subjectType: "contact",
          subjectKey: contact.email!,
          provider: "clearbit",
          verifiedEmail: contact.email,
          phone: typeof person.phone === "string" ? person.phone : undefined,
          data: person as Record<string, unknown>,
          fetchedAt: now,
        });
      }
    }

    // One company enrichment keyed by domain.
    if (lead.domain) {
      const company = await tryFetch<ClearbitCompany>(`${COMPANY_BASE}/companies/find`, {
        domain: lead.domain,
      });
      if (company) {
        enrichments.push({
          subjectType: "lead",
          subjectKey: lead.domain,
          provider: "clearbit",
          data: company as Record<string, unknown>,
          fetchedAt: now,
        });
      }
    }

    return { enrichments };
  },
};
