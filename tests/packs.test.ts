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
import type { Connector } from "../pipeline_core/connectors/types.js";
import type { LLMProvider, ProviderName } from "../pipeline_core/providers.js";

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
