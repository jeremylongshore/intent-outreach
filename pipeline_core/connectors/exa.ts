/**
 * pipeline_core/connectors/exa.ts — Exa connector.
 *
 * Exa is a web-search API, not a people/contact database. It returns rich web
 * results (news, funding mentions, company pages) keyed by query. Use it for
 * research-phase context and enrich-phase web intel; it produces NO contact
 * records. Uses a bring-your-own provider key.
 *
 * Endpoints (auth via x-api-key header):
 *   - Search: POST https://api.exa.ai/search
 *
 * The enrich query carries the CURRENT year from an injectable clock (it used to
 * hardcode "2026"). The full payload is returned only as `raw` (audit trail),
 * never duplicated into enrichment `data`.
 */

import { z } from "zod";
import { httpJson } from "../http.js";
import { hasSecret } from "../secrets.js";
import type { Enrichment, Lead } from "../models.js";
import { parseVendor, useSecret } from "./_shared.js";
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
  return { "x-api-key": useSecret(KEY_ENV) };
}

const ExaResultSchema = z
  .object({
    title: z.string().nullish(),
    url: z.string().nullish(),
    text: z.string().nullish(),
    highlights: z.array(z.string()).nullish(),
  })
  .passthrough();
type ExaResult = z.infer<typeof ExaResultSchema>;
const ExaSearchSchema = z.object({ results: z.array(ExaResultSchema).nullish() }).passthrough();

let clock: () => Date = () => new Date();

/** Inject the clock used for the enrich query's year. Tests only. */
export function _setExaClock(fn: (() => Date) | null): void {
  clock = fn ?? (() => new Date());
}

/** Pull the best single-sentence snippet from a result for a Lead description. */
function topSnippet(result: ExaResult): string | undefined {
  const raw = result.highlights?.[0] ?? result.text?.slice(0, 200) ?? result.title;
  return raw?.trim() || undefined;
}

export const exaConnector: Connector = {
  name: "exa",
  displayName: "Exa",
  tier: "free",
  keyEnvVar: KEY_ENV,
  phases: ["research", "enrich"],
  note: "Credential required; check current provider access and quota terms. Web research context (news and funding mentions), not contact records.",

  isConfigured() {
    return hasSecret(KEY_ENV);
  },

  async research({ domain, signal }: ResearchInput): Promise<ResearchOutput> {
    const res = parseVendor(
      ExaSearchSchema,
      await httpJson(`${BASE}/search`, {
        signal,
        method: "POST",
        headers: headers(),
        // Exa returns page content only when asked: without `contents` a result is
        // metadata only (title, url, dates), and the lead description fell back to
        // the page title. Highlights are Exa's token-efficient extraction.
        json: { query: "company at " + domain, numResults: 5, type: "auto", contents: { highlights: true } },
      }),
    );

    const top = res.results?.[0];
    const lead: Lead = {
      domain,
      companyName: domain,
      description: top !== undefined ? topSnippet(top) : undefined,
      source: "exa",
    };

    return { leads: [lead], contacts: [], raw: res };
  },

  async enrich({ lead, signal }: EnrichInput): Promise<EnrichOutput> {
    const year = clock().getUTCFullYear();
    const res = parseVendor(
      ExaSearchSchema,
      await httpJson(`${BASE}/search`, {
        signal,
        method: "POST",
        headers: headers(),
        json: { query: `${lead.companyName} funding news ${year}`, numResults: 5 },
      }),
    );

    const webContext = (res.results ?? []).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
    }));

    const enrichment: Enrichment = {
      subjectType: "lead",
      subjectKey: lead.domain,
      provider: "exa",
      data: { webContext },
      fetchedAt: new Date().toISOString(),
    };

    return { enrichments: [enrichment], raw: res };
  },
};
