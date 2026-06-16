/**
 * tests/evals.test.ts — verifies the cross-provider eval HARNESS itself (Epic 4).
 *
 * This runs the harness in --offline mode (deterministic STUB provider, no keys,
 * free) and asserts:
 *   1. the stub provider is reported SUPPORTED — every fixture passes
 *      schemaConformance + draftContract + groundingHeuristic;
 *   2. specifically that schemaConformance + draftContract pass on every draft
 *      fixture (the seam-contract check that runs in CI without spending money);
 *   3. a deliberately-hallucinated draft output IS caught by groundingHeuristic
 *      (the harness's no-fabrication tripwire actually fires).
 *
 * No live API calls. The stub satisfies both seam schemas via schema.parse().
 */

import { describe, expect, it } from "vitest";
import { runEvals } from "../evals/run.js";
import { draftContract, groundingHeuristic, schemaConformance } from "../evals/scorers.js";
import type { DraftContext, DraftOutput } from "../pipeline_core/seam.js";

describe("eval harness — offline (stub provider, no keys, free)", () => {
  it("reports the stub provider SUPPORTED and the run all-supported", async () => {
    const result = await runEvals({ offline: true });
    expect(result.offline).toBe(true);
    expect(result.allSupported).toBe(true);

    const anthropic = result.providers.find((p) => p.provider === "anthropic");
    expect(anthropic).toBeDefined();
    expect(anthropic!.supported).toBe(true);
    expect(anthropic!.totalCostUsd).toBe(0); // stub is free
  });

  it("every draft fixture passes schemaConformance + draftContract", async () => {
    const result = await runEvals({ offline: true });
    const anthropic = result.providers.find((p) => p.provider === "anthropic")!;
    const drafts = anthropic.fixtures.filter((f) => f.seam === "draft");

    expect(drafts.length).toBeGreaterThanOrEqual(3); // 3-4 golden draft fixtures
    for (const f of drafts) {
      expect(f.scorers.schemaConformance?.pass, `${f.fixture} schemaConformance`).toBe(true);
      expect(f.scorers.draftContract?.pass, `${f.fixture} draftContract`).toBe(true);
      expect(f.scorers.groundingHeuristic?.pass, `${f.fixture} groundingHeuristic`).toBe(true);
    }
  });

  it("every score fixture passes schemaConformance", async () => {
    const result = await runEvals({ offline: true });
    const anthropic = result.providers.find((p) => p.provider === "anthropic")!;
    const scores = anthropic.fixtures.filter((f) => f.seam === "score");
    expect(scores.length).toBeGreaterThanOrEqual(3);
    for (const f of scores) {
      expect(f.scorers.schemaConformance?.pass, `${f.fixture} schemaConformance`).toBe(true);
    }
  });

  it("can run multiple providers offline (model-agnostic story)", async () => {
    const result = await runEvals({ offline: true, providers: ["anthropic", "openai"] });
    expect(result.providers.map((p) => p.provider)).toEqual(["anthropic", "openai"]);
    expect(result.allSupported).toBe(true); // stub passes regardless of provider name
  });
});

describe("groundingHeuristic catches fabrication", () => {
  // A thin-data context: the inputs contain NO funding, investor, or metric facts.
  const thinCtx: DraftContext = {
    icp: "Outbound automation for founder-led sales at seed-to-Series-A B2B SaaS.",
    lead: { domain: "quietlabs.dev", companyName: "Quiet Labs", source: "manual" },
    contact: { name: "Sam Okafor", leadDomain: "quietlabs.dev", source: "manual" },
    angles: [],
    channel: "email",
  };

  it("flags a fabricated funding figure absent from the inputs", () => {
    const hallucinated: DraftOutput = {
      subject: "Scaling Quiet Labs",
      body:
        "Hi Sam — congrats on Quiet Labs raising your $12M Series B from Sequoia Capital. " +
        "Teams at that stage usually need outbound help — open to chatting?",
      cta: "Open to a 15-minute call next week?",
    };

    // It's schema-valid and meets the draft contract — fabrication is invisible to those.
    expect(schemaConformance("draft", hallucinated).pass).toBe(true);
    expect(draftContract(thinCtx, hallucinated).pass).toBe(true);

    // But grounding catches it.
    const grounding = groundingHeuristic(thinCtx, hallucinated);
    expect(grounding.pass).toBe(false);
    const blob = grounding.findings.join(" | ");
    expect(blob).toMatch(/\$12M/i); // fabricated dollar figure
    expect(blob).toMatch(/series b/i); // fabricated round
    expect(blob).toMatch(/sequoia capital/i); // fabricated investor
  });

  it("passes an honest, grounded draft for the same thin-data context", () => {
    const honest: DraftOutput = {
      subject: "An idea for Quiet Labs",
      body:
        "Hi Sam — I work with founders on outbound and thought Quiet Labs might be a fit. " +
        "No assumptions about your current setup; happy to share what's worked.",
      cta: "Open to a 15-minute call next week?",
    };
    expect(groundingHeuristic(thinCtx, honest).pass).toBe(true);
  });

  it("does NOT flag a round claim that IS grounded in the angles", () => {
    const ctx: DraftContext = {
      icp: "Outbound automation for founder-led sales at seed-to-Series-A B2B SaaS.",
      lead: { domain: "northbeam.io", companyName: "Northbeam", source: "apollo" },
      contact: { name: "Priya Nair", leadDomain: "northbeam.io", source: "apollo" },
      angles: ["Northbeam raised a Series A and is hiring on the sales team."],
      channel: "email",
    };
    const grounded: DraftOutput = {
      subject: "An idea for Northbeam",
      body:
        "Hi Priya — saw Northbeam raised a Series A and is growing the sales team. " +
        "Teams at that stage often want outbound on rails — happy to help.",
      cta: "Open to a 15-minute call next week?",
    };
    expect(groundingHeuristic(ctx, grounded).pass).toBe(true);
  });
});
