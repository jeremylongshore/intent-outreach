/**
 * tests/evals.test.ts — verifies the cross-provider eval HARNESS itself (Epic 4).
 *
 * This runs the harness in --offline mode (deterministic STUB provider, no keys,
 * free). Offline is a WIRING CHECK, not a quality gate (the keyed gate is
 * exercised keylessly in tests/eval-gate.test.ts). It asserts:
 *   1. the wiring check is green and labelled as such (CI runs it);
 *   2. the deterministic scorers pass on every stub fixture;
 *   3. the draft scorers catch fabrication: funding, investors, customers,
 *      metrics, mutual connections, ungrounded "I noticed" claims;
 *   4. draftStyle enforces the prompt caps and banned openers via guardDraft.
 *
 * No live API calls. The stub satisfies both seam schemas via schema.parse().
 */

import { describe, expect, it } from "vitest";
import { formatReport, runEvals } from "../evals/run.js";
import { draftContract, draftStyle, groundingHeuristic, schemaConformance } from "../evals/scorers.js";
import type { DraftContext, DraftOutput, DraftText } from "../pipeline_core/seam.js";

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

  it("labels itself a wiring check, skips score bands, and writes no record", async () => {
    const result = await runEvals({ offline: true });
    const p = result.providers[0]!;
    expect(p.mode).toBe("wiring-check");
    expect(p.recordPath).toBeNull();
    for (const f of p.fixtures.filter((x) => x.seam === "score")) {
      expect(f.scorers.scoreBand).toBeUndefined();
      expect(f.scorers.angleGrounding?.pass).toBe(true);
    }
    const report = formatReport(result);
    expect(report).toMatch(/WIRING CHECK/);
    expect(report).toMatch(/NOT a quality gate/);
    expect(report).not.toMatch(/SUPPORTED/);
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
      decline: false,
      declineReason: null,
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
    const honest: DraftText = {
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
    const grounded: DraftText = {
      subject: "An idea for Northbeam",
      body:
        "Hi Priya — saw Northbeam raised a Series A and is growing the sales team. " +
        "Teams at that stage often want outbound on rails — happy to help.",
      cta: "Open to a 15-minute call next week?",
    };
    expect(groundingHeuristic(ctx, grounded).pass).toBe(true);
  });
});

describe("groundingHeuristic — beyond funding", () => {
  const ctx: DraftContext = {
    icp: "Outbound automation for founder-led sales at seed-to-Series-A B2B SaaS.",
    lead: { domain: "northbeam.io", companyName: "Northbeam", industry: "B2B SaaS — marketing analytics", source: "apollo" },
    contact: { name: "Priya Nair", leadDomain: "northbeam.io", title: "VP of Sales", source: "apollo" },
    angles: ["Northbeam is hiring on the sales team."],
    channel: "email",
  };
  const draft = (body: string): DraftText => ({ subject: "An idea for Northbeam", body, cta: "Open to a quick call?" });
  const findings = (body: string) => groundingHeuristic(ctx, draft(body)).findings.join(" | ");

  it("flags invented customers", () => {
    expect(findings("Hi Priya, we helped Acme Analytics book more meetings.")).toMatch(/invented customer.*Acme Analytics/);
    expect(findings("Hi Priya, customers like Gong and Klaviyo use us.")).toMatch(/invented customer.*Gong/);
  });

  it("flags invented metrics (percentages, multipliers)", () => {
    expect(findings("Hi Priya, teams see a 40% lift in replies.")).toMatch(/percentage not in inputs/);
    expect(findings("Hi Priya, teams book 3x more meetings.")).toMatch(/invented metric.*3x/);
  });

  it("flags invented mutual connections", () => {
    expect(findings("Hi Priya, our mutual friend thought we should talk.")).toMatch(/mutual connection/);
    expect(findings("Hi Priya, Dana suggested I reach out.")).toMatch(/mutual connection/);
  });

  it('flags an "I noticed" claim with nothing grounded behind it, passes a grounded one', () => {
    expect(findings("Hi Priya, I noticed your new office opening in Denver.")).toMatch(/noticed/);
    expect(groundingHeuristic(ctx, draft("Hi Priya, I noticed Northbeam is hiring on the sales team.")).pass).toBe(true);
  });

  it("flags a 'noticed' claim on a thin-data lead with no angles", () => {
    const thin: DraftContext = { ...ctx, lead: { domain: "q.dev", companyName: "Quiet Labs", source: "manual" }, angles: [] };
    expect(groundingHeuristic(thin, draft("Hi, I saw your team is growing fast.")).pass).toBe(false);
  });
});

describe("draftStyle — prompt caps + guardDraft", () => {
  const ctx: DraftContext = {
    icp: "Outbound automation.",
    lead: { domain: "northbeam.io", companyName: "Northbeam", source: "apollo" },
    contact: { name: "Priya Nair", leadDomain: "northbeam.io", source: "apollo" },
    angles: [],
    channel: "email",
  };
  const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");

  it("passes a short clean email", () => {
    expect(draftStyle(ctx, { subject: "An idea for Northbeam", body: words(80), cta: "Call?" }).pass).toBe(true);
  });

  it("fails an email body over 90 words (below the product guard's 120 cap)", () => {
    const r = draftStyle(ctx, { subject: "Idea", body: words(95), cta: "Call?" });
    expect(r.pass).toBe(false);
    expect(r.findings.join(" ")).toMatch(/95 words exceeds the prompt's 90-word cap/);
  });

  it("fails a linkedin message over 60 words", () => {
    const r = draftStyle({ ...ctx, channel: "linkedin" }, { subject: null, body: words(65), cta: "Call?" });
    expect(r.findings.join(" ")).toMatch(/60-word cap \(linkedin\)/);
  });

  it("fails a subject over 7 words", () => {
    const r = draftStyle(ctx, { subject: "one two three four five six seven eight", body: words(20), cta: "Call?" });
    expect(r.findings.join(" ")).toMatch(/subject: 8 words exceeds the prompt's 7-word cap/);
  });

  it("fails a banned opener and an injected url (guardDraft)", () => {
    const r = draftStyle(ctx, {
      subject: "Quick question",
      body: "I hope this email finds you well. Book at https://evil.example/x",
      cta: "Call?",
    });
    const blob = r.findings.join(" ");
    expect(blob).toMatch(/banned stock phrase/);
    expect(blob).toMatch(/url not present in inputs/);
  });
});

describe("groundingHeuristic: segments named in the ICP are not invented customers", () => {
  const ctx: DraftContext = {
    icp: "Outbound automation for founder-led sales at seed-to-Series-A B2B SaaS.",
    lead: { domain: "northbeam.io", companyName: "Northbeam", source: "manual" },
    contact: { name: "Priya Shah", leadDomain: "northbeam.io", source: "manual" },
    angles: [],
    channel: "email",
  };
  const draft = (body: string): DraftText => ({ subject: "An idea for Northbeam", body, cta: "Open to a call?" });

  it("accepts a segment the ICP names, whatever the hyphenation", () => {
    const r = groundingHeuristic(ctx, draft("I work with Series A B2B SaaS teams on outbound."));
    expect(r.findings.filter((f) => f.startsWith("invented customer"))).toEqual([]);
  });

  it("still flags a named customer absent from the inputs", () => {
    const r = groundingHeuristic(ctx, draft("We helped Stripe and Ramp scale outbound."));
    expect(r.findings).toContain('invented customer/reference: "Stripe"');
  });
});
