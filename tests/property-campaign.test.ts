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
  return { key, kind, name: key === "p-llc" ? "Beach Holdings LLC" : `Owner ${key}`, mailingAddress: mailing, source: "stub-gis" };
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
    expect(p.draftRules?.length).toBe(1);
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
    expect(run.blockedContacts).toEqual([{ contactKey: "p-good", reason: "gate-error: gate bug" }]);
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
    expect(run.rejectedDrafts).toEqual([{ contactKey: "p-good", issues: ['fair-housing: "kids" in body'] }]);
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
