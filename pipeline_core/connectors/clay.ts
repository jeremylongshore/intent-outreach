/**
 * pipeline_core/connectors/clay.ts — Clay connector.
 *
 * IMPORTANT: Clay is an enrichment aggregator / middleware platform, NOT a direct
 * data-source API. It has no synchronous company-lookup REST endpoint that returns
 * lead/contact records in a single call. Instead, Clay operates via:
 *   1. A configured "table" that runs enrichment workflows inside the user's Clay
 *      workspace when rows are pushed to it.
 *   2. A webhook URL that triggers that table workflow.
 *
 * This connector is therefore PUSH-ONLY:
 *   - research() POSTs the target domain to the user's Clay table webhook.
 *   - Results are enriched inside Clay asynchronously and land in the user's Clay
 *     workspace — they do NOT return synchronously here.
 *   - The caller receives { leads: [], contacts: [], raw: { pushed: domain } } to
 *     signal "queued" rather than "data". Downstream stages that need the Clay
 *     output must read it from the user's Clay table (or wherever they have routed
 *     Clay's webhook output) — all local; this system never hosts that callback.
 *
 * Auth: CLAY_API_KEY is sent as Authorization: Bearer <key>.
 * The webhook URL is stored separately as CLAY_WEBHOOK_URL (typically a URL like
 * https://api.clay.com/tables/<table_id>/rows or a custom Clay webhook).
 *
 * isConfigured() requires BOTH secrets — without the webhook URL the push has no
 * destination and there is nothing to do.
 */

import { httpJson, HttpError } from "../http.js";
import { getSecret, hasSecret } from "../secrets.js";
import type { Connector, ResearchInput, ResearchOutput } from "./types.js";

const KEY_ENV = "CLAY_API_KEY";
const WEBHOOK_ENV = "CLAY_WEBHOOK_URL";

function headers(): Record<string, string> {
  return { Authorization: `Bearer ${getSecret(KEY_ENV)}` };
}

export const clayConnector: Connector = {
  name: "clay",
  displayName: "Clay",
  tier: "paid",
  keyEnvVar: KEY_ENV,
  phases: ["research"],
  note: "Middleware, not a direct data source. Push-only: requires a configured Clay table webhook (CLAY_WEBHOOK_URL); results return asynchronously into the user's Clay workspace, not synchronously here.",

  isConfigured() {
    // Both the API key and the target webhook URL are required.
    // Missing either means there is no actionable Clay integration to run.
    return hasSecret(KEY_ENV) && hasSecret(WEBHOOK_ENV);
  },

  async research({ domain, icp }: ResearchInput): Promise<ResearchOutput> {
    // Push the domain into the user's Clay enrichment table via the webhook.
    // Clay will kick off its configured enrichment workflow asynchronously.
    // There is no synchronous response that contains lead or contact records.
    try {
      await httpJson<unknown>(getSecret(WEBHOOK_ENV), {
        method: "POST",
        headers: headers(),
        json: { domain, icp },
      });
    } catch (err) {
      // The webhook URL can itself be the secret (token in the path). Never let it
      // reach the error message — surface the status only.
      const status = err instanceof HttpError ? err.status : "error";
      throw new Error(`Clay webhook push failed (${status})`);
    }

    // Return an empty result with a raw marker so the pipeline records the push
    // in the audit trail. The caller should NOT interpret leads/contacts as empty
    // meaning "no results" — it means "results are being built in Clay".
    return {
      leads: [],
      contacts: [],
      raw: { pushed: domain },
    };
  },
};
