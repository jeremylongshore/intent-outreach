import { mkdtempSync, readFileSync, readdirSync, statSync, utimesSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { BUSINESS_PII, PROPERTY_PII, minimizeProperty, minimizeResearch } from "../pipeline_core/pii-policy.js";
import { _resetBuiltins, registerConnector } from "../pipeline_core/connectors/index.js";
import type { ResearchOutput } from "../pipeline_core/connectors/types.js";
import { mergePropertyModel, runEnrich, runResearchQuery, runPropertyEnrich } from "../pipeline_core/pipeline.js";
import { FileResponseCache } from "../pipeline_core/routing.js";
import { checkMonitor, purgeExpiredSnapshots, readSnapshot } from "../pipeline_core/monitors.js";

const T = Date.parse("2026-10-07T00:00:00Z");
const DAY = 86_400_000;
const fact = (value: unknown) => ({ value, source: "fixture", fetchedAt: new Date(T).toISOString(), licenseTerms: { retentionDays: 2, outreachRestricted: false } });
function result(): ResearchOutput {
  return {
    leads: [], contacts: [],
    properties: [{ key: "01003:1", apn: "1", countyFips: "01003", source: "fixture", attributes: {
      yearBuilt: fact(1990), age: fact(72), hiddenNotes: fact("private personal details"),
      listingStatus: fact({ status: "active", exclusiveUntil: "2026-11-01", mobilePhone: "+12515559999" }),
      distressSignals: fact(["probate"]),
    } }],
    parties: [{ key: "person:1", kind: "person", name: "Needed Owner", source: "fixture", licenseTerms: { outreachRestricted: false } }],
    ownerships: [{ propertyKey: "01003:1", partyKey: "person:1", role: "owner", source: "fixture", fetchedAt: new Date(T).toISOString() }],
    contactPoints: [{ partyKey: "person:1", kind: "phone", value: "+12515551234", dnc: "listed", source: "fixture", fetchedAt: new Date(T).toISOString(), licenseTerms: { retentionDays: 1, outreachRestricted: true } }],
    raw: { ssn: "never-cache-this" },
  };
}
const query = { kind: "parcel", countyFips: "01003", apn: "1" } as const;
beforeEach(() => _resetBuiltins());

it("business results omit owner contact data; property results retain typed contact/DNC/license provenance and gate signals", () => {
  const raw = result();
  const business = minimizeResearch(raw, BUSINESS_PII);
  expect(business.parties).toBeUndefined();
  expect(business.contactPoints).toBeUndefined();
  const property = minimizeResearch(raw, PROPERTY_PII);
  expect(property.contactPoints).toEqual(raw.contactPoints);
  expect(property.properties![0]!.attributes).toEqual({
    yearBuilt: fact(1990), listingStatus: fact({ status: "active", exclusiveUntil: "2026-11-01" }), distressSignals: fact(["probate"]),
  });
  expect(raw.properties![0]!.attributes).toHaveProperty("age"); // caller unchanged
});

it("trusted pack code can allow an extra property fact but cannot restore a protected person field", () => {
  const property = result().properties![0]!;
  const normalized = minimizeProperty(property, { kind: "property-owner", propertyAttributes: ["hiddenNotes", "age"] });
  expect(normalized.attributes).toHaveProperty("hiddenNotes");
  expect(normalized.attributes).not.toHaveProperty("age");
});

it("cache identity includes the policy and values are minimized before writing; vendor retention caps TTL", async () => {
  let calls = 0;
  registerConnector({ name: "pii", displayName: "Fixture", tier: "free", keyEnvVar: null, phases: ["research"], queryKinds: ["parcel"], cacheTtlMs: 30 * DAY, isConfigured: () => true,
    async research() { calls++; return result(); } });
  const dir = mkdtempSync(join(tmpdir(), "io-pii-cache-"));
  const cache = new FileResponseCache(dir);
  const options = { cache, clock: () => T };
  await runResearchQuery(query, "x", { ...options, piiPolicy: PROPERTY_PII });
  const bytes = readFileSync(join(dir, readdirSync(dir)[0]!), "utf8");
  expect(bytes).toContain("+12515551234");
  for (const forbidden of ["never-cache-this", "private personal details", "mobilePhone", '"age"']) expect(bytes).not.toContain(forbidden);
  expect(JSON.parse(bytes).expiresAt).toBe(T + DAY);
  expect((await runResearchQuery(query, "x", { ...options, piiPolicy: PROPERTY_PII })).cached).toEqual(["pii"]);
  expect((await runResearchQuery(query, "x", { ...options, piiPolicy: BUSINESS_PII })).contactPoints).toEqual([]);
  expect(calls).toBe(2);
});

it("a forged cache value is re-minimized on read", async () => {
  registerConnector({ name: "pii", displayName: "Fixture", tier: "free", keyEnvVar: null, phases: ["research"], queryKinds: ["parcel"], cacheTtlMs: DAY, isConfigured: () => true,
    async research() { throw new Error("cache should answer"); } });
  const cache = { get: async () => result(), set: async () => {} };
  const out = await runResearchQuery(query, "x", { cache, clock: () => T });
  expect(out.cached).toEqual(["pii"]);
  expect(out.properties[0]!.attributes).not.toHaveProperty("age");
});

it("property enrichment also applies the policy and does not mutate vendor results", async () => {
  const out = result();
  registerConnector({ name: "pii", displayName: "Fixture", tier: "free", keyEnvVar: null, phases: ["enrich"], isConfigured: () => true,
    async enrichProperties() { return { properties: out.properties! }; } });
  const enriched = await runPropertyEnrich(out.properties!);
  expect(enriched.properties[0]!.attributes).not.toHaveProperty("hiddenNotes");
  expect(enriched.properties[0]!.attributes.distressSignals).toEqual(fact(["probate"]));
  expect(out.properties![0]!.attributes).toHaveProperty("hiddenNotes");
});

it("custom B2B enrichment cannot sneak known personal fields through nested payloads", async () => {
  registerConnector({ name: "pii", displayName: "Fixture", tier: "free", keyEnvVar: null, phases: ["enrich"], isConfigured: () => true,
    async enrich() { return { enrichments: [{ subjectType: "lead", subjectKey: "acme.com", provider: "fixture", fetchedAt: new Date(T).toISOString(), data: { job_title: "CTO", personal_emails: ["private@x.com"], nested: [{ birthDate: "private", mobilePhone: "private", industry: "Software" }] } }] }; } });
  const out = await runEnrich({ domain: "acme.com", companyName: "Acme", source: "fixture" }, []);
  expect(out.enrichments[0]!.data).toEqual({ job_title: "CTO", nested: [{ industry: "Software" }] });
});

it("contact dedupe keeps the strictest retention and oldest provenance along with listed DNC status", () => {
  const point = result().contactPoints![0]!;
  const merged = mergePropertyModel({ properties: [], parties: [], ownerships: [], entityLinks: [], contactPoints: [
    { ...point, dnc: "clean", licenseTerms: { retentionDays: 30 } },
    { ...point, fetchedAt: new Date(T - DAY).toISOString() },
  ] });
  expect(merged.contactPoints[0]).toMatchObject({ dnc: "listed", fetchedAt: new Date(T - DAY).toISOString(), licenseTerms: { retentionDays: 1, outreachRestricted: true } });
});

it("file cache purge removes unvisited expired, corrupt and pre-policy entries, while keeping current entries", async () => {
  const dir = mkdtempSync(join(tmpdir(), "io-cache-purge-"));
  const cache = new FileResponseCache(dir);
  await cache.set("live", { safe: true }, DAY, T);
  writeFileSync(join(dir, "old.json"), JSON.stringify({ value: { personal: true }, expiresAt: T + DAY }));
  writeFileSync(join(dir, "expired.json"), JSON.stringify({ version: 1, value: {}, expiresAt: T }));
  writeFileSync(join(dir, "bad.json"), "{broken");
  expect(await cache.purge(T)).toBe(3);
  expect(readdirSync(dir)).toEqual(["live.json"]);
  expect(statSync(join(dir, "live.json")).mode & 0o777).toBe(0o600);
  await expect(cache.set("../escape", {}, DAY, T)).rejects.toThrow("Invalid cache key");
  await expect(cache.get("../escape", T)).rejects.toThrow("Invalid cache key");
  await expect(cache.set("bad", {}, Infinity, T)).rejects.toThrow("retention");
});

describe("monitor retention", () => {
  const monitor = { id: "retention", query, valueChangePct: 10 };
  it("expires snapshots at the earliest vendor deadline, preserves definitions, and re-baselines after an outage", async () => {
    const dir = mkdtempSync(join(tmpdir(), "io-mon-retention-"));
    const path = join(dir, "retention.json");
    const definition = join(dir, "retention.monitor.json");
    writeFileSync(definition, JSON.stringify(monitor));
    let reply: ResearchOutput | Error = result();
    registerConnector({ name: "pii", displayName: "Fixture", tier: "free", keyEnvVar: null, phases: ["research"], queryKinds: ["parcel"], isConfigured: () => true,
      async research() { if (reply instanceof Error) throw reply; return reply; } });
    const first = await checkMonitor(monitor, { path, now: () => new Date(T).toISOString() });
    await first.commit();
    expect((await readSnapshot(path, T))?.expiresAt).toBe(T + DAY);
    // The old expiry is not refreshed by another successful check.
    const repeat = await checkMonitor(monitor, { path, now: () => new Date(T + 1000).toISOString() });
    await repeat.commit();
    expect((await readSnapshot(path, T))?.expiresAt).toBe(T + DAY);
    expect(await purgeExpiredSnapshots(dir, T + DAY)).toBe(1);
    expect(existsSync(path)).toBe(false);
    expect(existsSync(definition)).toBe(true);
    reply = new Error("outage");
    const failed = await checkMonitor(monitor, { path, now: () => new Date(T + DAY).toISOString() });
    await failed.commit();
    expect(existsSync(path)).toBe(false);
    reply = { ...result(), contactPoints: [] };
    const healthy = await checkMonitor(monitor, { path, now: () => new Date(T + DAY).toISOString() });
    expect(healthy).toMatchObject({ baseline: true, events: [] });
    await healthy.commit();
  });

  it("cleans expired legacy snapshots but leaves a locked active check untouched", async () => {
    const dir = mkdtempSync(join(tmpdir(), "io-mon-old-"));
    for (const name of ["old", "busy"]) writeFileSync(join(dir, `${name}.json`), JSON.stringify({ monitorId: name, checkedAt: new Date(T - 31 * DAY).toISOString(), parcels: {} }));
    writeFileSync(join(dir, "busy.json.lock"), "");
    expect(await purgeExpiredSnapshots(dir, T)).toBe(1);
    expect(existsSync(join(dir, "busy.json"))).toBe(true);
  });
});


it("an expired vendor result is not cached or made available for drafting", async () => {
  registerConnector({ name: "expired", displayName: "Expired", tier: "free", keyEnvVar: null, phases: ["research"], queryKinds: ["parcel"], cacheTtlMs: DAY, isConfigured: () => true,
    async research() { return result(); } });
  const dir = mkdtempSync(join(tmpdir(), "io-expired-cache-"));
  const out = await runResearchQuery(query, "x", { cache: new FileResponseCache(dir), clock: () => T + 3 * DAY });
  expect(out.properties).toEqual([]);
  expect(out.failedConnectors).toHaveLength(1);
  expect(readdirSync(dir)).toEqual([]);
});


it("MCP save_run applies B2B minimization before persisting agent-supplied enrichment", async () => {
  const { handleSaveRun } = await import("../mcp/tools.js");
  const { MemoryRunStore } = await import("../pipeline_core/store.js");
  const store = new MemoryRunStore();
  const response = await handleSaveRun({ id: "mcp-pii", icp: "Software", domains: ["acme.com"], provider: "fixture", model: "fixture",
    enrichments: [{ subjectType: "lead", subjectKey: "acme.com", provider: "fixture", fetchedAt: new Date(T).toISOString(), data: { job_title: "CTO", ssn: "private", extra: { homeAddress: "private" } } }],
  }, { store, now: () => new Date(T).toISOString() });
  expect(response.isError).toBeUndefined();
  expect((await store.getRun("mcp-pii"))?.enrichments[0]?.data).toEqual({ job_title: "CTO", extra: {} });
});


it("purge removes abandoned cache/monitor temporary files but preserves fresh writes and unrelated files", async () => {
  const dir = mkdtempSync(join(tmpdir(), "io-pii-temp-"));
  for (const name of ["cache.json.123.abc-def.tmp", "monitor.json.abc-def.tmp", "fresh.json.123.abc-def.tmp", "operator.txt"]) {
    const path = join(dir, name);
    writeFileSync(path, "partial owner data");
    utimesSync(path, new Date(T), new Date(name.startsWith("fresh") ? T : T - 7_200_000));
  }
  expect(await new FileResponseCache(dir).purge(T)).toBe(1);
  expect(await purgeExpiredSnapshots(dir, T)).toBe(1);
  expect(readdirSync(dir).sort()).toEqual(["fresh.json.123.abc-def.tmp", "operator.txt"]);
});
