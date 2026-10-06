/**
 * tests/property-campaign.test.ts — Phase 6: the residential-re pack and the
 * property campaign loop, end to end with stub connectors and a stub model.
 *
 *   • One compliant absentee owner is drafted; the mail footer (identity,
 *     postal address, license) is appended in code; the run is a valid v6
 *     record with the property model and the query.
 *   • Fail-closed gates: outside the service area, unknown address, probate,
 *     an active listing, a suppressed mailing address, a property with no owner.
 *   • Fair housing: a draft that mentions the owner's family is rejected.
 *   • FCRA / protected attributes never reach a prompt; signals are computed in code.
 *   • minScore, underwriting facts in the draft prompt, and the credit budget.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildSuppressionList, EMPTY_SUPPRESSION_LIST } from "../pipeline_core/compliance/suppression.js";
import { _resetBuiltins, registerConnector } from "../pipeline_core/connectors/index.js";
import type { Connector } from "../pipeline_core/connectors/types.js";
import type { SenderIdentity } from "../pipeline_core/footer.js";
import { propertyKey, type Ownership, type Party, type Property } from "../pipeline_core/models.js";
import { _resetPacks, registerBuiltinPacks, registerPack, resolvePack, residentialRePack } from "../pipeline_core/packs/index.js";
import { runPropertyCampaign } from "../pipeline_core/property-campaign.js";
import { PropertyScoreOutputSchema, propertySignals } from "../pipeline_core/property-seam.js";
import type { LLMProvider } from "../pipeline_core/providers.js";
import { _resetSecretCache } from "../pipeline_core/secrets.js";

const T = "2026-10-06T15:00:00.000Z";
const SENDER: SenderIdentity = {
  name: "Pat Agent",
  company: "Example Realty",
  postalAddress: "100 Main St\nFoley, AL 36535",
  licenses: [{ state: "AL", number: "000123", brokerage: "Example Realty" }],
};

const FIPS = "01003";
function parcel(apn: string, zip: string, attributes: Property["attributes"] = {}, line1 = `${apn} Beach Blvd`): Property {
  return {
    key: propertyKey(FIPS, apn),
    apn,
    countyFips: FIPS,
    address: { line1, city: "Gulf Shores", state: "AL", zip },
    attributes,
    source: "stub-gis",
  };
}
function owner(key: string, mailing: Party["mailingAddress"], kind: Party["kind"] = "person"): Party {
  return {
    key,
    kind,
    name: key === "p-llc" ? "Beach Holdings LLC" : `Owner ${key}`,
    mailingAddress: mailing,
    source: "stub-gis",
    licenseTerms: { id: "fixture-public-record", outreachRestricted: false },
  };
}
const OUT_OF_STATE = { line1: "9 Elm St", city: "Nashville", state: "TN", zip: "37201" };
const own = (p: Property, party: string, asOf = "2006-05-01"): Ownership => ({
  propertyKey: p.key,
  partyKey: party,
  role: "owner",
  asOf,
  source: "stub-gis",
  fetchedAt: T,
});
const fact = (value: unknown) => ({ value, source: "stub-gis", fetchedAt: T });

const good = parcel("100", "36542", {
  yearBuilt: fact(1998),
  floodZone: fact("VE"),
  creditScoreBand: fact("700-749"),
  ownerAge: fact(71),
});
const outside = parcel("200", "36602");
const probate = parcel("300", "36542", { distressSignals: fact(["Probate Court filing"]) });
const listed = parcel("400", "36542", { listingStatus: fact({ status: "Active" }) });
const suppressed = parcel("500", "36542");
const orphan = parcel("600", "36542");
const noAddress: Property = { ...parcel("700", "36542"), address: undefined };

const parties: Party[] = [
  owner("p-good", OUT_OF_STATE),
  owner("p-outside", OUT_OF_STATE),
  owner("p-probate", OUT_OF_STATE),
  owner("p-listed", OUT_OF_STATE),
  owner("p-suppressed", { line1: "12 Main St", city: "Foley", state: "AL", zip: "36535" }),
  owner("p-noaddr", OUT_OF_STATE),
];
const ownerships = [
  own(good, "p-good"),
  own(outside, "p-outside"),
  own(probate, "p-probate"),
  own(listed, "p-listed"),
  own(suppressed, "p-suppressed"),
  own(noAddress, "p-noaddr"),
];

function gis(properties: Property[] = [good, outside, probate, listed, suppressed, orphan, noAddress], extra: Partial<Connector> = {}): Connector {
  return {
    name: "stub-gis",
    displayName: "Stub county GIS",
    tier: "free",
    keyEnvVar: null,
    phases: ["research"],
    queryKinds: ["area", "parcel"],
    isConfigured: () => true,
    async research() {
      return { leads: [], contacts: [], properties, parties, ownerships };
    },
    ...extra,
  };
}

interface Captured {
  prompts: string[];
}
function stubModel(captured: Captured, body = "Your home at 100 Beach Blvd was built in 1998. I sell homes on this stretch of Gulf Shores.", score = 82): LLMProvider {
  return {
    name: "anthropic",
    model: "stub-model",
    async generateObject({ schema, prompt }: { schema: unknown; prompt: string }) {
      captured.prompts.push(prompt);
      const usage = { inputTokens: 10, outputTokens: 10, costUsd: 0 };
      if (schema === PropertyScoreOutputSchema) {
        return { object: { score, band: "hot", reasons: ["absenteeOwner: true", "yearBuilt: 1998"] }, usage };
      }
      return {
        object: { decline: false, declineReason: null, subject: null, body, cta: "Would a free estimate of what it would sell for help?" },
        usage,
      };
    },
  } as unknown as LLMProvider;
}

const QUERY = { kind: "area" as const, geography: { zips: ["36542"] }, filters: {} };

const saved = { ...process.env };
beforeEach(() => {
  _resetBuiltins();
  _resetPacks();
  _resetSecretCache();
  for (const k of Object.keys(process.env)) {
    if (k.endsWith("_API_KEY") || k === "ZOOMINFO_JWT" || k === "CLAY_WEBHOOK_URL") delete process.env[k];
  }
});
afterEach(() => {
  process.env = { ...saved };
});

describe("residential-re pack", () => {
  it("is a built-in pack with fair-housing rules and license disclosure on every channel", () => {
    registerBuiltinPacks();
    const p = resolvePack("residential-re");
    expect(p).toBe(residentialRePack);
    expect(p.draftRules?.length).toBe(2); // fair housing + distress language
    expect(p.channels?.mail?.requireLicenseDisclosure).toBe(true);
    expect(p.channels?.sms?.requireLicenseDisclosure).toBe(true);
  });
});

describe("runPropertyCampaign", () => {
  it("drafts the compliant absentee owner and blocks everything else, fail closed", async () => {
    registerConnector(gis());
    const captured: Captured = { prompts: [] };
    const { run } = await runPropertyCampaign({
      id: "prop-1",
      icp: "Listing agent for Gulf Shores homes",
      queries: [QUERY],
      provider: stubModel(captured),
      sender: SENDER,
      suppressions: buildSuppressionList([{ kind: "address", value: "12 Main Street, Foley, Alabama 36535" }]),
      now: () => T,
    });

    expect(run.schemaVersion).toBe(6);
    expect(run.vertical).toBe("residential-re");
    expect(run.queries).toEqual([QUERY]);
    expect(run.properties).toHaveLength(7);
    expect(run.messages.map((m) => m.contactKey)).toEqual(["p-good"]);
    const msg = run.messages[0]!;
    expect(msg.channel).toBe("mail");
    expect(msg.fitScore).toBe(82);
    expect(msg.body).toContain("Example Realty, AL license #000123");
    expect(msg.body).toContain("Foley, AL 36535");
    expect(msg.needsSenderIdentity).toBe(false);

    const reasons = Object.fromEntries(run.blockedContacts.map((b) => [b.contactKey, b.reason]));
    expect(reasons).toEqual({
      "p-outside": "service-area:outside",
      "p-probate": "manual-review:probate",
      "p-listed": "listing:active",
      "p-suppressed": "suppressed:address",
      [orphan.key]: "owner:unknown",
      "p-noaddr": "service-area:unknown-address",
    });
    expect(run.status).toBe("complete");
  });

  it("a property gate that throws blocks and is logged", async () => {
    registerConnector(gis([good]));
    registerPack({
      ...residentialRePack,
      id: "throwing",
      propertyGate: () => {
        throw new Error("gate bug");
      },
    });
    const { run } = await runPropertyCampaign({
      id: "prop-throw",
      icp: "x",
      queries: [QUERY],
      pack: "throwing",
      provider: stubModel({ prompts: [] }),
      sender: SENDER,
      suppressions: EMPTY_SUPPRESSION_LIST,
      now: () => T,
    });
    expect(run.messages).toEqual([]);
    expect(run.blockedContacts).toEqual([{ contactKey: "p-good", reason: "gate-error: gate bug", propertyKey: good.key }]);
    expect(run.errors[0]?.stage).toBe("gate");
  });

  it("a draft that mentions the owner's family is rejected by the fair-housing rule", async () => {
    registerConnector(gis([good]));
    const { run } = await runPropertyCampaign({
      id: "prop-fh",
      icp: "x",
      queries: [QUERY],
      provider: stubModel({ prompts: [] }, "Now that the kids are grown, your Gulf Shores home may be more than you need."),
      sender: SENDER,
      suppressions: EMPTY_SUPPRESSION_LIST,
      now: () => T,
    });
    expect(run.messages).toEqual([]);
    expect(run.rejectedDrafts).toEqual([
      { contactKey: "p-good", issues: ['fair-housing: "kids" in body'], propertyKey: good.key },
    ]);
  });

  it("credit, age and other protected attributes never reach a prompt; computed signals do", async () => {
    registerConnector(gis([good]));
    const captured: Captured = { prompts: [] };
    await runPropertyCampaign({
      id: "prop-fcra",
      icp: "x",
      queries: [QUERY],
      provider: stubModel(captured),
      sender: SENDER,
      suppressions: EMPTY_SUPPRESSION_LIST,
      now: () => T,
    });
    expect(captured.prompts).toHaveLength(2);
    for (const p of captured.prompts) {
      expect(p).not.toContain("creditScoreBand");
      expect(p).not.toContain("700-749");
      expect(p).not.toContain("ownerAge");
      expect(p).toContain('"absenteeOwner":true');
      expect(p).toContain('"outOfStateOwner":true');
      expect(p).toContain('"floodZone":"VE"');
    }
  });

  it("signals: absentee and tenure are computed, unknown stays unknown", () => {
    const s = propertySignals(good, parties[0]!, ownerships, new Date(T));
    expect(s).toMatchObject({ absenteeOwner: true, outOfStateOwner: true, entityOwner: false, yearsSinceOwnershipRecorded: 20 });
    const resident = owner("r", { ...good.address! });
    expect(propertySignals(good, resident, [], new Date(T))).toMatchObject({ absenteeOwner: false, outOfStateOwner: false });
    expect(propertySignals(noAddress, resident, [], new Date(T))).not.toHaveProperty("absenteeOwner");
  });

  it("minScore skips drafting; underwriting facts reach the draft prompt", async () => {
    registerConnector(gis([good]));
    const low = await runPropertyCampaign({
      id: "prop-low",
      icp: "x",
      queries: [QUERY],
      minScore: 90,
      provider: stubModel({ prompts: [] }),
      sender: SENDER,
      suppressions: EMPTY_SUPPRESSION_LIST,
      now: () => T,
    });
    expect(low.run.messages).toEqual([]);

    registerPack({
      ...residentialRePack,
      id: "underwritten",
      underwriting: () => [{ label: "estimated cash pocketed", value: "$252,375", source: "deal-math tradeUp 1.0.0" }],
    });
    const captured: Captured = { prompts: [] };
    await runPropertyCampaign({
      id: "prop-uw",
      icp: "x",
      queries: [QUERY],
      pack: "underwritten",
      provider: stubModel(captured),
      sender: SENDER,
      suppressions: EMPTY_SUPPRESSION_LIST,
      now: () => T,
    });
    expect(captured.prompts[1]).toContain("<underwriting_data>");
    expect(captured.prompts[1]).toContain("$252,375");
  });

  it("the credit budget stops paid property research and is recorded", async () => {
    registerConnector(gis([good], { name: "paid-gis", creditsPerCall: 10 }));
    const { run } = await runPropertyCampaign({
      id: "prop-budget",
      icp: "x",
      queries: [QUERY, { kind: "parcel", countyFips: FIPS, apn: "100" }],
      budgetCredits: 15,
      provider: stubModel({ prompts: [] }),
      sender: SENDER,
      suppressions: EMPTY_SUPPRESSION_LIST,
      now: () => T,
    });
    expect(run.credits).toEqual({ limit: 15, spent: 10, exhausted: true, byConnector: { "paid-gis": 10 } });
    expect(run.failedConnectors).toContainEqual({ name: "paid-gis", phase: "research", status: "budget-exhausted" });
  });

  it("without a sender the mail draft is flagged and warned, never footed with invented identity", async () => {
    registerConnector(gis([good]));
    const { run } = await runPropertyCampaign({
      id: "prop-nosender",
      icp: "x",
      queries: [QUERY],
      provider: stubModel({ prompts: [] }),
      suppressions: EMPTY_SUPPRESSION_LIST,
      now: () => T,
    });
    expect(run.messages[0]?.needsSenderIdentity).toBe(true);
    expect(run.complianceWarnings[0]).toMatch(/1 mail draft\(s\) have NO mail footer/);
  });

  it("refuses an empty query list", async () => {
    await expect(runPropertyCampaign({ id: "x", icp: "x", queries: [], provider: stubModel({ prompts: [] }) })).rejects.toThrow(
      /at least one query/,
    );
  });
});

describe("review regressions", () => {
  const base = { icp: "x", queries: [QUERY], sender: SENDER, now: () => T };
  const model = () => stubModel({ prompts: [] });
  const gisWith = (properties: Property[], ps: Party[], os: Ownership[], contactPoints: unknown[] = []): Connector => ({
    ...gis(properties),
    async research() {
      return { leads: [], contacts: [], properties, parties: ps, ownerships: os, contactPoints } as never;
    },
  });

  it("suppression covers co-owners, the property address, every email and mail contact points", async () => {
    const a = parcel("801", "36542");
    const b = parcel("802", "36542");
    const c = parcel("803", "36542");
    const d = parcel("804", "36542");
    const ps = ["A", "B", "B2", "C", "D"].map((k) => owner(k, OUT_OF_STATE));
    registerConnector(
      gisWith(
        [a, b, c, d],
        ps,
        [own(a, "A"), own(b, "B"), { ...own(b, "B2"), role: "co-owner" }, own(c, "C"), own(d, "D")],
        [
          { partyKey: "B2", kind: "phone", value: "+12515550199", source: "x", fetchedAt: T },
          { partyKey: "C", kind: "email", value: "first@x.com", source: "x", fetchedAt: T },
          { partyKey: "C", kind: "email", value: "second@x.com", source: "x", fetchedAt: T },
          { partyKey: "D", kind: "mail", value: "5 Other Rd, Foley, AL 36535", source: "x", fetchedAt: T },
        ],
      ),
    );
    const { run } = await runPropertyCampaign({
      ...base,
      id: "reg-supp",
      provider: model(),
      suppressions: buildSuppressionList([
        { kind: "address", value: `${a.address!.line1}, Gulf Shores, AL 36542` }, // A's PROPERTY address
        { kind: "phone", value: "251-555-0199" }, // B's co-owner
        { kind: "email", value: "second@x.com" }, // C's second email
        { kind: "address", value: "5 Other Road, Foley, Alabama 36535" }, // D's mail contact point
      ]),
    });
    expect(run.messages).toEqual([]);
    expect(Object.fromEntries(run.blockedContacts.map((x) => [x.contactKey, x.reason]))).toEqual({
      A: "suppressed:address",
      B: "suppressed:phone",
      C: "suppressed:email",
      D: "suppressed:address",
    });
  });

  it("an owner with no mailing address cannot be mailed", async () => {
    registerConnector(gisWith([good], [{ ...owner("p-good", undefined) }], [own(good, "p-good")]));
    const { run } = await runPropertyCampaign({ ...base, id: "reg-noaddr", provider: model(), suppressions: EMPTY_SUPPRESSION_LIST });
    expect(run.blockedContacts).toEqual([{ contactKey: "p-good", reason: "mail:no-address", propertyKey: good.key }]);
  });

  it("estate owners, heirs and life estates go to manual review without any connector tag", async () => {
    const a = parcel("811", "36542");
    const b = parcel("812", "36542");
    const c = parcel("813", "36542");
    const ps: Party[] = [
      { ...owner("E", OUT_OF_STATE, "entity"), entityType: "estate" },
      { ...owner("H", OUT_OF_STATE), name: "Heirs of John Roe" },
      owner("L", OUT_OF_STATE),
    ];
    registerConnector(gisWith([a, b, c], ps, [own(a, "E"), own(b, "H"), { ...own(c, "L"), role: "life-tenant" }]));
    const { run } = await runPropertyCampaign({ ...base, id: "reg-estate", provider: model(), suppressions: EMPTY_SUPPRESSION_LIST });
    expect(run.messages).toEqual([]);
    expect(run.blockedContacts.map((x) => x.reason)).toEqual(["manual-review:probate", "manual-review:probate", "manual-review:probate"]);
  });

  it("one letter per owner, however many parcels; the message names its parcel", async () => {
    const a = parcel("821", "36542");
    const b = parcel("822", "36542");
    registerConnector(gisWith([a, b], [owner("O", OUT_OF_STATE)], [own(a, "O"), own(b, "O")]));
    const { run } = await runPropertyCampaign({ ...base, id: "reg-dedupe", provider: model(), suppressions: EMPTY_SUPPRESSION_LIST });
    expect(run.messages.map((m) => [m.contactKey, m.propertyKey])).toEqual([["O", a.key]]);
    expect(run.complianceWarnings).toContain(`O also owns ${b.key}; one letter per owner per run (about ${a.key})`);
  });

  it("maxProperties counts parcels that passed the gates; an all-blocked run is 'researched'", async () => {
    registerConnector(gis([outside, parcel("831", "36602"), good]));
    const capped = await runPropertyCampaign({ ...base, id: "reg-cap", maxProperties: 1, provider: model(), suppressions: EMPTY_SUPPRESSION_LIST });
    expect(capped.run.messages.map((m) => m.contactKey)).toEqual(["p-good"]);

    _resetBuiltins();
    registerConnector(gis([outside]));
    const blocked = await runPropertyCampaign({ ...base, id: "reg-status", provider: model(), suppressions: EMPTY_SUPPRESSION_LIST });
    expect(blocked.run.status).toBe("researched");
  });

  it("errors and dropped reasons carry the parcel as propertyKey, never as a domain", async () => {
    registerConnector(gis([good]));
    const failing = {
      ...model(),
      generateObject: async () => {
        throw new Error("model down");
      },
    } as unknown as LLMProvider;
    const { run } = await runPropertyCampaign({ ...base, id: "reg-err", provider: failing, suppressions: EMPTY_SUPPRESSION_LIST });
    expect(run.errors[0]).toMatchObject({ propertyKey: good.key, stage: "score" });
    expect(run.errors[0]?.domain).toBeUndefined();
  });

  it("protected traits in free-text attributes and substring-dodging keys never reach a prompt", async () => {
    const leaky = parcel("841", "36542", {
      currentCreditScore: fact(720),
      currentIncome: fact(90_000),
      clientDebt: fact(5),
      ageOfOwner: fact(80),
      occupancy: fact("owner is 82, retired"),
      annualRentalIncome: fact(24_000),
      taxDelinquent: fact(true),
    });
    registerConnector(gisWith([leaky], [owner("Z", OUT_OF_STATE)], [own(leaky, "Z")]));
    const captured: Captured = { prompts: [] };
    await runPropertyCampaign({ ...base, id: "reg-fcra", provider: stubModel(captured), suppressions: EMPTY_SUPPRESSION_LIST });
    const p = captured.prompts[0]!;
    for (const k of ["currentCreditScore", "currentIncome", "clientDebt", "ageOfOwner", "occupancy", "retired"]) expect(p).not.toContain(k);
    expect(p).toContain("annualRentalIncome");
    expect(p).toContain("taxDelinquent");
  });

  it("an owner record whose terms are undeclared or restrict outreach is never drafted", async () => {
    const a = parcel("851", "36542");
    const b = parcel("852", "36542");
    const undeclared = { ...owner("U", OUT_OF_STATE), licenseTerms: undefined };
    const restricted = { ...owner("R", OUT_OF_STATE), licenseTerms: { id: "mobile-mcrc-tax-only", outreachRestricted: true } };
    registerConnector(gisWith([a, b], [undeclared, restricted], [own(a, "U"), own(b, "R")]));
    const { run } = await runPropertyCampaign({ ...base, id: "reg-license", provider: model(), suppressions: EMPTY_SUPPRESSION_LIST });
    expect(run.messages).toEqual([]);
    expect(Object.fromEntries(run.blockedContacts.map((x) => [x.contactKey, x.reason]))).toEqual({
      U: "license:undeclared",
      R: "license:outreach-restricted",
    });
  });

  it("tenure uses the latest recorded transfer and never goes negative", () => {
    const two = [own(good, "p-good", "1990-01-01"), own(good, "p-good", "2025-01-01")];
    expect(propertySignals(good, parties[0]!, two, new Date(T)).yearsSinceOwnershipRecorded).toBe(1);
    const future = [own(good, "p-good", "2030-01-01")];
    expect(propertySignals(good, parties[0]!, future, new Date(T))).not.toHaveProperty("yearsSinceOwnershipRecorded");
  });

  it("a letter that raises distress is rejected", async () => {
    registerConnector(gis([good]));
    const { run } = await runPropertyCampaign({
      ...base,
      id: "reg-distress",
      provider: stubModel({ prompts: [] }, "I can help you sell before the foreclosure on your Gulf Shores home."),
      suppressions: EMPTY_SUPPRESSION_LIST,
    });
    expect(run.rejectedDrafts[0]?.issues).toEqual(['distress-language: "foreclosure" in body']);
  });
});
