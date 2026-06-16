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
 */

import { httpJson } from "../http.js";
import { getSecret, hasSecret } from "../secrets.js";
import type { Enrichment } from "../models.js";
import type {
  Connector,
  EnrichInput,
  EnrichOutput,
} from "./types.js";

const BASE = "https://api.crunchbase.com/v4/data";
const KEY_ENV = "CRUNCHBASE_API_KEY";

function headers(): Record<string, string> {
  return { "X-cb-user-key": getSecret(KEY_ENV) };
}

/** Defensive shape for a single entity returned by /searches/organizations. */
interface CbOrg {
  identifier?: { permalink?: string; value?: string };
  website_url?: string;
  funding_total?: { value_usd?: number };
  last_funding_type?: string;
  last_funding_at?: string;
  num_funding_rounds?: number;
  investors?: Array<{ identifier?: { value?: string } }>;
}

interface CbSearchResponse {
  entities?: Array<{
    identifier?: { value?: string };
    properties?: CbOrg;
  }>;
  count?: number;
}

export const crunchbaseConnector: Connector = {
  name: "crunchbase",
  displayName: "Crunchbase",
  tier: "paid",
  keyEnvVar: KEY_ENV,
  phases: ["enrich"],
  note: "Paid (Pro $99/mo+); funding, investors, valuation. Free tier discontinued.",

  isConfigured() {
    return hasSecret(KEY_ENV);
  },

  async enrich({ lead }: EnrichInput): Promise<EnrichOutput> {
    const res = await httpJson<CbSearchResponse>(
      `${BASE}/searches/organizations`,
      {
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
      },
    );

    // Defensive: Crunchbase wraps fields in properties; flatten whichever shape arrived.
    const entity = res.entities?.[0];
    const props: CbOrg = entity?.properties ?? {};

    // Investors array: each element may carry identifier.value (org name) or be absent.
    const investors = (props.investors ?? [])
      .map((i) => i?.identifier?.value)
      .filter((v): v is string => typeof v === "string" && v.length > 0);

    const totalRaisedRaw = props.funding_total?.value_usd;

    const funding: Enrichment["funding"] = {
      lastRound: props.last_funding_type ?? undefined,
      totalRaisedUsd:
        typeof totalRaisedRaw === "number" && totalRaisedRaw >= 0
          ? totalRaisedRaw
          : undefined,
      lastRoundDate: props.last_funding_at ?? undefined,
      investors: investors.length > 0 ? investors : undefined,
    };

    const enrichment: Enrichment = {
      subjectType: "lead",
      subjectKey: lead.domain,
      provider: "crunchbase",
      funding,
      data: (entity ?? {}) as Record<string, unknown>,
      fetchedAt: new Date().toISOString(),
    };

    return { enrichments: [enrichment], raw: res };
  },
};
