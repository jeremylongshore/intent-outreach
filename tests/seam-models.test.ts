/**
 * tests/seam-models.test.ts — Phase 8 per-seam models: a cheap model scores,
 * a stronger one drafts, in both campaign loops; the run records which did what.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { EMPTY_SUPPRESSION_LIST } from "../pipeline_core/compliance/suppression.js";
import { _resetBuiltins, registerConnector } from "../pipeline_core/connectors/index.js";
import { propertyKey } from "../pipeline_core/models.js";
import { _resetPacks } from "../pipeline_core/packs/index.js";
import { runCampaign } from "../pipeline_core/pipeline.js";
import { runPropertyCampaign } from "../pipeline_core/property-campaign.js";
import { PropertyScoreOutputSchema } from "../pipeline_core/property-seam.js";
import type { LLMProvider } from "../pipeline_core/providers.js";
import { ScoreOutputSchema } from "../pipeline_core/seam.js";
import { _resetSecretCache } from "../pipeline_core/secrets.js";

const T = "2026-10-06T15:00:00.000Z";

function model(name: string, calls: string[]): LLMProvider {
  return {
    name: name === "cheap" ? "minimax" : "anthropic",
    model: name,
    async generateObject({ schema }: { schema: unknown }) {
      calls.push(`${name}:${schema === ScoreOutputSchema || schema === PropertyScoreOutputSchema ? "score" : "draft"}`);
      const usage = { inputTokens: 10, outputTokens: 10, costUsd: 0 };
      if (schema === ScoreOutputSchema) return { object: { fitScore: 80, fitReason: "fits", angles: [] }, usage };
      if (schema === PropertyScoreOutputSchema) return { object: { score: 80, band: "hot", reasons: [] }, usage };
      return { object: { decline: false, declineReason: null, subject: null, body: "A short note about the home.", cta: "Worth a call?" }, usage };
    },
  } as unknown as LLMProvider;
}

beforeEach(() => {
  _resetBuiltins();
  _resetPacks();
  _resetSecretCache();
});

describe("per-seam models", () => {
  it("company campaigns: the score model scores, the main model drafts, the run says so", async () => {
    registerConnector({
      name: "stub",
      displayName: "stub",
      tier: "free",
      keyEnvVar: null,
      phases: ["research"],
      isConfigured: () => true,
      async research({ domain }) {
        return {
          leads: [{ domain, companyName: "Acme", source: "stub" }],
          contacts: [{ name: "Jane Doe", leadDomain: domain, email: `jane@${domain}`, source: "stub" }],
        };
      },
    });
    const calls: string[] = [];
    const { run, cost } = await runCampaign({
      id: "split-1",
      icp: "x",
      domains: ["acme.com"],
      channel: "linkedin",
      provider: model("strong", calls),
      scoreProvider: model("cheap", calls),
      suppressions: EMPTY_SUPPRESSION_LIST,
      now: () => T,
    });
    expect(calls).toEqual(["cheap:score", "strong:draft"]);
    expect(run.seamModels).toEqual({ score: { provider: "minimax", model: "cheap" }, draft: { provider: "anthropic", model: "strong" } });
    expect(run.model).toBe("strong");
    expect(cost.calls).toBe(2);
  });

  it("property campaigns split the same way; without a score model nothing changes", async () => {
    const p = {
      key: propertyKey("12033", "1"),
      apn: "1",
      countyFips: "12033",
      address: { line1: "14 Perdido Key Dr", city: "Pensacola", state: "FL", zip: "32507" },
      attributes: {},
      source: "stub",
    };
    registerConnector({
      name: "stub-gis",
      displayName: "stub",
      tier: "free",
      keyEnvVar: null,
      phases: ["research"],
      queryKinds: ["area"],
      isConfigured: () => true,
      async research() {
        return {
          leads: [],
          contacts: [],
          properties: [p],
          parties: [
            {
              key: "o",
              kind: "person",
              name: "Pat Owner",
              mailingAddress: { line1: "9 Elm St", city: "Nashville", state: "TN", zip: "37201" },
              source: "stub",
              licenseTerms: { outreachRestricted: false },
            },
          ],
          ownerships: [{ propertyKey: p.key, partyKey: "o", role: "owner", source: "stub", fetchedAt: T }],
        };
      },
    });
    const base = {
      icp: "x",
      queries: [{ kind: "area" as const, geography: { zips: ["32507"] }, filters: {} }],
      suppressions: EMPTY_SUPPRESSION_LIST,
      now: () => T,
    };
    const calls: string[] = [];
    const split = await runPropertyCampaign({ ...base, id: "split-2", provider: model("strong", calls), scoreProvider: model("cheap", calls) });
    expect(calls).toEqual(["cheap:score", "strong:draft"]);
    expect(split.run.seamModels?.score.model).toBe("cheap");

    const single: string[] = [];
    const one = await runPropertyCampaign({ ...base, id: "split-3", provider: model("strong", single) });
    expect(single).toEqual(["strong:score", "strong:draft"]);
    expect(one.run.seamModels).toBeUndefined();
  });
});
