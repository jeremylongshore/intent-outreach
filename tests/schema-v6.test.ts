/**
 * tests/schema-v6.test.ts — the property/owner data model and the typed
 * research query (schema v6).
 *
 *   • v6 is current; v1–v5 still parse (invariant 6), and the legacy golden
 *     fixture gains empty property-model arrays rather than failing.
 *   • Property / Party / Ownership / EntityLink / ContactPoint / Fact validate,
 *     including the refinements that keep keys and channels honest.
 *   • ContactPoint DNC defaults to "unknown" (fail closed).
 *   • A v6 run with the property model round-trips through the JSONL store.
 *   • runResearchQuery routes by each connector's declared query kinds, in
 *     registration order: a B2B connector never sees a parcel query.
 */

import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ContactPointSchema,
  EntityLinkSchema,
  FactSchema,
  OwnershipSchema,
  PartySchema,
  PropertySchema,
  ResearchQuerySchema,
  SCHEMA_VERSION,
  SUPPORTED_SCHEMA_VERSIONS,
  propertyKey,
} from "../pipeline_core/models.js";
import { assertCampaignRun, validateCampaignRun } from "../pipeline_core/validator.js";
import { JsonlRunStore } from "../pipeline_core/store.js";
import { _resetBuiltins, acceptsQuery, registerConnector } from "../pipeline_core/connectors/index.js";
import type { Connector, ResearchInput } from "../pipeline_core/connectors/types.js";
import { mergePropertyModel, runCampaign, runResearch, runResearchQuery } from "../pipeline_core/pipeline.js";
import { normalizePhone } from "../pipeline_core/compliance/index.js";
import { registerPack } from "../pipeline_core/packs/index.js";
import { noopCompliance } from "../pipeline_core/packs/types.js";
import { PROPERTY_PII } from "../pipeline_core/pii-policy.js";
import type { LLMProvider } from "../pipeline_core/providers.js";
import type { ContactPoint } from "../pipeline_core/models.js";
import { _resetSecretCache } from "../pipeline_core/secrets.js";

const T = "2026-10-06T12:00:00.000Z";
const HASH = "a".repeat(64);

const property = {
  key: propertyKey("01003", " 05-43-09-32-0-000-012.000 "),
  apn: "05-43-09-32-0-000-012.000",
  countyFips: "01003",
  address: { line1: "1204 W Beach Blvd", city: "Gulf Shores", state: "AL", zip: "36542" },
  attributes: {
    yearBuilt: { value: 1998, source: "baldwin-gis", fetchedAt: T, responseHash: HASH },
    floodZone: { value: "VE", source: "fema-nfhl", fetchedAt: T, licenseTerms: { id: "public-record" } },
  },
  source: "baldwin-gis",
};

const baseRun = {
  id: "run-v6",
  icp: "absentee owners of Gulf Shores beach houses",
  domains: [],
  vertical: "residential-re",
  provider: "anthropic",
  model: "fixture-model",
  status: "researched",
  createdAt: T,
};

describe("schema v6 versioning", () => {
  it("v6 is current and every older version still parses", () => {
    expect(SCHEMA_VERSION).toBe(6);
    expect([...SUPPORTED_SCHEMA_VERSIONS]).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("every legacy golden-fixture line parses and gains empty property-model arrays", () => {
    const lines = readFileSync(resolve("tests/fixtures/runs.legacy.jsonl"), "utf8").split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const r = validateCampaignRun(JSON.parse(line));
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.properties).toEqual([]);
        expect(r.value.parties).toEqual([]);
        expect(r.value.ownerships).toEqual([]);
        expect(r.value.entityLinks).toEqual([]);
        expect(r.value.contactPoints).toEqual([]);
        expect(r.value.queries).toBeUndefined();
      }
    }
  });
});

describe("Property / Fact", () => {
  it("parses a parcel with fact attributes; propertyKey trims and uppercases the APN", () => {
    expect(property.key).toBe("01003:05-43-09-32-0-000-012.000");
    const r = PropertySchema.safeParse(property);
    expect(r.success).toBe(true);
  });

  it("rejects an apn with surrounding whitespace", () => {
    expect(PropertySchema.safeParse({ ...property, apn: ` ${property.apn} ` }).success).toBe(false);
  });

  it("rejects a key that does not match countyFips + apn", () => {
    expect(PropertySchema.safeParse({ ...property, key: "01097:05-43-09-32-0-000-012.000" }).success).toBe(false);
  });

  it.each([
    ["county FIPS not 5 digits", { countyFips: "1003" }],
    ["state not a 2-letter code", { address: { ...property.address, state: "Alabama" } }],
    ["bad ZIP", { address: { ...property.address, zip: "3654" } }],
  ])("rejects %s", (_why, patch) => {
    const p = { ...property, ...patch };
    expect(PropertySchema.safeParse({ ...p, key: propertyKey(p.countyFips, p.apn) }).success).toBe(false);
  });

  it("a fact needs a source and fetch time; the response hash must be sha256 hex", () => {
    expect(FactSchema.safeParse({ value: 1, source: "x", fetchedAt: T }).success).toBe(true);
    expect(FactSchema.safeParse({ value: 1, fetchedAt: T }).success).toBe(false);
    expect(FactSchema.safeParse({ value: 1, source: "x", fetchedAt: T, responseHash: "abc" }).success).toBe(false);
  });
});

describe("Party / Ownership / EntityLink", () => {
  it("parses an LLC owner, its ownership and the person behind it", () => {
    expect(
      PartySchema.safeParse({ key: "entity:AL:000123", kind: "entity", name: "Beach Holdings LLC", entityType: "llc", source: "opencorporates" }).success,
    ).toBe(true);
    const own = OwnershipSchema.parse({ propertyKey: property.key, partyKey: "entity:AL:000123", source: "baldwin-gis", fetchedAt: T });
    expect(own.role).toBe("owner");
    expect(
      EntityLinkSchema.safeParse({ entityKey: "entity:AL:000123", personKey: "person:1", role: "manager", confidence: 0.82, source: "opencorporates", fetchedAt: T }).success,
    ).toBe(true);
  });

  it("rejects an ownership share outside (0, 1] and a confidence outside [0, 1]", () => {
    const own = { propertyKey: property.key, partyKey: "p", source: "s", fetchedAt: T };
    expect(OwnershipSchema.safeParse({ ...own, share: 0 }).success).toBe(false);
    expect(OwnershipSchema.safeParse({ ...own, share: 1.5 }).success).toBe(false);
    expect(OwnershipSchema.safeParse({ ...own, share: 0.5 }).success).toBe(true);
    const link = { entityKey: "e", personKey: "p", role: "member", source: "s", fetchedAt: T };
    expect(EntityLinkSchema.safeParse({ ...link, confidence: 1.2 }).success).toBe(false);
  });
});

describe("ContactPoint", () => {
  const phone = { partyKey: "person:1", kind: "phone", value: "+12515550100", source: "skiptrace", fetchedAt: T };

  it("DNC status defaults to unknown (fail closed)", () => {
    expect(ContactPointSchema.parse(phone).dnc).toBe("unknown");
  });

  it("a phone must be E.164 and an email must be an email", () => {
    expect(ContactPointSchema.safeParse({ ...phone, value: "(251) 555-0100" }).success).toBe(false);
    expect(ContactPointSchema.safeParse({ ...phone, value: "+0123456789" }).success).toBe(false); // country code can't start with 0
    expect(() => normalizePhone("+0123456789")).toThrow();
    expect(ContactPointSchema.safeParse({ ...phone, kind: "email", value: "not-an-email" }).success).toBe(false);
    expect(ContactPointSchema.safeParse({ ...phone, kind: "email", value: "owner@example.com" }).success).toBe(true);
    expect(ContactPointSchema.safeParse({ ...phone, kind: "mail", value: "1204 W Beach Blvd, Gulf Shores, AL 36542" }).success).toBe(true);
  });
});

describe("ResearchQuery", () => {
  it.each([
    [{ kind: "domain", domain: "acme.com" }, true],
    [{ kind: "area", geography: { countyFips: ["01003"] }, filters: { absentee: true } }, true],
    [{ kind: "area", geography: {} }, false], // an area with no geography
    [{ kind: "parcel", countyFips: "01003", apn: "05-43" }, true],
    [{ kind: "parcel", address: property.address }, true],
    [{ kind: "parcel", apn: "05-43" }, false], // an APN without its county is ambiguous
    [{ kind: "zip", zip: "36542" }, false],
  ])("%j parses: %s", (q, ok) => {
    expect(ResearchQuerySchema.safeParse(q).success).toBe(ok);
  });
});

describe("CampaignRun v6", () => {
  const run = {
    ...baseRun,
    schemaVersion: 6,
    queries: [{ kind: "area", geography: { zips: ["36542"] }, filters: {} }],
    properties: [property],
    parties: [{ key: "person:1", kind: "person", name: "Pat Owner", source: "baldwin-gis" }],
    ownerships: [{ propertyKey: property.key, partyKey: "person:1", source: "baldwin-gis", fetchedAt: T }],
    contactPoints: [{ partyKey: "person:1", kind: "phone", value: "+12515550100", source: "skiptrace", fetchedAt: T }],
  };

  it("round-trips the property model through the JSONL store", async () => {
    const store = new JsonlRunStore(join(mkdtempSync(join(tmpdir(), "io-v6-")), "runs.jsonl"));
    await store.saveRun(assertCampaignRun(run));
    const back = await store.getRun("run-v6");
    expect(back?.schemaVersion).toBe(6);
    expect(back?.properties[0]?.key).toBe(property.key);
    expect(back?.properties[0]?.attributes.floodZone?.value).toBe("VE");
    expect(back?.contactPoints[0]?.dnc).toBe("unknown");
    expect(back?.queries?.[0]?.kind).toBe("area");
  });

  it("an invalid nested record rejects the whole run (nothing un-validated is stored)", () => {
    const bad = { ...run, contactPoints: [{ ...run.contactPoints[0], value: "251-555-0100" }] };
    expect(validateCampaignRun(bad).ok).toBe(false);
  });
});

// ── runResearchQuery routing ────────────────────────────────────────────────

function recorder(name: string, kinds: Connector["queryKinds"], calls: string[], out: object = {}): Connector {
  return {
    name,
    displayName: name,
    tier: "free",
    keyEnvVar: null,
    phases: ["research"],
    ...(kinds ? { queryKinds: kinds } : {}),
    isConfigured: () => true,
    async research(input: ResearchInput) {
      calls.push(`${name}:${input.query?.kind}:${input.domain}`);
      return { leads: [], contacts: [], ...out };
    },
  };
}

describe("runResearchQuery", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    _resetBuiltins();
    _resetSecretCache();
    for (const k of Object.keys(process.env)) {
      if (k.endsWith("_API_KEY") || k === "ZOOMINFO_JWT" || k === "CLAY_WEBHOOK_URL") delete process.env[k];
    }
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("acceptsQuery defaults to domain only", () => {
    const calls: string[] = [];
    expect(acceptsQuery(recorder("b2b", undefined, calls), "domain")).toBe(true);
    expect(acceptsQuery(recorder("b2b", undefined, calls), "parcel")).toBe(false);
  });

  it("a parcel query reaches only parcel connectors, in registration order", async () => {
    const calls: string[] = [];
    registerConnector(recorder("b2b", undefined, calls));
    registerConnector(recorder("county-gis", ["parcel", "area"], calls, { properties: [property] }));
    registerConnector(recorder("skiptrace", ["parcel"], calls));
    const r = await runResearchQuery({ kind: "parcel", countyFips: "01003", apn: property.apn }, "icp");
    expect(calls).toEqual(["county-gis:parcel:", "skiptrace:parcel:"]);
    expect(r.ran).toEqual(["county-gis", "skiptrace"]);
    expect(r.properties.map((p) => p.key)).toEqual([property.key]);
    expect(r.leads).toEqual([]);
  });

  it("a domain query never reaches a property-only connector, and passes the typed query", async () => {
    const calls: string[] = [];
    registerConnector(recorder("county-gis", ["parcel"], calls));
    registerConnector(recorder("b2b", undefined, calls));
    const r = await runResearch("https://WWW.Acme.com/", "icp");
    expect(calls).toEqual(["b2b:domain:acme.com"]);
    expect(r.ran).toEqual(["b2b"]);
    expect(r.properties).toEqual([]);
  });

  it("dedupes the property model by natural key, first connector wins", async () => {
    const calls: string[] = [];
    const party = { key: "person:1", kind: "person", name: "Pat Owner", source: "a" };
    const cp = { partyKey: "person:1", kind: "phone", value: "+12515550100", source: "a", fetchedAt: T, dnc: "unknown" };
    registerConnector(recorder("a", ["area"], calls, { properties: [property], parties: [party], contactPoints: [cp] }));
    registerConnector(
      recorder("b", ["area"], calls, {
        properties: [{ ...property, source: "b" }],
        parties: [{ ...party, source: "b" }],
        contactPoints: [{ ...cp, source: "b" }],
      }),
    );
    const r = await runResearchQuery({ kind: "area", geography: { zips: ["36542"] }, filters: {} }, "icp");
    expect(r.properties).toHaveLength(1);
    expect(r.properties[0]?.source).toBe("baldwin-gis");
    expect(r.parties.map((p) => p.source)).toEqual(["a"]);
    expect(r.contactPoints.map((c) => c.source)).toEqual(["a"]);
  });

  it("a configured connector that does not answer the kind is neither run nor skipped", async () => {
    const calls: string[] = [];
    registerConnector(recorder("b2b", undefined, calls));
    const r = await runResearchQuery({ kind: "area", geography: { state: "AL" }, filters: {} }, "icp");
    expect(r.ran).toEqual([]);
    expect(r.skipped).not.toContain("b2b");
    expect(calls).toEqual([]);
  });
});

describe("mergePropertyModel", () => {
  const cp = (patch: Partial<ContactPoint>): ContactPoint => ({
    partyKey: "p",
    kind: "phone",
    value: "+12515550100",
    dnc: "unknown",
    source: "a",
    fetchedAt: T,
    ...patch,
  });
  const empty = { properties: [], parties: [], ownerships: [], entityLinks: [] };

  it.each([
    [["clean", "listed"], "listed"],
    [["listed", "clean"], "listed"],
    [["clean", "unknown"], "unknown"],
    [["unknown", "clean"], "unknown"],
    [["clean", "clean"], "clean"],
  ] as const)("DNC %j merges to the most restrictive (%s)", (statuses, expected) => {
    const merged = mergePropertyModel({ ...empty, contactPoints: statuses.map((dnc) => cp({ dnc })) });
    expect(merged.contactPoints).toHaveLength(1);
    expect(merged.contactPoints[0]?.dnc).toBe(expected);
  });

  it("an outreach restriction from any source sticks", () => {
    const merged = mergePropertyModel({
      ...empty,
      contactPoints: [cp({ licenseTerms: { id: "free" } }), cp({ source: "b", licenseTerms: { outreachRestricted: true } })],
    });
    expect(merged.contactPoints[0]?.licenseTerms).toEqual({ id: "free", outreachRestricted: true });
    expect(merged.contactPoints[0]?.source).toBe("a");
  });

  it("emails dedupe case-insensitively; a known line type fills an unknown one", () => {
    const merged = mergePropertyModel({
      ...empty,
      contactPoints: [
        cp({ kind: "email", value: "Owner@Example.com" }),
        cp({ kind: "email", value: "owner@example.com" }),
        cp({ lineType: "unknown" }),
        cp({ lineType: "mobile" }),
      ],
    });
    expect(merged.contactPoints).toHaveLength(2);
    expect(merged.contactPoints.find((c) => c.kind === "phone")?.lineType).toBe("mobile");
  });

  it("keeps each distinct ownership role for the same party and parcel", () => {
    const own = { propertyKey: property.key, partyKey: "p", source: "a", fetchedAt: T };
    const merged = mergePropertyModel({
      ...empty,
      contactPoints: [],
      ownerships: [
        { ...own, role: "owner" },
        { ...own, role: "trustee" },
        { ...own, role: "owner", source: "b" },
      ],
    });
    expect(merged.ownerships.map((o) => `${o.role}:${o.source}`)).toEqual(["owner:a", "trustee:a"]);
  });
});

describe("runCampaign carries the property model into the run", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    _resetBuiltins();
    _resetSecretCache();
    for (const k of Object.keys(process.env)) {
      if (k.endsWith("_API_KEY") || k === "ZOOMINFO_JWT" || k === "CLAY_WEBHOOK_URL") delete process.env[k];
    }
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("a pack opting into owner PII preserves property data from a domain connector", async () => {
    const calls: string[] = [];
    registerConnector(
      recorder("parcel-on-domain", undefined, calls, {
        properties: [property],
        contactPoints: [{ partyKey: "person:1", kind: "phone", value: "+12515550100", source: "x", fetchedAt: T, dnc: "listed" }],
      }),
    );
    const provider = {
      name: "anthropic",
      model: "stub",
      generateObject: async () => {
        throw new Error("no lead, so the model must not be called");
      },
    } as unknown as LLMProvider;
    registerPack({ id: "v6-carry", displayName: "Property PII", compliance: noopCompliance, piiPolicy: PROPERTY_PII, prompts: { score: [], draft: "unused" } });
    const { run } = await runCampaign({ pack: "v6-carry", id: "run-v6-carry", icp: "x", domains: ["acme.com"], provider, now: () => T });
    expect(run.schemaVersion).toBe(6);
    expect(run.properties.map((p) => p.key)).toEqual([property.key]);
    expect(run.contactPoints[0]?.dnc).toBe("listed");
  });
});
