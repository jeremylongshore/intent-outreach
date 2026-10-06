/**
 * tests/property-connectors.test.ts — Phase 6b: the free public-records
 * connectors, against recorded fixtures (tests/fixtures/property/, 000-docs/035).
 *
 *   • fl-dor-parcels: WHERE building (Florida only; anything else makes no
 *     request), mapping to the v6 model (key, situs, centroid, cents, sale
 *     date, entity/government owners, license terms), masked confidential rows
 *     dropped, foreign mailing addresses omitted, paging.
 *   • fema-nfhl: point lookup, the most hazardous zone wins, skips, failures.
 *   • INTENT_OUTREACH_PUBLIC_RECORDS=0 turns both off.
 *   • End to end: runPropertyCampaign drafts an Escambia absentee owner with a
 *     flood fact, and blocks a government owner.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_SUPPRESSION_LIST } from "../pipeline_core/compliance/suppression.js";
import { _resetBuiltins } from "../pipeline_core/connectors/index.js";
import { femaNfhlConnector, mostHazardous } from "../pipeline_core/connectors/fema-nfhl.js";
import { FL_DOR_URL, flDorParcelsConnector, flDorWhere, mapFlDorRow } from "../pipeline_core/connectors/fl-dor-parcels.js";
import type { Property } from "../pipeline_core/models.js";
import { _resetPacks } from "../pipeline_core/packs/index.js";
import { runPropertyCampaign } from "../pipeline_core/property-campaign.js";
import { PropertyScoreOutputSchema } from "../pipeline_core/property-seam.js";
import type { LLMProvider } from "../pipeline_core/providers.js";
import { _resetSecretCache } from "../pipeline_core/secrets.js";

const fixture = (name: string) => JSON.parse(readFileSync(resolve("tests/fixtures/property", name), "utf8"));
const DOR = fixture("florida-dor-statewide-escambia-parcel.json");
const ROW = DOR.features[0];
const T = "2026-10-06T15:00:00.000Z";

/** A private-owner variant of the recorded government row, in the Perdido Key service area. */
const personRow = {
  attributes: {
    ...ROW.attributes,
    PARCEL_ID: "999S999999999999",
    OWN_NAME: "DOE JANE",
    OWN_ADDR1: "9 ELM ST",
    OWN_CITY: "NASHVILLE",
    OWN_STATE: "TN",
    OWN_ZIPCD: 37201,
    PHY_ADDR1: "14 PERDIDO KEY DR",
    PHY_CITY: "PENSACOLA",
    PHY_ZIPCD: 32507,
    JV: 412000,
    ACT_YR_BLT: 1998,
    SALE_PRC1: 300000,
    SALE_YR1: 2006,
    SALE_MO1: "5",
  },
  centroid: { x: -87.42, y: 30.3 },
};

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

const saved = { ...process.env };
beforeEach(() => {
  process.env.INTENT_OUTREACH_PUBLIC_RECORDS = "1";
  _resetSecretCache();
  _resetBuiltins();
  _resetPacks();
});
afterEach(() => {
  process.env = { ...saved };
  _resetSecretCache();
  vi.restoreAllMocks();
});

describe("fl-dor-parcels: query building", () => {
  it("builds Florida-only WHERE clauses; anything else is undefined", () => {
    expect(flDorWhere({ kind: "parcel", countyFips: "12033", apn: "08-2S-30-5005-000-002" })).toBe(
      "CO_NO=27 AND PARCEL_ID='082S305005000002'",
    );
    expect(flDorWhere({ kind: "area", geography: { zips: ["32507", "36542"] }, filters: {} })).toBe("PHY_ZIPCD IN (32507)");
    expect(flDorWhere({ kind: "area", geography: { countyFips: ["12091"], zips: ["32548"] }, filters: {} })).toBe(
      "PHY_ZIPCD IN (32548) AND CO_NO IN (56)",
    );
    expect(flDorWhere({ kind: "parcel", countyFips: "01003", apn: "123" })).toBeUndefined();
    expect(flDorWhere({ kind: "area", geography: { zips: ["36542"] }, filters: {} })).toBeUndefined();
    expect(flDorWhere({ kind: "domain", domain: "acme.com" })).toBeUndefined();
    // SQL quotes are escaped.
    expect(flDorWhere({ kind: "parcel", countyFips: "12033", apn: "A'B" })).toBe("CO_NO=27 AND PARCEL_ID='A''B'");
  });

  it("a non-Florida query makes no request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const out = await flDorParcelsConnector.research!({ domain: "", icp: "x", query: { kind: "area", geography: { zips: ["36542"] }, filters: {} } });
    expect(out.properties ?? []).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("fl-dor-parcels: mapping", () => {
  it("maps the recorded government parcel: key, situs, cents, government owner, license terms", () => {
    const m = mapFlDorRow(ROW, T, "a".repeat(64))!;
    expect(m.property.key).toBe("12033:082S305005000002");
    expect(m.property.address).toMatchObject({ line1: "4109 N PALAFOX ST", city: "PENSACOLA", state: "FL", zip: "32505" });
    expect(m.property.attributes.justValueCents?.value).toBe(7_268_000);
    expect(m.property.attributes.landUseCode?.value).toBe("086");
    expect(m.property.attributes.yearBuilt).toBeUndefined(); // 0 = unknown
    expect(m.party).toMatchObject({ kind: "entity", entityType: "government", name: "ESCAMBIA COUNTY BOARD OF COUNT" });
    expect(m.party?.licenseTerms).toMatchObject({ id: "fl-dor-roll", outreachRestricted: false });
    expect(m.ownership).toMatchObject({ propertyKey: m.property.key, partyKey: m.party?.key, role: "owner" });
  });

  it("maps a private owner with a sale, a centroid and an out-of-state mailing address", () => {
    const m = mapFlDorRow(personRow, T, "a".repeat(64))!;
    expect(m.property.location).toEqual({ lat: 30.3, lon: -87.42 });
    expect(m.property.attributes.lastSalePriceCents?.value).toBe(30_000_000);
    expect(m.property.attributes.lastSaleDate?.value).toBe("2006-05-01");
    expect(m.property.attributes.yearBuilt?.value).toBe(1998);
    expect(m.party).toMatchObject({ kind: "person", mailingAddress: { line1: "9 ELM ST", state: "TN", zip: "37201" } });
    expect(m.ownership?.asOf).toBe("2006-05-01");
  });

  it("drops masked confidential rows and omits foreign mailing addresses", () => {
    expect(mapFlDorRow({ ...personRow, attributes: { ...personRow.attributes, OWN_NAME: "********************" } }, T, "a".repeat(64))).toBeUndefined();
    const foreign = mapFlDorRow({ ...personRow, attributes: { ...personRow.attributes, OWN_STATE: "ON", OWN_STATE_: "CANADA" } }, T, "a".repeat(64))!;
    expect(foreign.party?.mailingAddress).toBeUndefined();
  });

  it("one owner of two parcels is one party", () => {
    const a = mapFlDorRow(personRow, T, "a".repeat(64))!;
    const b = mapFlDorRow({ ...personRow, attributes: { ...personRow.attributes, PARCEL_ID: "999S999999999998" } }, T, "a".repeat(64))!;
    expect(a.party?.key).toBe(b.party?.key);
    expect(a.property.key).not.toBe(b.property.key);
  });

  it("pages while the server says the transfer limit was exceeded", async () => {
    const pages = [
      { ...DOR, features: [personRow], exceededTransferLimit: true },
      { ...DOR, features: [ROW], exceededTransferLimit: false },
    ];
    const fetch = vi.fn(async () => json(pages.shift()));
    vi.stubGlobal("fetch", fetch);
    const out = await flDorParcelsConnector.research!({
      domain: "",
      icp: "x",
      query: { kind: "area", geography: { zips: ["32507"] }, filters: { maxRecords: 1000 } },
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(out.properties?.map((p) => p.apn)).toEqual(["999S999999999999", "082S305005000002"]);
    expect(String((fetch.mock.calls[0] as unknown[])[0])).toContain(FL_DOR_URL);
  });
});

describe("fema-nfhl", () => {
  const SFHA = fixture("fema-nfhl-point-sfha.json");
  const X = fixture("fema-nfhl-point-zone-x.json");
  const prop = (key: string, location?: Property["location"]): Property => ({
    key,
    apn: key.split(":")[1]!,
    countyFips: "12033",
    attributes: {},
    source: "t",
    ...(location ? { location } : {}),
  });

  it("the most hazardous zone wins: SFHA first, then V over A over X", () => {
    expect(mostHazardous([{ FLD_ZONE: "X", SFHA_TF: "F" }, { FLD_ZONE: "AE", SFHA_TF: "T" }])?.FLD_ZONE).toBe("AE");
    expect(mostHazardous([{ FLD_ZONE: "AE", SFHA_TF: "T" }, { FLD_ZONE: "VE", SFHA_TF: "T" }])?.FLD_ZONE).toBe("VE");
  });

  it("adds floodZone/sfha by point; skips properties without a location or with a zone already", async () => {
    const replies = [SFHA, X];
    const fetch = vi.fn(async () => json(replies.shift()));
    vi.stubGlobal("fetch", fetch);
    const known: Property = { ...prop("12033:3", { lat: 30, lon: -87 }), attributes: { floodZone: { value: "X", source: "t", fetchedAt: T } } };
    const out = await femaNfhlConnector.enrichProperties!({
      properties: [prop("12033:1", { lat: 30.2462, lon: -87.7 }), prop("12033:2"), known, prop("12033:4", { lat: 30.27, lon: -87.69 })],
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(out.properties.map((p) => [p.key, p.attributes.floodZone?.value, p.attributes.sfha?.value])).toEqual([
      ["12033:1", "AE", true],
      ["12033:4", "X", false],
    ]);
    expect(out.properties[1]?.attributes.floodZoneSubtype?.value).toBe("0.2 PCT ANNUAL CHANCE FLOOD HAZARD");
  });

  it("a failed point is an item failure; the rest still enrich", async () => {
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => (n++ === 0 ? new Response("nope", { status: 404 }) : json(X))),
    );
    const out = await femaNfhlConnector.enrichProperties!({
      properties: [prop("12033:1", { lat: 30, lon: -87 }), prop("12033:2", { lat: 30.1, lon: -87.1 })],
    });
    expect(out.failures).toEqual([{ item: 0, reason: "http", status: 404 }]);
    expect(out.properties.map((p) => p.key)).toEqual(["12033:2"]);
  });

  it("INTENT_OUTREACH_PUBLIC_RECORDS=0 turns both connectors off", () => {
    expect(femaNfhlConnector.isConfigured()).toBe(true);
    process.env.INTENT_OUTREACH_PUBLIC_RECORDS = "0";
    _resetSecretCache();
    expect(femaNfhlConnector.isConfigured()).toBe(false);
    expect(flDorParcelsConnector.isConfigured()).toBe(false);
  });
});

describe("end to end: an Escambia campaign on public records", () => {
  it("drafts the absentee private owner with the flood fact and blocks the county", async () => {
    const SFHA = fixture("fema-nfhl-point-sfha.json");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        const u = String(url);
        if (u.startsWith(FL_DOR_URL)) return json({ ...DOR, features: [personRow, { ...ROW, attributes: { ...ROW.attributes, PHY_ZIPCD: 32507 } }] });
        if (u.includes("hazards.fema.gov")) return json(SFHA);
        throw new Error(`unexpected ${u}`);
      }),
    );
    const prompts: string[] = [];
    const provider = {
      name: "anthropic",
      model: "stub",
      async generateObject({ schema, prompt }: { schema: unknown; prompt: string }) {
        prompts.push(prompt);
        const usage = { inputTokens: 1, outputTokens: 1, costUsd: 0 };
        return schema === PropertyScoreOutputSchema
          ? { object: { score: 80, band: "hot", reasons: ["absenteeOwner: true"] }, usage }
          : { object: { decline: false, declineReason: null, subject: null, body: "About 14 Perdido Key Dr, built in 1998.", cta: "Would a free estimate help?" }, usage };
      },
    } as unknown as LLMProvider;
    const { run } = await runPropertyCampaign({
      id: "e2e-escambia",
      icp: "Listing agent for Perdido Key",
      queries: [{ kind: "area", geography: { zips: ["32507"] }, filters: {} }],
      provider,
      sender: {
        name: "Pat Agent",
        company: "Example Realty",
        postalAddress: "100 Main St\nFoley, AL 36535",
        licenses: [{ state: "FL", number: "SL000", brokerage: "Example Realty" }],
      },
      suppressions: EMPTY_SUPPRESSION_LIST,
      now: () => T,
    });
    expect(run.messages).toHaveLength(1);
    expect(run.messages[0]?.propertyKey).toBe("12033:999S999999999999");
    expect(run.blockedContacts.map((b) => b.reason)).toEqual(["owner:government"]);
    expect(run.properties.find((p) => p.apn === "999S999999999999")?.attributes.floodZone?.value).toBe("AE");
    expect(prompts[0]).toContain('"floodZone":"AE"');
    expect(prompts[0]).toContain('"absenteeOwner":true');
  });
});
