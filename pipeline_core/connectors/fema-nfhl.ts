/**
 * pipeline_core/connectors/fema-nfhl.ts — FEMA National Flood Hazard Layer.
 *
 * Source (000-docs/035 §2): the NFHL "Flood Hazard Zones" layer, queried by
 * point. Adds `floodZone` (FLD_ZONE: A, AE, AO, VE, X ...), `sfha` (inside the
 * Special Flood Hazard Area) and, when present, `floodZoneSubtype` to every
 * property that has a `location` and no flood facts yet. Free, keyless,
 * read-only. A US federal work. The flood zone is INFORMATIONAL: never an
 * insurance or lending determination, and a draft must never present it as one.
 *
 * The host resets connections often, so calls retry with backoff; one failed
 * point is recorded as an item failure and the rest still enrich. A point on a
 * boundary can hit several polygons: the most hazardous wins (SFHA first, then
 * V* over A* over the rest).
 */

import { createHash } from "node:crypto";
import { z } from "zod";
import { httpJson } from "../http.js";
import type { Fact, LicenseTerms, Property } from "../models.js";
import { parseVendor, publicRecordsEnabled } from "./_shared.js";
import type { Connector, ConnectorItemFailure, PropertyEnrichInput, PropertyEnrichOutput } from "./types.js";
import { HttpError } from "../http.js";

export const FEMA_NFHL_URL = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query";
const SOURCE = "fema-nfhl";
const TERMS: LicenseTerms = { id: "fema-nfhl", outreachRestricted: false, attribution: "FEMA National Flood Hazard Layer" };

const ZoneSchema = z.object({
  attributes: z
    .object({
      FLD_ZONE: z.string().nullable().optional(),
      ZONE_SUBTY: z.string().nullable().optional(),
      SFHA_TF: z.string().nullable().optional(),
    })
    .passthrough(),
});
const ResponseSchema = z.object({ features: z.array(ZoneSchema).default([]) });
type Zone = z.infer<typeof ZoneSchema>["attributes"];

/** Rank: inside the SFHA beats outside; within that, coastal V* > A* > the rest. */
function hazard(z: Zone): number {
  const zone = (z.FLD_ZONE ?? "").toUpperCase();
  const sfha = z.SFHA_TF === "T" ? 100 : 0;
  return sfha + (zone.startsWith("V") ? 3 : zone.startsWith("A") ? 2 : zone ? 1 : 0);
}

export function mostHazardous(zones: readonly Zone[]): Zone | undefined {
  return [...zones].sort((a, b) => hazard(b) - hazard(a))[0];
}

export const femaNfhlConnector: Connector = {
  name: SOURCE,
  displayName: "FEMA flood zones (NFHL)",
  tier: "free",
  keyEnvVar: null,
  phases: ["enrich"],
  capabilities: ["flood"],
  rateLimit: { perMinute: 60 },
  note: "Free, keyless (INTENT_OUTREACH_PUBLIC_RECORDS=0 turns it off). Flood zone by parcel point; informational, never an insurance or lending determination.",

  isConfigured() {
    return publicRecordsEnabled();
  },

  async enrichProperties({ properties, signal }: PropertyEnrichInput): Promise<PropertyEnrichOutput> {
    const out: Property[] = [];
    const failures: ConnectorItemFailure[] = [];
    for (let i = 0; i < properties.length; i++) {
      const p = properties[i]!;
      if (!p.location || p.attributes.floodZone) continue;
      try {
        const body = await httpJson<unknown>(FEMA_NFHL_URL, {
          signal,
          retries: 3,
          rateLimit: { key: SOURCE, perMinute: 60 },
          query: {
            geometry: `${p.location.lon},${p.location.lat}`,
            geometryType: "esriGeometryPoint",
            inSR: "4326",
            spatialRel: "esriSpatialRelIntersects",
            outFields: "FLD_ZONE,ZONE_SUBTY,SFHA_TF",
            returnGeometry: "false",
            f: "json",
          },
        });
        const zone = mostHazardous(parseVendor(ResponseSchema, body).features.map((f) => f.attributes));
        if (!zone?.FLD_ZONE) continue;
        const fetchedAt = new Date().toISOString();
        const responseHash = createHash("sha256").update(JSON.stringify(body)).digest("hex");
        const fact = <T>(value: T): Fact<T> => ({ value, source: SOURCE, fetchedAt, responseHash, licenseTerms: TERMS });
        out.push({
          ...p,
          attributes: {
            floodZone: fact(zone.FLD_ZONE),
            sfha: fact(zone.SFHA_TF === "T"),
            ...(zone.ZONE_SUBTY ? { floodZoneSubtype: fact(zone.ZONE_SUBTY) } : {}),
          },
        });
      } catch (err) {
        if (signal?.aborted) throw err;
        failures.push({ item: i, reason: err instanceof HttpError ? "http" : "error", ...(err instanceof HttpError ? { status: err.status } : {}) });
      }
    }
    return { properties: out, failures };
  },
};
