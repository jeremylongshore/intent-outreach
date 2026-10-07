import { describe, expect, it } from "vitest";
import { CRM_MAX_AGE_MS, crmExcludedProperties, crmQueryExcluded, mergeCrmSuppressions, parseCrmContext, removeCrmExcluded } from "../pipeline_core/crm-context.js";
import { buildSuppressionList } from "../pipeline_core/compliance/suppression.js";
import type { PropertyModel } from "../pipeline_core/pipeline.js";

const T = Date.parse("2026-10-06T12:00:00Z");
const snapshot = (patch = {}) => ({ version: 1, source: "erpnext", generatedAt: new Date(T).toISOString(), expiresAt: new Date(T + CRM_MAX_AGE_MS).toISOString(), suppressions: [], doNotResearch: [], ...patch });
const model: PropertyModel = {
  properties: ["A", "B"].map((apn) => ({ key: `01003:${apn}`, countyFips: "01003", apn, source: "fixture", attributes: {}, address: { line1: "10 Main St", city: "Foley", state: "AL", zip: "36535" } })),
  parties: ["owner", "entity", "person", "other"].map((key) => ({ key, kind: "person", name: key, source: "fixture" })),
  ownerships: [{ propertyKey: "01003:A", partyKey: "owner", role: "owner", source: "fixture", fetchedAt: new Date(T).toISOString() }, { propertyKey: "01003:A", partyKey: "entity", role: "co-owner", source: "fixture", fetchedAt: new Date(T).toISOString() }, { propertyKey: "01003:B", partyKey: "other", role: "owner", source: "fixture", fetchedAt: new Date(T).toISOString() }],
  contactPoints: [{ partyKey: "person", kind: "phone", value: "+12515550100", dnc: "unknown", source: "fixture", fetchedAt: new Date(T).toISOString() }],
  entityLinks: [{ entityKey: "entity", personKey: "person", role: "member", confidence: 1, source: "fixture", fetchedAt: new Date(T).toISOString() }],
};

describe("CRM snapshots", () => {
  it("normalizes identifiers and unions CRM opt-outs with local entries", () => {
    const context = parseCrmContext(snapshot({ suppressions: [{ kind: "email", value: " A@Example.com " }, { kind: "phone", value: "251-555-0100" }, { kind: "domain", value: "EXAMPLE.ORG" }, { kind: "address", value: "10 Main Street, Foley, AL 36535" }], doNotResearch: [{ kind: "parcel", value: "01003:abc" }] }), T);
    expect(context.doNotResearch[0]?.value).toBe("01003:ABC");
    const merged = mergeCrmSuppressions(buildSuppressionList([{ kind: "email", value: "local@example.net" }]), context);
    expect([...merged.emails]).toEqual(["local@example.net", "a@example.com"]);
    expect([...merged.phones]).toEqual(["+12515550100"]);
    expect([...merged.domains]).toEqual(["example.org"]);
    expect([...merged.addresses]).toEqual(["10 MAIN ST FOLEY AL 36535"]);
  });
  it.each([
    { version: 2 }, { source: "other" }, { extra: true }, { suppressions: null },
    { generatedAt: new Date(T + 1).toISOString() }, { expiresAt: new Date(T).toISOString() },
    { expiresAt: new Date(T + CRM_MAX_AGE_MS + 1).toISOString() },
    { suppressions: [{ kind: "phone", value: "sensitive-invalid-phone" }] },
    { doNotResearch: [{ kind: "parcel", value: "01003: abc" }] },
    { doNotResearch: [{ kind: "parcel", value: "bad" }] },
  ])("rejects malformed, stale, future or overlong context: %j", (patch) => {
    expect(() => parseCrmContext(snapshot(patch), T)).toThrow(/CRM context/);
    try { parseCrmContext(snapshot(patch), T); } catch (e) { expect(String(e)).not.toContain("sensitive-invalid-phone"); }
  });
  it("rejects invalid caller clock and expiry equality", () => {
    expect(() => parseCrmContext(snapshot(), Number.NaN)).toThrow();
    expect(() => parseCrmContext(snapshot(), T + CRM_MAX_AGE_MS)).toThrow();
  });
  it("stops parcel-key and address queries without excluding unrelated area queries", () => {
    const context = parseCrmContext(snapshot({ doNotResearch: [{ kind: "parcel", value: "01003:a" }, { kind: "address", value: "10 Main Street, Foley, AL 36535" }] }), T);
    expect(crmQueryExcluded({ kind: "parcel", countyFips: "01003", apn: "a" }, context)).toBe(true);
    expect(crmQueryExcluded({ kind: "parcel", address: model.properties[0]!.address }, context)).toBe(true);
    expect(crmQueryExcluded({ kind: "parcel", countyFips: "01003", apn: "other" }, context)).toBe(false);
    expect(crmQueryExcluded({ kind: "area", geography: { zips: ["36535"] }, filters: {} }, context)).toBe(false);
  });
  it("propagates a person's opt-out through entity and co-ownership relationships", () => {
    const context = parseCrmContext(snapshot({ doNotResearch: [{ kind: "phone", value: "+12515550100" }] }), T);
    const excluded = crmExcludedProperties(model, context.doNotResearch);
    expect([...excluded]).toEqual(["01003:A"]);
    const filtered = removeCrmExcluded(model, excluded);
    expect(filtered.properties.map((p) => p.key)).toEqual(["01003:B"]);
    expect(filtered.parties.map((p) => p.key)).toEqual(["other"]);
    expect(filtered.contactPoints).toEqual([]);
    expect(filtered.entityLinks).toEqual([]);
    expect(model.properties).toHaveLength(2);
    expect(removeCrmExcluded(model, new Set()).entityLinks).toEqual(model.entityLinks);
  });
  it("matches party keys, property addresses and malformed contact addresses conservatively", () => {
    expect([...crmExcludedProperties(model, [{ kind: "party", value: "entity" }])]).toEqual(["01003:A"]);
    expect([...crmExcludedProperties(model, [{ kind: "address", value: "10 MAIN ST FOLEY AL 36535" }])]).toEqual(["01003:A", "01003:B"]);
    const withEmail: PropertyModel = { ...model, contactPoints: [{ ...model.contactPoints[0]!, kind: "email", value: "bad" }] };
    expect([...crmExcludedProperties(withEmail, [{ kind: "email", value: "a@example.com" }])]).toEqual(["01003:A"]);
  });
});
