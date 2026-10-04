/**
 * pipeline_core/connectors/crunchbase.ts — Crunchbase connector (enrich only).
 *
 * Paid tier (Pro $99/mo+). Best used when funding signals matter to the ICP.
 * Free tier was discontinued; a valid Pro or Enterprise API key is required.
 *
 * Auth: X-cb-user-key header. Base: https://api.crunchbase.com/v4/data.
 *
 * Endpoint: POST /searches/organizations
 *   Filters by domain (website_url facet) and requests funding field_ids.
 *   NOTE: the exact field_ids below were current as of the Crunchbase v4 docs
 *   reviewed during connector research (018-DR-LAND). Confirm against
 *   https://data.crunchbase.com/docs/field-reference before production use —
 *   field names in v4 have changed across minor API revisions.
 *
 * No matching entity → no enrichment (never a fabricated empty record).
 */

import { z } from "zod";
import { httpJson } from "../http.js";
import { hasSecret } from "../secrets.js";
import type { Enrichment } from "../models.js";
import { parseVendor, useSecret } from "./_shared.js";
import type { Connector, EnrichInput, EnrichOutput } from "./types.js";

const BASE = "https://api.crunchbase.com/v4/data";
const KEY_ENV = "CRUNCHBASE_API_KEY";

function headers(): Record<string, string> {
  return { "X-cb-user-key": useSecret(KEY_ENV) };
}

const IdentifierSchema = z
  .object({ permalink: z.string().nullish(), value: z.string().nullish() })
  .passthrough();

/** Tolerant shape for one entity's properties from /searches/organizations. */
const CbOrgSchema = z
  .object({
    identifier: IdentifierSchema.nullish(),
    website_url: z.string().nullish(),
    funding_total: z.object({ value_usd: z.number().nullish() }).passthrough().nullish(),
    last_funding_type: z.string().nullish(),
    last_funding_at: z.string().nullish(),
    num_funding_rounds: z.number().nullish(),
    investors: z
      .array(z.object({ identifier: IdentifierSchema.nullish() }).passthrough().nullish())
      .nullish(),
  })
  .passthrough();

const CbSearchSchema = z
  .object({
    entities: z
      .array(
        z
          .object({ identifier: IdentifierSchema.nullish(), properties: CbOrgSchema.nullish() })
          .passthrough(),
      )
      .nullish(),
    count: z.number().nullish(),
  })
  .passthrough();

export const crunchbaseConnector: Connector = {
  name: "crunchbase",
  displayName: "Crunchbase",
  tier: "paid",
  keyEnvVar: KEY_ENV,
  phases: ["enrich"],
  note: "Paid provider access required; check current terms. Covers funding, investors, and valuation.",

  isConfigured() {
    return hasSecret(KEY_ENV);
  },

  async enrich({ lead }: EnrichInput): Promise<EnrichOutput> {
    const res = parseVendor(
      CbSearchSchema,
      await httpJson(`${BASE}/searches/organizations`, {
        method: "POST",
        headers: headers(),
        json: {
          field_ids: [
            "funding_total",
            "last_funding_type",
            "last_funding_at",
            "num_funding_rounds",
            "investors",
            "website_url",
          ],
          predicate: {
            field_id: "website_url",
            operator_id: "domain_eq",
            values: [lead.domain],
          },
          limit: 1,
        },
      }),
    );

    // No matching organization → no enrichment.
    const entity = res.entities?.[0];
    if (!entity) return { enrichments: [], raw: res };
    const props = entity.properties ?? {};

    // Investors array: each element may carry identifier.value (org name) or be absent.
    const investors = (props.investors ?? [])
      .map((i) => i?.identifier?.value)
      .filter((v): v is string => typeof v === "string" && v.length > 0);

    const totalRaisedRaw = props.funding_total?.value_usd;

    const funding: Enrichment["funding"] = {
      lastRound: props.last_funding_type ?? undefined,
      totalRaisedUsd:
        typeof totalRaisedRaw === "number" && totalRaisedRaw >= 0 ? totalRaisedRaw : undefined,
      lastRoundDate: props.last_funding_at ?? undefined,
      investors: investors.length > 0 ? investors : undefined,
    };

    const enrichment: Enrichment = {
      subjectType: "lead",
      subjectKey: lead.domain,
      provider: "crunchbase",
      funding,
      data: entity as Record<string, unknown>,
      fetchedAt: new Date().toISOString(),
    };

    return { enrichments: [enrichment], raw: res };
  },
};
