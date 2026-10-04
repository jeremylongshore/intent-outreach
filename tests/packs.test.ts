/**
 * tests/packs.test.ts — the Pack seam (Stage A steps 2–5).
 *
 * Covers: the pack registry + default resolution; b2b-sdr running byte-identically
 * (no-op gate, empty blockedContacts, vertical stamped); the compliance gate wired
 * into runCampaign (a blocking pack blocks a contact BEFORE drafting and records
 * it, while a clean contact is drafted); and the additive schema bump (an old v1
 * JSONL line still validates, with vertical + blockedContacts defaulting).
 *
 * No live API calls: connectors + LLM provider are deterministic stubs, mirroring
 * tests/pipeline.test.ts.
 */

import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCampaign } from "../pipeline_core/pipeline.js";
import { validateCampaignRun } from "../pipeline_core/validator.js";
import { _resetSecretCache } from "../pipeline_core/secrets.js";
import { _resetBuiltins, registerConnector } from "../pipeline_core/connectors/index.js";
import {
  DEFAULT_PACK_ID,
  _resetPacks,
  getPack,
  registerBuiltinPacks,
  registerPack,
  resolvePack,
  type Pack,
} from "../pipeline_core/packs/index.js";
import type { ComplianceResult } from "../pipeline_core/packs/types.js";
import { DncList } from "../pipeline_core/compliance/index.js";
import { SCHEMA_VERSION, SUPPORTED_SCHEMA_VERSIONS } from "../pipeline_core/models.js";
import type { Connector } from "../pipeline_core/connectors/types.js";
import type { LLMProvider, ProviderName } from "../pipeline_core/providers.js";

// runCampaign loads ${INTENT_OUTREACH_HOME}/suppressions.jsonl. Point it at an
// empty tmp dir at MODULE load (before any describe snapshots process.env) so
// these tests never read the real ~/.intent-outreach.
process.env.INTENT_OUTREACH_HOME = mkdtempSync(join(tmpdir(), "io-packs-home-"));

const FIXED = "2026-06-16T12:00:00.000Z";
const clock = () => FIXED;

/** Research connector returning one to-block + one clean contact. */
const stubTwoContacts: Connector = {
  name: "stub-two",
  displayName: "Stub Two",
  tier: "free",
  keyEnvVar: null,
  phases: ["research"],
  isConfigured: () => true,
  async research({ domain }) {
    return {
      leads: [{ domain, companyName: "Acme Inc", industry: "SaaS", source: "stub-two" }],
      contacts: [
        { name: "Blocked Person", leadDomain: domain, email: `dnc@${domain}`, source: "stub-two" },
        { name: "Clean Person", leadDomain: domain, email: `ok@${domain}`, source: "stub-two" },
      ],
    };
  },
};

const stubEnrich: Connector = {
  name: "stub-enrich",
  displayName: "Stub Enrich",
  tier: "free",
  keyEnvVar: null,
  phases: ["enrich"],
  isConfigured: () => true,
  async enrich() {
    return { enrichments: [] };
  },
};

function stubProvider(name: ProviderName): LLMProvider {
  return {
    name,
    model: "stub-model",
    async generateObject({ schema }) {
      const object = schema.parse({
        fitScore: 80,
        fitReason: "Fits the ICP.",
        angles: ["A relevant angle."],
        subject: "Subject line",
        body: "Hi — a short, relevant opener.",
        cta: "Open to a quick call?",
      });
      return { object, usage: { inputTokens: 10, outputTokens: 10, costUsd: 0 } };
    },
  };
}

/** A throwaway residential-shaped pack: blocks one known email, allows the rest. */
const blockingPack: Pack = {
  id: "test-residential",
  displayName: "Test Residential",
  compliance: {
    check: ({ contact }) =>
      contact.email === "dnc@acme.com"
        ? { status: "blocked", reason: "dnc" }
        : { status: "clean" },
  },
  prompts: { score: ["research.v1.md", "enrich.v1.md"], draft: "outreach.v1.md" },
};

// ── registry ──────────────────────────────────────────────────────────────

describe("pack registry", () => {
  beforeEach(() => _resetPacks());

  it("registerBuiltinPacks registers b2b-sdr", () => {
    registerBuiltinPacks();
    expect(getPack("b2b-sdr")?.id).toBe("b2b-sdr");
  });

  it("resolvePack defaults to b2b-sdr when unnamed", () => {
    registerBuiltinPacks();
    expect(resolvePack().id).toBe("b2b-sdr");
    expect(resolvePack(undefined).id).toBe(DEFAULT_PACK_ID);
  });

  it("resolvePack throws for an unregistered pack (typo fails loud)", () => {
    registerBuiltinPacks();
    expect(() => resolvePack("nope")).toThrow(/not registered/);
  });

  it("registerPack adds a custom vertical without core edits", () => {
    registerPack(blockingPack);
    expect(resolvePack("test-residential").id).toBe("test-residential");
  });

  it("registerBuiltinPacks is idempotent", () => {
    registerBuiltinPacks();
    registerBuiltinPacks();
    expect(resolvePack("b2b-sdr").id).toBe("b2b-sdr");
  });
});

// ── runCampaign wiring ──────────────────────────────────────────────────────

describe("runCampaign + packs", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    _resetPacks();
    _resetBuiltins();
    _resetSecretCache();
    for (const k of Object.keys(process.env)) {
      if (k.endsWith("_API_KEY") || k === "ZOOMINFO_JWT" || k === "CLAY_WEBHOOK_URL") delete process.env[k];
    }
    registerConnector(stubTwoContacts);
    registerConnector(stubEnrich);
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("default pack is b2b-sdr: stamps vertical, blocks nobody (byte-identical)", async () => {
    const { run } = await runCampaign({
      id: "run-b2b",
      icp: "B2B SaaS founders",
      domains: ["acme.com"],
      provider: stubProvider("anthropic"),
      now: clock,
      maxContactsPerLead: 5,
    });

    expect(run.vertical).toBe("b2b-sdr");
    expect(run.blockedContacts).toEqual([]);
    // No-op gate ⇒ both contacts are eligible and drafted.
    expect(run.messages).toHaveLength(2);
    expect(run.status).toBe("complete");
  });

  it("a blocking pack blocks a contact BEFORE drafting and records it", async () => {
    registerPack(blockingPack);
    const { run, cost } = await runCampaign({
      id: "run-residential",
      icp: "homeowners south of I-10",
      domains: ["acme.com"],
      provider: stubProvider("anthropic"),
      now: clock,
      maxContactsPerLead: 5,
      pack: "test-residential",
    });

    expect(run.vertical).toBe("test-residential");
    // Only the clean contact is drafted.
    expect(run.messages).toHaveLength(1);
    expect(run.messages[0]?.contactKey).toBe("ok@acme.com");
    // The blocked contact is recorded, not drafted.
    expect(run.blockedContacts).toEqual([{ contactKey: "dnc@acme.com", reason: "dnc" }]);
    // 1 score + 1 draft (NOT 2 drafts) — the blocked contact never hit the LLM.
    expect(cost.calls).toBe(2);
  });

  it("an unregistered pack id fails the run loudly (no silent b2b fallback)", async () => {
    await expect(
      runCampaign({
        id: "run-bad-pack",
        icp: "x",
        domains: ["acme.com"],
        provider: stubProvider("anthropic"),
        now: clock,
        pack: "does-not-exist",
      }),
    ).rejects.toThrow(/not registered/);
  });
});

// ── schema bump back-compat ────────────────────────────────────────────────

describe("CampaignRun schema v1 -> v2 back-compat", () => {
  it("an old v1 line (no vertical / blockedContacts) still validates with defaults", () => {
    const v1 = {
      id: "old-run",
      schemaVersion: 1,
      icp: "B2B SaaS founders",
      domains: ["acme.com"],
      provider: "anthropic",
      model: "claude",
      status: "researched",
      leads: [],
      contacts: [],
      enrichments: [],
      messages: [],
      skippedConnectors: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      // NO vertical, NO blockedContacts — these did not exist in v1.
    };

    const r = validateCampaignRun(v1);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.schemaVersion).toBe(1); // preserved, not rewritten
      expect(r.value.vertical).toBe("b2b-sdr"); // defaulted
      expect(r.value.blockedContacts).toEqual([]); // defaulted
    }
  });

  it("a v2 line validates and round-trips its new fields", () => {
    const v2 = {
      id: "new-run",
      schemaVersion: 2,
      vertical: "test-residential",
      icp: "homeowners",
      domains: ["acme.com"],
      provider: "anthropic",
      model: "claude",
      status: "complete",
      leads: [],
      contacts: [],
      enrichments: [],
      messages: [],
      skippedConnectors: [],
      blockedContacts: [{ contactKey: "dnc@acme.com", reason: "dnc" }],
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    const r = validateCampaignRun(v2);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.schemaVersion).toBe(2);
      expect(r.value.vertical).toBe("test-residential");
      expect(r.value.blockedContacts).toHaveLength(1);
    }
  });
});

// ── fail-closed gate ───────────────────────────────────────────────────────

describe("compliance gate fails CLOSED", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    _resetPacks();
    _resetBuiltins();
    _resetSecretCache();
    for (const k of Object.keys(process.env)) {
      if (k.endsWith("_API_KEY") || k === "ZOOMINFO_JWT" || k === "CLAY_WEBHOOK_URL") delete process.env[k];
    }
    registerConnector(stubTwoContacts);
    registerConnector(stubEnrich);
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  const packWith = (id: string, check: Pack["compliance"]["check"], draft = "outreach.v1.md"): Pack => ({
    id,
    displayName: id,
    compliance: { check },
    prompts: { score: ["research.v1.md", "enrich.v1.md"], draft },
  });

  it('a gate returning {status:"BLOCKED"} (wrong case) blocks every contact — nothing drafted', async () => {
    registerPack(packWith("typo-gate", () => ({ status: "BLOCKED" }) as unknown as ComplianceResult));
    const { run, cost } = await runCampaign({
      id: "run-typo",
      icp: "x",
      domains: ["acme.com"],
      provider: stubProvider("anthropic"),
      now: clock,
      maxContactsPerLead: 5,
      pack: "typo-gate",
    });
    expect(run.messages).toEqual([]);
    expect(run.blockedContacts).toEqual([
      { contactKey: "dnc@acme.com", reason: "non-clean-verdict" },
      { contactKey: "ok@acme.com", reason: "non-clean-verdict" },
    ]);
    expect(cost.calls).toBe(1); // score only — no draft tokens burned
    expect(run.status).toBe("enriched");
  });

  it("a non-clean verdict keeps its own reason; undefined/null verdicts block too", async () => {
    registerPack(
      packWith("odd-gate", ({ contact }) =>
        (contact.email === "dnc@acme.com" ? { status: "maybe", reason: "unsure" } : undefined) as unknown as ComplianceResult,
      ),
    );
    const { run } = await runCampaign({
      id: "run-odd",
      icp: "x",
      domains: ["acme.com"],
      provider: stubProvider("anthropic"),
      now: clock,
      maxContactsPerLead: 5,
      pack: "odd-gate",
    });
    expect(run.messages).toEqual([]);
    expect(run.blockedContacts).toEqual([
      { contactKey: "dnc@acme.com", reason: "unsure" },
      { contactKey: "ok@acme.com", reason: "non-clean-verdict" },
    ]);
  });

  it("a THROWING gate blocks (gate-error) and records the error — the run is not aborted", async () => {
    registerPack(
      packWith("throwing-gate", ({ contact }) => {
        if (contact.email === "dnc@acme.com") throw new Error("dnc source unavailable");
        return { status: "clean" };
      }),
    );
    const { run } = await runCampaign({
      id: "run-throwing-gate",
      icp: "x",
      domains: ["acme.com"],
      provider: stubProvider("anthropic"),
      now: clock,
      maxContactsPerLead: 5,
      pack: "throwing-gate",
    });
    expect(run.messages.map((m) => m.contactKey)).toEqual(["ok@acme.com"]);
    expect(run.blockedContacts).toEqual([{ contactKey: "dnc@acme.com", reason: "gate-error: dnc source unavailable" }]);
    expect(run.errors).toEqual([
      { domain: "acme.com", contactKey: "dnc@acme.com", stage: "gate", message: "dnc source unavailable" },
    ]);
    expect(run.status).toBe("partial");
  });

  it("the gate receives this lead's + this contact's enrichments (for DNC/phone/zip)", async () => {
    _resetBuiltins();
    registerConnector(stubTwoContacts);
    registerConnector({
      ...stubEnrich,
      name: "phone-enrich",
      async enrich({ lead }) {
        return {
          enrichments: [
            { subjectType: "lead" as const, subjectKey: lead.domain, provider: "p", data: { zip: "36542" }, fetchedAt: FIXED },
            { subjectType: "contact" as const, subjectKey: "dnc@acme.com", provider: "p", phone: "251-555-0100", data: {}, fetchedAt: FIXED },
            { subjectType: "contact" as const, subjectKey: "ok@acme.com", provider: "p", phone: "251-555-0199", data: {}, fetchedAt: FIXED },
          ],
        };
      },
    });
    const dnc = new DncList(["2515550100"]);
    const seen: Record<string, string[]> = {};
    registerPack(
      packWith("dnc-gate", ({ contact, enrichments }) => {
        seen[contact.email!] = enrichments.map((e) => `${e.subjectType}:${e.subjectKey}`);
        const phone = enrichments.find((e) => e.subjectType === "contact" && e.phone)?.phone;
        if (!phone || dnc.has(phone)) return { status: "blocked", reason: "dnc" };
        return { status: "clean" };
      }),
    );
    const { run } = await runCampaign({
      id: "run-dnc",
      icp: "x",
      domains: ["acme.com"],
      provider: stubProvider("anthropic"),
      now: clock,
      maxContactsPerLead: 5,
      pack: "dnc-gate",
    });
    expect(seen["dnc@acme.com"]).toEqual(["lead:acme.com", "contact:dnc@acme.com"]);
    expect(seen["ok@acme.com"]).toEqual(["lead:acme.com", "contact:ok@acme.com"]);
    expect(run.blockedContacts).toEqual([{ contactKey: "dnc@acme.com", reason: "dnc" }]);
    expect(run.messages.map((m) => m.contactKey)).toEqual(["ok@acme.com"]);
  });

  it("promptVersion follows the pack's draft prompt file name", async () => {
    registerPack(packWith("alt-prompt", () => ({ status: "clean" }), "research.v1.md"));
    const { run } = await runCampaign({
      id: "run-alt-pv",
      icp: "x",
      domains: ["acme.com"],
      provider: stubProvider("anthropic"),
      now: clock,
      pack: "alt-prompt",
    });
    expect(run.messages[0]?.promptVersion).toMatch(/^research\.v1@[0-9a-f]{8}$/);
    expect(run.promptRefs.draft).toBe(run.messages[0]?.promptVersion);
  });
});

// ── schema v3 back-compat ──────────────────────────────────────────────────

describe("CampaignRun schema v3 (additive)", () => {
  const base = {
    id: "r",
    icp: "x",
    domains: ["acme.com"],
    provider: "anthropic",
    model: "claude",
    leads: [],
    contacts: [],
    enrichments: [],
    messages: [],
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  it.each([1, 2])("an old v%i line without errors/rejectedDrafts/failedConnectors still parses", (v) => {
    const r = validateCampaignRun({ ...base, schemaVersion: v, status: "complete" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.schemaVersion).toBe(v);
      expect(r.value.errors).toEqual([]);
      expect(r.value.rejectedDrafts).toEqual([]);
      expect(r.value.failedConnectors).toEqual([]);
    }
  });

  it.each(["researched", "enriched", "complete", "failed", "partial"])("status %s parses", (status) => {
    expect(validateCampaignRun({ ...base, schemaVersion: SCHEMA_VERSION, status }).ok).toBe(true);
  });

  it("every SUPPORTED_SCHEMA_VERSIONS entry parses and an unknown version is rejected", () => {
    for (const v of SUPPORTED_SCHEMA_VERSIONS) {
      expect(validateCampaignRun({ ...base, schemaVersion: v, status: "complete" }).ok).toBe(true);
    }
    expect(SUPPORTED_SCHEMA_VERSIONS).toContain(SCHEMA_VERSION);
    const next = Math.max(...SUPPORTED_SCHEMA_VERSIONS) + 1;
    expect(validateCampaignRun({ ...base, schemaVersion: next, status: "complete" }).ok).toBe(false);
  });

  it("a v3 line round-trips its new fields", () => {
    const r = validateCampaignRun({
      ...base,
      schemaVersion: 3,
      status: "partial",
      errors: [{ domain: "acme.com", stage: "score", message: "boom", finishReason: "length" }],
      rejectedDrafts: [{ contactKey: "a@acme.com", issues: ["body: too short"] }],
      failedConnectors: [{ name: "hunter", phase: "research", status: 401 }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.errors[0]?.stage).toBe("score");
      expect(r.value.failedConnectors[0]?.status).toBe(401);
    }
  });
});

// ── schema v5 back-compat ──────────────────────────────────────────────────

describe("CampaignRun schema v5 (additive: promptRefs, droppedAngles, origin)", () => {
  it("v5 is the current version and every older version is still supported", () => {
    expect(SCHEMA_VERSION).toBe(5);
    expect([...SUPPORTED_SCHEMA_VERSIONS]).toEqual([1, 2, 3, 4, 5]);
  });

  it("every line of the legacy golden fixture parses with the v5 defaults applied", () => {
    const lines = readFileSync(resolve("tests/fixtures/runs.legacy.jsonl"), "utf8").split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const r = validateCampaignRun(JSON.parse(line));
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.schemaVersion).toBeLessThan(5);
        expect(r.value.promptRefs).toEqual({});
        expect(r.value.droppedAngles).toEqual([]);
        expect(r.value.origin).toBeUndefined(); // old lines stay unlabeled, never mislabeled
      }
    }
  });

  it("a v5 line round-trips its new fields; a bad origin is rejected", () => {
    const base = {
      id: "r5",
      schemaVersion: 5,
      icp: "x",
      domains: ["acme.com"],
      provider: "anthropic",
      model: "claude",
      status: "complete",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const r = validateCampaignRun({
      ...base,
      promptRefs: { score: ["research.v2@deadbeef"], draft: "outreach.v2@cafef00d" },
      droppedAngles: [{ domain: "acme.com", angle: "raised $9B", reason: "ungrounded money" }],
      origin: "agent",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.promptRefs.draft).toBe("outreach.v2@cafef00d");
      expect(r.value.droppedAngles).toHaveLength(1);
      expect(r.value.origin).toBe("agent");
    }
    expect(validateCampaignRun({ ...base, origin: "model" }).ok).toBe(false);
  });
});
