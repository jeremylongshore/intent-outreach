/**
 * pipeline_core/connectors/fl-dor-parcels.ts — Florida statewide parcels (DOR tax roll).
 *
 * Source (000-docs/035 §1.5): the Florida Department of Revenue roll as
 * published by FDEP / FGIO on ArcGIS Online. One schema for every Florida
 * county: owner, mailing address, situs, just value, use code, year built,
 * last sales. It is an ANNUAL snapshot (up to ~15 months stale on ownership)
 * and owner names are cut at 30 characters. Free, keyless, read-only.
 *
 * Answers `parcel` queries (county FIPS + APN) and `area` queries (Florida
 * ZIPs, optionally narrowed to counties). Anything outside Florida returns
 * nothing without a request. Records whose names or addresses are masked
 * (Ch. 119 F.S. confidential owners) are dropped: never emitted as a party,
 * never re-identified.
 *
 * License: the publisher states no use restriction (DOR does not own the data;
 * each county property appraiser does). Records are stamped
 * `{ id: "fl-dor-roll", outreachRestricted: false }` with attribution.
 */

import { createHash } from "node:crypto";
import { z } from "zod";
import { httpJson } from "../http.js";
import type { Address, Fact, LicenseTerms, Ownership, Party, Property, ResearchQuery } from "../models.js";
import { propertyKey } from "../models.js";
import { parseVendor, publicRecordsEnabled } from "./_shared.js";
import type { Connector, ResearchInput, ResearchOutput } from "./types.js";

export const FL_DOR_URL =
  "https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Cadastral/FeatureServer/0/query";

/** County FIPS → DOR county number (`CO_NO`, not FIPS). Verified for the counties the packs work. */
export const FL_DOR_COUNTY: Readonly<Record<string, number>> = { "12033": 27, "12091": 56 };
const FIPS_BY_CO_NO: Readonly<Record<number, string>> = Object.fromEntries(
  Object.entries(FL_DOR_COUNTY).map(([fips, co]) => [co, fips]),
);

const SOURCE = "fl-dor-parcels";
const TERMS: LicenseTerms = {
  id: "fl-dor-roll",
  outreachRestricted: false,
  attribution: "Florida Department of Revenue tax roll (via FDEP/FGIO); data owned by each county property appraiser",
};
/** Florida 5-digit ZIPs start 320–349. */
const isFloridaZip = (z: string) => /^3[2-4]\d{3}$/.test(z);
const PAGE = 500;
const OUT_FIELDS = [
  "PARCEL_ID", "CO_NO", "OWN_NAME", "OWN_ADDR1", "OWN_ADDR2", "OWN_CITY", "OWN_STATE", "OWN_ZIPCD", "OWN_STATE_",
  "PHY_ADDR1", "PHY_ADDR2", "PHY_CITY", "PHY_ZIPCD", "JV", "JV_HMSTD", "DOR_UC", "ACT_YR_BLT", "TOT_LVG_AR",
  "SALE_PRC1", "SALE_YR1", "SALE_MO1", "LND_SQFOOT",
].join(",");

const Num = z.union([z.number(), z.string()]).nullable().optional();
const Str = z.string().nullable().optional();
const FeatureSchema = z.object({
  attributes: z
    .object({
      PARCEL_ID: z.string(),
      CO_NO: z.number(),
      OWN_NAME: Str,
      OWN_ADDR1: Str,
      OWN_ADDR2: Str,
      OWN_CITY: Str,
      OWN_STATE: Str,
      OWN_ZIPCD: Num,
      OWN_STATE_: Str,
      PHY_ADDR1: Str,
      PHY_ADDR2: Str,
      PHY_CITY: Str,
      PHY_ZIPCD: Num,
      JV: Num,
      JV_HMSTD: Num,
      DOR_UC: Str,
      ACT_YR_BLT: Num,
      TOT_LVG_AR: Num,
      SALE_PRC1: Num,
      SALE_YR1: Num,
      SALE_MO1: Str,
      LND_SQFOOT: Num,
    })
    .passthrough(),
  centroid: z.object({ x: z.number(), y: z.number() }).optional(),
});
const ResponseSchema = z.object({
  features: z.array(FeatureSchema).default([]),
  exceededTransferLimit: z.boolean().optional(),
  error: z.object({ message: z.string().optional() }).passthrough().optional(),
});
type Row = z.infer<typeof FeatureSchema>;

const clean = (v: unknown): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t : undefined;
};
const num = (v: unknown): number | undefined => {
  const n = typeof v === "string" ? Number(v.trim()) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
};
const zip5 = (v: unknown): string | undefined => {
  const n = num(v);
  if (n === undefined || n <= 0) return undefined;
  return String(Math.trunc(n)).padStart(5, "0").slice(0, 5);
};
/** A run of asterisks is a Ch. 119 F.S. confidential mask. */
const masked = (...vals: unknown[]) => vals.some((v) => typeof v === "string" && /\*{3,}/.test(v));

// OWN_NAME is cut at 30 characters, so the suffix words also match as truncated STEMS
// ("HOUSING AUTHORIT", "UTILITIES AUTH", "DEPARTM", "CORPORA").
const ESTATE_RE = /\b(EST|ESTATE|ESTATE OF|DECD|DECEASED|HEIRS?)\b/i;
const TRUST_RE = /\b(TRUSTS?|TRUSTEES?|TRS|TR)\b/i;
const GOV_RE =
  /\b(COUNTY|CITY OF|STATE OF|BOARD OF|SCHOOL|UNITED STATES|USA|TOWN OF|AUTH\w*|DISTRICT|DEPT|DEPART\w*|UTILIT\w*|GOVERNM\w*|HOUSING AUTH\w*)\b/i;
const ENTITY_RE =
  /\b(LLC|L\.?L\.?C|INC|CORP\w*|COMPANY|LTD|LP|LLP|PARTNERSHIP|BANK|ASSOCIA\w*|ASSN|HOLDINGS?|PROPERTIES|INVESTMENTS?|CHURCH|MINISTRIES)\b/i;

function entityType(name: string): Party["entityType"] {
  if (ESTATE_RE.test(name)) return "estate"; // probate first: never let a dead owner read as a person
  if (GOV_RE.test(name)) return "government";
  if (TRUST_RE.test(name)) return "trust";
  if (/\bL\.?L\.?C\b/i.test(name)) return "llc";
  if (/\b(INC|CORP\w*)\b/i.test(name)) return "corporation";
  if (/\b(LP|LLP|PARTNERSHIP|LTD)\b/i.test(name)) return "partnership";
  return "other";
}

const isEntityName = (name: string) => ESTATE_RE.test(name) || GOV_RE.test(name) || TRUST_RE.test(name) || ENTITY_RE.test(name);

/**
 * A stable party key from name + full mailing address, so one owner of several
 * parcels is one party. With no usable mailing address the parcel is part of the
 * key: two same-named owners abroad are never merged.
 */
function partyKey(name: string, mailing: Address | undefined, parcelKey: string): string {
  const where = mailing ? `${mailing.line1}|${mailing.line2 ?? ""}|${mailing.city}|${mailing.zip}` : `no-mailing|${parcelKey}`;
  const basis = `${name.toUpperCase()}|${where.toUpperCase()}`;
  return `fl-dor:${createHash("sha256").update(basis).digest("hex").slice(0, 16)}`;
}

/** Map one DOR row to the v6 property model; undefined for masked or unusable rows. */
export function mapFlDorRow(
  row: Row,
  fetchedAt: string,
  responseHash: string,
): { property: Property; party?: Party; ownership?: Ownership } | undefined {
  const a = row.attributes;
  const fips = FIPS_BY_CO_NO[a.CO_NO];
  const apn = clean(a.PARCEL_ID);
  if (!fips || !apn) return undefined;
  if (masked(a.OWN_NAME, a.OWN_ADDR1, a.PHY_ADDR1)) return undefined;

  const fact = <T>(value: T): Fact<T> => ({ value, source: SOURCE, fetchedAt, responseHash, licenseTerms: TERMS });
  const attributes: Property["attributes"] = {};
  const jv = num(a.JV);
  if (jv !== undefined && jv > 0) attributes.justValueCents = fact(Math.round(jv * 100));
  const uc = clean(a.DOR_UC);
  if (uc) attributes.landUseCode = fact(uc);
  const yb = num(a.ACT_YR_BLT);
  if (yb !== undefined && yb > 1700) attributes.yearBuilt = fact(yb);
  const lv = num(a.TOT_LVG_AR);
  if (lv !== undefined && lv > 0) attributes.livingAreaSqft = fact(lv);
  const ls = num(a.LND_SQFOOT);
  if (ls !== undefined && ls > 0) attributes.landSqft = fact(ls);
  const hs = num(a.JV_HMSTD);
  if (hs !== undefined) attributes.homesteadExemption = fact(hs > 0);
  const salePrice = num(a.SALE_PRC1);
  const saleYear = num(a.SALE_YR1);
  const saleMonth = clean(a.SALE_MO1);
  if (salePrice !== undefined && salePrice > 0) attributes.lastSalePriceCents = fact(Math.round(salePrice * 100));
  // A sale date needs a real year AND a month 1-12; a blank or bad month never becomes a fabricated date.
  const month = saleMonth && /^\d{1,2}$/.test(saleMonth) ? Number(saleMonth) : undefined;
  const year = saleYear !== undefined && saleYear > 1800 && saleYear < 2200 ? Math.trunc(saleYear) : undefined;
  const saleDate = year !== undefined && month !== undefined && month >= 1 && month <= 12 ? `${year}-${String(month).padStart(2, "0")}-01` : undefined;
  if (saleDate) attributes.lastSaleDate = fact(saleDate);
  else if (year !== undefined) attributes.lastSaleYear = fact(year);

  const situsZip = zip5(a.PHY_ZIPCD);
  const situs = clean(a.PHY_ADDR1);
  const city = clean(a.PHY_CITY);
  const address: Address | undefined =
    situs && city && situsZip ? { line1: situs, ...(clean(a.PHY_ADDR2) ? { line2: clean(a.PHY_ADDR2)! } : {}), city, state: "FL", zip: situsZip, countyFips: fips } : undefined;

  const property: Property = {
    key: propertyKey(fips, apn),
    apn: apn.toUpperCase(),
    countyFips: fips,
    ...(address ? { address } : {}),
    ...(row.centroid ? { location: { lat: row.centroid.y, lon: row.centroid.x } } : {}),
    attributes,
    source: SOURCE,
  };

  const name = clean(a.OWN_NAME);
  if (!name) return { property };
  const mState = clean(a.OWN_STATE)?.toUpperCase();
  const mZip = zip5(a.OWN_ZIPCD);
  const mLine = clean(a.OWN_ADDR1);
  const mCity = clean(a.OWN_CITY);
  const foreign = clean(a.OWN_STATE_);
  const mailing: Address | undefined =
    mLine && mCity && mState && /^[A-Z]{2}$/.test(mState) && mZip && !foreign
      ? { line1: mLine, ...(clean(a.OWN_ADDR2) ? { line2: clean(a.OWN_ADDR2)! } : {}), city: mCity, state: mState, zip: mZip }
      : undefined;
  const isEntity = isEntityName(name);
  const party: Party = {
    key: partyKey(name, mailing, propertyKey(fips, apn)),
    kind: isEntity ? "entity" : "person",
    name,
    ...(isEntity ? { entityType: entityType(name) } : {}),
    ...(mailing ? { mailingAddress: mailing } : {}),
    source: SOURCE,
    licenseTerms: TERMS,
  };
  const ownership: Ownership = {
    propertyKey: property.key,
    partyKey: party.key,
    role: "owner",
    ...(saleDate ? { asOf: saleDate } : {}),
    source: SOURCE,
    fetchedAt,
  };
  return { property, party, ownership };
}

const sqlString = (v: string) => `'${v.replace(/'/g, "''")}'`;
/** LIKE patterns: drop the wildcards a caller's text could carry. */
const likePrefix = (v: string) => sqlString(`${v.replace(/[%_]/g, "").toUpperCase()}%`);
const ALL_COUNTIES = Object.values(FL_DOR_COUNTY);

/** The WHERE clause for a query, or undefined when the query is not for Florida. */
export function flDorWhere(query: ResearchQuery): string | undefined {
  if (query.kind === "parcel") {
    const co = query.countyFips ? FL_DOR_COUNTY[query.countyFips] : undefined;
    if (co && query.apn) return `CO_NO=${co} AND PARCEL_ID=${sqlString(query.apn.replace(/[-\s.]/g, "").toUpperCase())}`;
    if (query.address && query.address.state === "FL") {
      const zip = query.address.zip.slice(0, 5);
      // The live layer refuses a ZIP filter without a county filter (HTTP 400; 000-docs/035 §1.5).
      return `CO_NO IN (${ALL_COUNTIES.join(",")}) AND PHY_ZIPCD=${Number(zip)} AND PHY_ADDR1 LIKE ${likePrefix(query.address.line1)}`;
    }
    return undefined;
  }
  if (query.kind === "area") {
    const zips = (query.geography.zips ?? []).filter(isFloridaZip);
    const asked = query.geography.countyFips;
    const counties = (asked ?? []).map((f) => FL_DOR_COUNTY[f]).filter((c): c is number => c !== undefined);
    // Counties asked for but none covered here: answer nothing rather than widen the query.
    if (asked && asked.length > 0 && counties.length === 0) return undefined;
    if (zips.length === 0 && counties.length === 0) return undefined;
    const parts = [`CO_NO IN (${(counties.length > 0 ? counties : ALL_COUNTIES).join(",")})`];
    if (zips.length > 0) parts.push(`PHY_ZIPCD IN (${zips.map(Number).join(",")})`);
    return parts.join(" AND ");
  }
  return undefined;
}

export const flDorParcelsConnector: Connector = {
  name: SOURCE,
  displayName: "Florida statewide parcels (DOR roll)",
  tier: "free",
  keyEnvVar: null,
  phases: ["research"],
  queryKinds: ["parcel", "area"],
  capabilities: ["parcel", "property.search"],
  cacheTtlMs: 7 * 24 * 3_600_000, // an annual roll: a week-old answer is as good as a fresh one
  rateLimit: { perMinute: 60 },
  note: "Free, keyless (INTENT_OUTREACH_PUBLIC_RECORDS=0 turns it off). Annual DOR roll snapshot; owner names cut at 30 characters. Confidential owners are dropped.",

  isConfigured() {
    return publicRecordsEnabled();
  },

  async research({ query, signal }: ResearchInput): Promise<ResearchOutput> {
    const empty: ResearchOutput = { leads: [], contacts: [] };
    if (!query) return empty;
    const where = flDorWhere(query);
    if (!where) return empty;
    const asked = Number(query.kind === "area" ? query.filters.maxRecords : undefined);
    const max = query.kind === "area" ? (Number.isFinite(asked) && asked >= 1 ? Math.min(Math.trunc(asked), 5000) : 500) : 50;

    const properties: Property[] = [];
    const parties: Party[] = [];
    const ownerships: Ownership[] = [];
    for (let offset = 0; offset < max; offset += PAGE) {
      const body = await httpJson<unknown>(FL_DOR_URL, {
        signal,
        retries: 2,
        rateLimit: { key: SOURCE, perMinute: 60 },
        query: {
          where,
          outFields: OUT_FIELDS,
          returnGeometry: "false",
          returnCentroid: "true",
          outSR: "4326",
          orderByFields: "OBJECTID",
          resultOffset: offset,
          resultRecordCount: Math.min(PAGE, max - offset),
          f: "json",
        },
      });
      const page = parseVendor(ResponseSchema, body);
      if (page.error) throw new Error(`fl-dor-parcels: query failed (${page.error.message ?? "unknown"})`);
      const fetchedAt = new Date().toISOString();
      const hash = createHash("sha256").update(JSON.stringify(body)).digest("hex");
      for (const row of page.features) {
        const mapped = mapFlDorRow(row, fetchedAt, hash);
        if (!mapped) continue;
        properties.push(mapped.property);
        if (mapped.party) parties.push(mapped.party);
        if (mapped.ownership) ownerships.push(mapped.ownership);
      }
      if (!page.exceededTransferLimit || page.features.length === 0) break;
    }
    return { leads: [], contacts: [], properties, parties, ownerships };
  },
};
