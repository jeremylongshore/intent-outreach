/**
 * tests/pipeline.test.ts — full-pipeline acceptance (017-AT-DECR §10).
 *
 * #2 plugin/standalone runs a full campaign → a VALIDATED CampaignRun in the store.
 * #4 a non-Anthropic provider still passes the validator.
 * #6 determinism: same input ⇒ identical run + identical connector call order.
 *
 * No live API calls: the LLM provider and the connectors are deterministic stubs.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCampaign, runResearch } from "../pipeline_core/pipeline.js";
import { MemoryRunStore } from "../pipeline_core/store.js";
import { _resetSecretCache } from "../pipeline_core/secrets.js";
import { _resetBuiltins, registerConnector } from "../pipeline_core/connectors/index.js";
import type { Connector } from "../pipeline_core/connectors/types.js";
import type { LLMProvider, ProviderName } from "../pipeline_core/providers.js";

const FIXED = "2026-06-16T12:00:00.000Z";
const clock = () => FIXED;

const stubResearch: Connector = {
  name: "stub-research",
  displayName: "Stub Research",
  tier: "free",
  keyEnvVar: null,
  phases: ["research"],
  isConfigured: () => true,
  async research({ domain }) {
    return {
      leads: [{ domain, companyName: "Acme Inc", industry: "SaaS", source: "stub-research" }],
      contacts: [
        { name: "Jane Doe", leadDomain: domain, email: `jane@${domain}`, title: "VP Eng", source: "stub-research" },
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
  async enrich({ lead }) {
    return {
      enrichments: [
        {
          subjectType: "lead",
          subjectKey: lead.domain,
          provider: "stub-enrich",
          funding: { lastRound: "Series A", totalRaisedUsd: 10_000_000 },
          data: {},
          fetchedAt: FIXED,
        },
      ],
    };
  },
};

/** A provider that returns deterministic structured output for any schema. */
function stubProvider(name: ProviderName): LLMProvider {
  return {
    name,
    model: "stub-model",
    async generateObject({ schema }) {
      // zod strips unknown keys, so one superset satisfies both seam schemas.
      const object = schema.parse({
        fitScore: 75,
        fitReason: "Matches the ICP on industry and size.",
        angles: ["Just raised a Series A — likely scaling GTM."],
        subject: "Scaling Acme's GTM",
        body: "Hi Jane — saw Acme raised a Series A; teams at that stage often need X.",
        cta: "Open to a 15-min call next week?",
      });
      return { object, usage: { inputTokens: 50, outputTokens: 40, costUsd: 0 } };
    },
  };
}

describe("runCampaign full pipeline", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    _resetBuiltins();
    _resetSecretCache();
    for (const k of Object.keys(process.env)) {
      if (k.endsWith("_API_KEY") || k === "ZOOMINFO_JWT" || k === "CLAY_WEBHOOK_URL") delete process.env[k];
    }
    registerConnector(stubResearch);
    registerConnector(stubEnrich);
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("#2 runs a full campaign and produces a validated CampaignRun in the store", async () => {
    const { run, cost } = await runCampaign({
      id: "run-acceptance-2",
      icp: "B2B SaaS founders doing their own outbound",
      domains: ["acme.com"],
      provider: stubProvider("anthropic"),
      now: clock,
    });

    expect(run.status).toBe("complete");
    expect(run.leads.map((l) => l.domain)).toContain("acme.com");
    expect(run.contacts.some((c) => c.email === "jane@acme.com")).toBe(true);
    expect(run.enrichments[0]?.funding?.lastRound).toBe("Series A");
    expect(run.messages).toHaveLength(1);
    expect(run.messages[0]?.body).toContain("Series A");
    expect(run.messages[0]?.fitScore).toBe(75);
    expect(cost.calls).toBe(2); // one score + one draft

    const store = new MemoryRunStore();
    await store.saveRun(run); // only compiles because run is Validated<CampaignRun>
    expect((await store.getRun("run-acceptance-2"))?.id).toBe("run-acceptance-2");
  });

  it("#4 a non-Anthropic provider still passes the validator", async () => {
    const { run } = await runCampaign({
      id: "run-byo-openai",
      icp: "B2B SaaS founders",
      domains: ["acme.com"],
      provider: stubProvider("openai"),
      now: clock,
    });
    expect(run.provider).toBe("openai");
    expect(run.messages).toHaveLength(1); // validated identically regardless of provider
  });

  it("#6 same input ⇒ byte-identical run (deterministic)", async () => {
    const opts = {
      id: "run-determinism",
      icp: "B2B SaaS founders",
      domains: ["acme.com"],
      provider: stubProvider("anthropic"),
      now: clock,
    };
    const a = await runCampaign(opts);
    const b = await runCampaign(opts);
    expect(JSON.stringify(a.run)).toBe(JSON.stringify(b.run));
  });

  it("#6 research calls connectors in a stable order across runs", async () => {
    const first = (await runResearch("acme.com", "icp")).ran;
    const second = (await runResearch("acme.com", "icp")).ran;
    expect(first).toEqual(second);
    expect(first).toEqual(["stub-research"]);
  });
});
