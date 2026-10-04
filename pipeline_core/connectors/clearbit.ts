/**
 * pipeline_core/connectors/clearbit.ts — Clearbit (legacy) connector.
 *
 * NOTE: Clearbit was acquired by HubSpot in 2023 and folded into HubSpot Breeze
 * Intelligence. New API keys are no longer issued. This connector works only with
 * an existing compatible credential; availability is controlled by the provider.
 *
 * Endpoints (Clearbit v2, auth via Authorization: Bearer <key>):
 *   - Person lookup:  GET https://person.clearbit.com/v2/people/find?email=<email>
 *   - Company lookup: GET https://company.clearbit.com/v2/companies/find?domain=<domain>
 *
 * Clearbit is asynchronous for new lookups — the endpoint may return HTTP 202
 * (Accepted) with an empty body, or a body like {"error": {...}} / a "queued"
 * marker, while it fetches data in the background. All of those are treated as
 * "no data this call" rather than as a record. Results appear synchronously on
 * subsequent calls once Clearbit has cached the lookup.
 */

import { z } from "zod";
import { httpJson } from "../http.js";
import { hasSecret } from "../secrets.js";
import type { Enrichment } from "../models.js";
import { forEachContact, isAuthFailure, isNotFound, toFailure } from "./_per-item.js";
import { parseVendor, useSecret } from "./_shared.js";
import type { Connector, ConnectorItemFailure, EnrichInput, EnrichOutput } from "./types.js";

const PERSON_BASE = "https://person.clearbit.com/v2";
const COMPANY_BASE = "https://company.clearbit.com/v2";
const KEY_ENV = "CLEARBIT_API_KEY";

function headers(): Record<string, string> {
  return { Authorization: "Bearer " + useSecret(KEY_ENV) };
}

const ClearbitPersonSchema = z
  .object({
    email: z.string().nullish(),
    name: z.object({ fullName: z.string().nullish() }).passthrough().nullish(),
    phone: z.string().nullish(),
  })
  .passthrough();

const ClearbitCompanySchema = z
  .object({ name: z.string().nullish(), domain: z.string().nullish() })
  .passthrough();

/**
 * True when a 2xx body is Clearbit's "still looking it up" response rather than
 * a record: empty/non-object, an `error` key, or an explicit queued/pending marker.
 */
export function isClearbitPending(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return true;
  const o = body as Record<string, unknown>;
  if (Object.keys(o).length === 0) return true;
  if ("error" in o) return true;
  if (o.pending === true || o.queued === true) return true;
  const status = typeof o.status === "string" ? o.status.toLowerCase() : "";
  return status === "queued" || status === "pending";
}

/** GET a Clearbit lookup; null when Clearbit has no (ready) record. */
async function tryFetch<S extends z.ZodType>(
  schema: S,
  url: string,
  query: Record<string, string>,
  signal?: AbortSignal,
): Promise<z.infer<S> | null> {
  const body = await httpJson<unknown>(url, { method: "GET", headers: headers(), query, signal });
  if (isClearbitPending(body)) return null;
  return parseVendor(schema, body);
}

export const clearbitConnector: Connector = {
  name: "clearbit",
  displayName: "Clearbit (legacy)",
  tier: "legacy",
  keyEnvVar: KEY_ENV,
  phases: ["enrich"],
  note: "Legacy connector for existing compatible credentials; check current HubSpot/Clearbit availability.",

  isConfigured() {
    return hasSecret(KEY_ENV);
  },

  async enrich({ lead, contacts, signal }: EnrichInput): Promise<EnrichOutput> {
    const now = new Date().toISOString();

    // Person lookups are email-keyed (name irrelevant); per-item isolation.
    const { results, failures } = await forEachContact<Enrichment>(
      contacts,
      10,
      async (contact) => {
        const person = await tryFetch(ClearbitPersonSchema, `${PERSON_BASE}/people/find`, {
          email: contact.email!,
        }, signal);
        if (!person) return null;
        return {
          subjectType: "contact",
          subjectKey: contact.email!,
          provider: "clearbit",
          verifiedEmail: contact.email,
          phone: typeof person.phone === "string" ? person.phone : undefined,
          data: person as Record<string, unknown>,
          fetchedAt: now,
        };
      },
      { requireFullName: false, filter: (c) => Boolean(c.email) },
    );

    const enrichments: Enrichment[] = [...results];
    const allFailures: ConnectorItemFailure[] = [...failures];

    // One company enrichment keyed by domain.
    if (lead.domain) {
      try {
        const company = await tryFetch(ClearbitCompanySchema, `${COMPANY_BASE}/companies/find`, {
          domain: lead.domain,
        }, signal);
        if (company) {
          enrichments.push({
            subjectType: "lead",
            subjectKey: lead.domain,
            provider: "clearbit",
            data: company as Record<string, unknown>,
            fetchedAt: now,
          });
        }
      } catch (err) {
        if (isAuthFailure(err)) throw err;
        if (!isNotFound(err)) allFailures.push(toFailure(-1, err));
      }
    }

    return { enrichments, failures: allFailures, raw: { failures: allFailures } };
  },
};
