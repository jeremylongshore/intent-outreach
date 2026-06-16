/**
 * pipeline_core/connectors/exa.ts — Exa connector.
 *
 * Exa is a web-search API, not a people/contact database. It returns rich web
 * results (news, funding mentions, company pages) keyed by query. Use it for
 * research-phase context and enrich-phase web intel; it produces NO contact
 * records. Self-serve BYO-key with 1k free searches per month.
 *
 * Endpoints (auth via x-api-key header):
 *   - Search: POST https://api.exa.ai/search
 */

import { httpJson } from "../http.js";
import { getSecret, hasSecret } from "../secrets.js";
import type { Enrichment, Lead } from "../models.js";
import type {
  Connector,
  EnrichInput,
  EnrichOutput,
  ResearchInput,
  ResearchOutput,
} from "./types.js";

const BASE = "https://api.exa.ai";
const KEY_ENV = "EXA_API_KEY";

function headers(): Record<string, string> {
  return { "x-api-key": getSecret(KEY_ENV) };
}

interface ExaResult {
  title?: string;
  url?: string;
  text?: string;
  highlights?: string[];
}
interface ExaSearchResponse {
  results?: ExaResult[];
}

/** Pull the best single-sentence snippet from a result for a Lead description. */
function topSnippet(result: ExaResult): string | undefined {
  const raw =
    result.highlights?.[0] ??
    result.text?.slice(0, 200) ??
    result.title;
  return raw?.trim() || undefined;
}

export const exaConnector: Connector = {
  name: "exa",
  displayName: "Exa",
  tier: "free",
  keyEnvVar: KEY_ENV,
  phases: ["research", "enrich"],
  note: "Self-serve key; 1k free/mo. Web research context (news, funding mentions), not contact records.",

  isConfigured() {
    return hasSecret(KEY_ENV);
  },

  async research({ domain }: ResearchInput): Promise<ResearchOutput> {
    const res = await httpJson<ExaSearchResponse>(`${BASE}/search`, {
      method: "POST",
      headers: headers(),
      json: { query: "company at " + domain, numResults: 5, type: "auto" },
    });

    const top = res.results?.[0];
    const lead: Lead = {
      domain,
      companyName: domain,
      description: top !== undefined ? topSnippet(top) : undefined,
      source: "exa",
    };

    return { leads: [lead], contacts: [], raw: res };
  },

  async enrich({ lead }: EnrichInput): Promise<EnrichOutput> {
    const res = await httpJson<ExaSearchResponse>(`${BASE}/search`, {
      method: "POST",
      headers: headers(),
      json: {
        query: lead.companyName + " funding news 2026",
        numResults: 5,
      },
    });

    const results = res.results ?? [];
    const webContext = results.map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
    }));

    const now = new Date().toISOString();
    const enrichment: Enrichment = {
      subjectType: "lead",
      subjectKey: lead.domain,
      provider: "exa",
      data: { webContext, _raw: res as Record<string, unknown> },
      fetchedAt: now,
    };

    return { enrichments: [enrichment], raw: res };
  },
};
