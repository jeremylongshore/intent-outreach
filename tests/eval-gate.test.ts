/**
 * tests/eval-gate.test.ts — the KEYED eval gate, exercised keylessly.
 *
 * The real AI SDK path (getProviderUnchecked → generateText → Output.object)
 * runs against a MockLanguageModelV4 injected via mocked @ai-sdk/anthropic and
 * @ai-sdk/xai factories. No network, no key, no spend. Guards:
 *   - score bands: an out-of-band score fails the gate
 *   - angle laundering: a fabricated funding angle fails even though scoreLead drops it
 *   - repeat-k: every run must pass; pass rate is reported
 *   - result record: correct file name + shape, real (mock) usage → cost
 *   - --judge: mean-rating floor, fail closed
 *   - supported.ts consistency + SUPPORTED_PROVIDERS derivation
 *   - the ungated bypass exists only for the harness
 *   - promote: updates supported.ts on pass only, never providers.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MockLanguageModelV4 } from "ai/test";

type Kind = "score" | "draft" | "judge";
interface Call {
  kind: Kind;
  prompt: string;
  n: number;
}

const mock = vi.hoisted(() => ({
  calls: 0,
  /** Return the JSON object the model "generates" for this call. */
  respond: (_c: { kind: "score" | "draft" | "judge"; prompt: string; n: number }): unknown => ({}),
}));

function makeModel(provider: string, modelId: string) {
  return new MockLanguageModelV4({
    provider,
    modelId,
    doGenerate: async (options) => {
      const schema = JSON.stringify((options.responseFormat as { schema?: unknown } | undefined)?.schema ?? {});
      const kind: Kind = schema.includes('"fitScore"') ? "score" : schema.includes('"rating"') ? "judge" : "draft";
      const n = mock.calls++;
      const text = JSON.stringify(mock.respond({ kind, prompt: JSON.stringify(options.prompt), n }));
      return {
        content: [{ type: "text", text }],
        finishReason: { unified: "stop", raw: "end_turn" },
        usage: {
          inputTokens: { total: 1000, noCache: 1000, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 100, text: 100, reasoning: 0 },
        },
        warnings: [],
      };
    },
  });
}

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: () => (modelId: string) => makeModel("anthropic.messages", modelId),
}));
vi.mock("@ai-sdk/xai", () => ({
  createXai: () => (modelId: string) => makeModel("xai.chat", modelId),
}));

const { runEvals, recordFileName, parseArgs, formatReport } = await import("../evals/run.js");
const { angleGrounding, scoreBand } = await import("../evals/scorers.js");
const { APPROVED_MODELS, supportedProviderNames } = await import("../evals/supported.js");
const { promote, readApprovedBlock, upsertApproved } = await import("../evals/promote.js");
const providers = await import("../pipeline_core/providers.js");
const { promptRef } = await import("../pipeline_core/prompts.js");
const { _resetSecretCache } = await import("../pipeline_core/secrets.js");

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

// ── canned model behaviour ──────────────────────────────────────────────────

/** In-band score per fixture lead (bands live in evals/fixtures/score/*.json). */
function goodScore(prompt: string) {
  if (prompt.includes("northbeam.io")) return { fitScore: 85, fitReason: "In the ICP.", angles: ["Northbeam raised a Series A."] };
  if (prompt.includes("ledgerline.io")) return { fitScore: 55, fitReason: "Partial fit.", angles: [] };
  return { fitScore: 10, fitReason: "Outside the ICP or too little data.", angles: [] };
}
const GOOD_DRAFT = {
  decline: false,
  declineReason: null,
  subject: "An idea for your team",
  body: "Hi, I work with founders on outbound and thought this might be a fit. No assumptions about your current setup.",
  cta: "Open to a 15-minute call next week?",
};
function goodModel(c: Call): unknown {
  if (c.kind === "score") return goodScore(c.prompt);
  if (c.kind === "judge") return { grounded: true, hasCta: true, hallucinatedFacts: [], rating: 5, rationale: "ok" };
  // LinkedIn: subject is normalized to null by draftMessage.
  return GOOD_DRAFT;
}

let dir: string;
const saved: Record<string, string | undefined> = {};
const ENV = ["ANTHROPIC_API_KEY", "XAI_API_KEY", "INTENT_OUTREACH_ALLOW_UNGATED", "INTENT_OUTREACH_MODEL"];
const NOW = () => new Date("2026-10-04T12:00:00Z");

beforeEach(() => {
  for (const k of ENV) saved[k] = process.env[k];
  delete process.env.INTENT_OUTREACH_ALLOW_UNGATED;
  delete process.env.INTENT_OUTREACH_MODEL;
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  process.env.XAI_API_KEY = "xai-test";
  _resetSecretCache();
  mock.calls = 0;
  mock.respond = goodModel;
  dir = mkdtempSync(join(tmpdir(), "eval-gate-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  _resetSecretCache();
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const keyed = (extra: Record<string, unknown> = {}) =>
  runEvals({ providers: ["anthropic"], model: "claude-sonnet-5-5", resultsDir: dir, now: NOW, ...extra });

// ── baseline ────────────────────────────────────────────────────────────────

describe("keyed gate — a well-behaved model passes", () => {
  it("passes every fixture in all 3 runs (default repeat) and writes a pass record", async () => {
    const r = await keyed();
    const p = r.providers[0]!;
    expect(p.mode).toBe("keyed");
    expect(p.repeat).toBe(3);
    expect(p.fixtures.every((f) => f.runs.length === 3)).toBe(true);
    expect(p.supported).toBe(true);
    expect(p.passRate).toBe(1);
    expect(p.recordPath).not.toBeNull();
    expect(p.totalCostUsd).toBeGreaterThan(0);
  });
});

// ── score bands ─────────────────────────────────────────────────────────────

describe("scoreBand", () => {
  it("a weak-fit lead scored 95 fails the gate", async () => {
    mock.respond = (c) => (c.kind === "score" ? { fitScore: 95, fitReason: "great", angles: [] } : goodModel(c));
    const r = await keyed({ repeat: 1 });
    const p = r.providers[0]!;
    expect(p.supported).toBe(false);
    const weak = p.fixtures.find((f) => f.fixture === "weak-fit")!;
    expect(weak.pass).toBe(false);
    expect(weak.scorers.scoreBand?.findings.join(" ")).toMatch(/fitScore 95 outside expected band \[0, 30\]/);
    // the strong-fit fixture is in band at 95
    expect(p.fixtures.find((f) => f.fixture === "strong-fit")!.scorers.scoreBand?.pass).toBe(true);
  });

  it("every score fixture declares a band", async () => {
    const files = readdirSync(join(REPO, "evals/fixtures/score")).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThanOrEqual(5);
    for (const f of files) {
      const fx = JSON.parse(readFileSync(join(REPO, "evals/fixtures/score", f), "utf8"));
      expect(typeof fx.expect?.scoreMin, f).toBe("number");
      expect(typeof fx.expect?.scoreMax, f).toBe("number");
      expect(fx.expect.scoreMin).toBeLessThanOrEqual(fx.expect.scoreMax);
    }
  });

  it("a missing band fails closed", () => {
    expect(scoreBand(undefined, { fitScore: 50, fitReason: "", angles: [] }).pass).toBe(false);
  });
});

// ── angle laundering ────────────────────────────────────────────────────────

describe("angleGrounding (score seam)", () => {
  it('fails a fabricated "Raised a $20M Series B" angle on the no-funding fixture', async () => {
    mock.respond = (c) =>
      c.kind === "score" && c.prompt.includes("ledgerline.io")
        ? { fitScore: 55, fitReason: "fit", angles: ["Raised a $20M Series B and is scaling sales."] }
        : goodModel(c);
    const r = await keyed({ repeat: 1 });
    const nf = r.providers[0]!.fixtures.find((f) => f.fixture === "no-funding-signal")!;
    expect(nf.pass).toBe(false);
    expect(nf.scorers.angleGrounding?.findings.join(" ")).toMatch(/fabricated angle dropped/);
    expect(r.providers[0]!.supported).toBe(false);
  });

  it("fails a bare funding claim with no funding signal, passes it when funding is in the inputs", () => {
    const lead = { domain: "ledgerline.io", companyName: "Ledgerline", source: "apollo" };
    const bare = angleGrounding({ icp: "x", lead, contacts: [], enrichments: [] }, ["Recently raised a new round."], []);
    expect(bare.pass).toBe(false);
    const funded = angleGrounding(
      {
        icp: "x",
        lead,
        contacts: [],
        enrichments: [
          {
            subjectType: "lead",
            subjectKey: "ledgerline.io",
            provider: "crunchbase",
            funding: { lastRound: "Seed" },
            data: {},
            fetchedAt: "2026-06-15T10:00:00.000Z",
          },
        ],
      },
      ["Recently raised a new round."],
      [],
    );
    expect(funded.pass).toBe(true);
  });
});

// ── repeat-k ────────────────────────────────────────────────────────────────

describe("repeat-k", () => {
  it("a fixture that passes 2 of 3 runs fails, with passRate 2/3", async () => {
    let strongCalls = 0;
    mock.respond = (c) => {
      if (c.kind === "score" && c.prompt.includes("northbeam.io")) {
        strongCalls++;
        return strongCalls === 3 ? { fitScore: 20, fitReason: "flaky", angles: [] } : goodScore(c.prompt);
      }
      return goodModel(c);
    };
    const r = await keyed({ repeat: 3 });
    const p = r.providers[0]!;
    const strong = p.fixtures.find((f) => f.fixture === "strong-fit")!;
    expect(strong.passes).toBe(2);
    expect(strong.passRate).toBeCloseTo(2 / 3);
    expect(strong.pass).toBe(false);
    expect(p.supported).toBe(false);
    expect(p.runPassRate).toBeLessThan(1);
    expect(formatReport(r)).toMatch(/\[FAIL\] score\/strong-fit {2}\(2\/3 runs\)/);
  });

  it("parseArgs validates --repeat and offline defaults to 1 run", async () => {
    expect(parseArgs(["--providers", "anthropic", "--repeat", "5"]).repeat).toBe(5);
    expect(() => parseArgs(["--repeat", "0"])).toThrow(/positive integer/);
    const off = await runEvals({ offline: true });
    expect(off.providers[0]!.repeat).toBe(1);
  });
});

// ── result record ───────────────────────────────────────────────────────────

describe("result record (keyed)", () => {
  it("is written as <date>-<provider>-<model>-<promptRef>.json with the documented shape", async () => {
    const r = await keyed();
    const p = r.providers[0]!;
    const ref = promptRef("outreach.v3.md");
    expect(ref).toMatch(/^outreach\.v3@[0-9a-f]{8}$/);
    const expected = `2026-10-04-anthropic-claude-sonnet-5-5-${ref}.json`;
    expect(recordFileName("anthropic", "claude-sonnet-5-5", ref, NOW())).toBe(expected);
    expect(p.recordPath).toBe(join(dir, expected));
    expect(readdirSync(dir)).toEqual([expected]);

    const rec = JSON.parse(readFileSync(p.recordPath!, "utf8"));
    expect(rec.recordVersion).toBe(1);
    expect(rec.provider).toBe("anthropic");
    expect(rec.model).toBe("claude-sonnet-5-5");
    expect(rec.promptRef).toBe(ref);
    expect(rec.promptRefs.score).toEqual([promptRef("research.v2.md"), promptRef("enrich.v2.md")]);
    expect(rec.repeat).toBe(3);
    expect(rec.fixtures).toHaveLength(9);
    for (const f of rec.fixtures) {
      expect(f.runs).toBe(3);
      expect(f.outcomes).toHaveLength(3);
      expect(f.outcomes[0]).toHaveProperty("output");
    }
    // 9 fixtures x 3 runs x 1000/100 tokens, real usage path through the SDK
    expect(rec.cost.inputTokens).toBe(27_000);
    expect(rec.cost.outputTokens).toBe(2_700);
    expect(rec.cost.totalUsd).toBeGreaterThan(0);
    expect(rec.summary).toEqual({ fixtures: 9, fixturesPassed: 9, passRate: 1, runPassRate: 1, verdict: "pass" });
  });

  it("offline runs never write a record", async () => {
    const r = await runEvals({ offline: true, resultsDir: dir });
    expect(r.providers[0]!.recordPath).toBeNull();
    expect(readdirSync(dir)).toEqual([]);
  });

  it("a guard-rejected draft is a failed run, with its spend metered", async () => {
    mock.respond = (c) =>
      c.kind === "draft" ? { ...GOOD_DRAFT, body: `${GOOD_DRAFT.body} Book here: https://evil.example/x` } : goodModel(c);
    const r = await keyed({ repeat: 1 });
    const draft = r.providers[0]!.fixtures.find((f) => f.seam === "draft")!;
    expect(draft.pass).toBe(false);
    expect(draft.scorers.draftGuard?.findings.join(" ")).toMatch(/url not present/);
    expect(draft.costUsd).toBeGreaterThan(0);
  });
});

// ── declines ────────────────────────────────────────────────────────────────

const DECLINE = {
  decline: true,
  declineReason: "Not a B2B SaaS company, so the offer does not apply.",
  subject: null,
  body: "",
  cta: "",
};

describe("declining out-of-ICP leads", () => {
  it("a decline on the weak-fit (expectDecline) fixture passes the run", async () => {
    mock.respond = (c) =>
      c.kind === "draft" && c.prompt.includes("Harbor Freight Coffee Roasters") ? DECLINE : goodModel(c);
    const p = (await keyed({ repeat: 1 })).providers[0]!;
    const weak = p.fixtures.find((f) => f.seam === "draft" && f.fixture === "weak-fit-email")!;
    expect(weak.pass).toBe(true);
    expect(weak.runs[0]!.scorers.expectedDecline?.pass).toBe(true);
    expect(p.supported).toBe(true);
    // The record says why the run passed: the model's decline reason.
    const rec = JSON.parse(readFileSync(p.recordPath!, "utf8"));
    const weakRec = rec.fixtures.find((f: { fixture: string; seam: string }) => f.seam === "draft" && f.fixture === "weak-fit-email");
    expect(weakRec.outcomes[0].declined).toEqual(["declined: Not a B2B SaaS company, so the offer does not apply."]);
  });

  it("a decline on a strong-fit fixture is a false decline and fails the gate", async () => {
    mock.respond = (c) => (c.kind === "draft" && c.prompt.includes("linkedin") ? DECLINE : goodModel(c));
    const p = (await keyed({ repeat: 1 })).providers[0]!;
    const linkedin = p.fixtures.find((f) => f.seam === "draft" && f.fixture === "strong-fit-linkedin")!;
    expect(linkedin.pass).toBe(false);
    expect(linkedin.runs[0]!.scorers.falseDecline?.pass).toBe(false);
    expect(p.supported).toBe(false);
  });

  it("declined drafts are not sent to the judge", async () => {
    mock.respond = (c) =>
      c.kind === "draft" && c.prompt.includes("Harbor Freight Coffee Roasters") ? DECLINE : goodModel(c);
    const p = (await keyed({ repeat: 1, judge: true })).providers[0]!;
    expect(p.judge?.perFixture.some((f) => f.fixture.includes("weak-fit"))).toBe(false);
    expect(p.judge?.pass).toBe(true);
  });
});

// ── judge ───────────────────────────────────────────────────────────────────

describe("--judge", () => {
  it("is off by default (no judge calls)", async () => {
    const r = await keyed({ repeat: 1 });
    expect(r.providers[0]!.judge).toBeNull();
  });

  it("fails the gate when the mean rating is below the floor", async () => {
    mock.respond = (c) =>
      c.kind === "judge"
        ? { grounded: false, hasCta: true, hallucinatedFacts: ["x"], rating: 2, rationale: "weak" }
        : goodModel(c);
    const r = await keyed({ repeat: 1, judge: true });
    const p = r.providers[0]!;
    expect(p.judge?.meanRating).toBe(2);
    expect(p.judge?.pass).toBe(false);
    expect(p.supported).toBe(false);
    expect(JSON.parse(readFileSync(p.recordPath!, "utf8")).judge.pass).toBe(false);
  });

  it("judges each fixture against its own judgeMin (thin/weak 3, strong 4)", async () => {
    // "Generic but not false" (3) on the thin and weak-fit leads, 4 on strong-fit.
    const thinOrWeak = (p: string) => p.includes("Quiet Labs") || p.includes("Harbor Freight Coffee Roasters");
    mock.respond = (c) =>
      c.kind === "judge"
        ? { grounded: true, hasCta: true, hallucinatedFacts: [], rating: thinOrWeak(c.prompt) ? 3 : 4, rationale: "ok" }
        : goodModel(c);
    const p = (await keyed({ repeat: 1, judge: true })).providers[0]!;
    expect(p.judge?.meanRating).toBe(3.5); // below the old global floor of 4…
    expect(p.judge?.perFixture.every((f) => f.pass)).toBe(true); // …but every fixture meets its own minimum
    expect(p.judge?.pass).toBe(true);
    expect(p.supported).toBe(true);
    expect(p.judge?.perFixture.find((f) => f.fixture.includes("thin-data"))?.min).toBe(3);
  });

  it("fails when a strong-fit fixture drops to generic, even if the mean looks fine", async () => {
    mock.respond = (c) =>
      c.kind === "judge"
        ? { grounded: true, hasCta: true, hallucinatedFacts: [], rating: c.prompt.includes("linkedin") ? 3 : 5, rationale: "ok" }
        : goodModel(c);
    const p = (await keyed({ repeat: 1, judge: true })).providers[0]!;
    const linkedin = p.judge?.perFixture.find((f) => f.fixture.includes("strong-fit-linkedin"));
    expect(linkedin).toMatchObject({ min: 4, meanRating: 3, pass: false });
    expect(p.judge?.pass).toBe(false);
    expect(p.supported).toBe(false);
  });

  it("passes at the floor, and cannot run offline", async () => {
    const r = await keyed({ repeat: 1, judge: true, judgeFloor: 4 });
    expect(r.providers[0]!.judge?.meanRating).toBe(5);
    expect(r.providers[0]!.supported).toBe(true);
    await expect(runEvals({ offline: true, judge: true })).rejects.toThrow(/offline/);
  });
});

// ── supported.ts ────────────────────────────────────────────────────────────

describe("evals/supported.ts consistency", () => {
  it("every verified:true entry points to an existing, passing record for the same pair", () => {
    for (const e of APPROVED_MODELS) {
      if (!e.verified) continue;
      expect(e.resultFile, `${e.provider}/${e.model}`).toBeTruthy();
      const path = join(REPO, e.resultFile!);
      expect(existsSync(path), path).toBe(true);
      const rec = JSON.parse(readFileSync(path, "utf8"));
      expect(rec.summary.verdict).toBe("pass");
      expect(rec.provider).toBe(e.provider);
      expect(rec.model).toBe(e.model);
      expect(rec.repeat).toBeGreaterThanOrEqual(3);
    }
  });

  it("unverified entries are labelled as legacy claims needing a re-run (no fabricated records)", () => {
    for (const e of APPROVED_MODELS.filter((x) => !x.verified)) {
      expect(e.evidence).toMatch(/re-run required/);
    }
  });

  it("no pair is listed twice", () => {
    const keys = APPROVED_MODELS.map((e) => `${e.provider}/${e.model}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("SUPPORTED_PROVIDERS is derived from it (≥1 approved pair ⇔ supported)", () => {
    expect([...providers.SUPPORTED_PROVIDERS].sort()).toEqual(supportedProviderNames().sort());
    expect([...providers.SUPPORTED_PROVIDERS].sort()).toEqual(["anthropic", "minimax", "openai"]);
  });

  it("the markers block parses to exactly APPROVED_MODELS", () => {
    const src = readFileSync(join(REPO, "evals/supported.ts"), "utf8");
    expect(readApprovedBlock(src)).toEqual(APPROVED_MODELS);
  });
});

// ── ungated bypass ──────────────────────────────────────────────────────────

describe("ungated bypass is harness-only", () => {
  it("the harness evaluates xai (ungated) without INTENT_OUTREACH_ALLOW_UNGATED", async () => {
    const r = await runEvals({ providers: ["xai"], repeat: 1, resultsDir: dir, now: NOW });
    expect(r.providers[0]!.model).toBe("grok-2-latest");
    expect(r.providers[0]!.supported).toBe(true);
  });

  it("product getProvider still refuses xai", async () => {
    await expect(providers.getProvider({ provider: "xai" })).rejects.toThrow(/eval gate/i);
  });

  it("no product code (pipeline_core, mcp, cli.ts) calls getProviderUnchecked", () => {
    const offenders: string[] = [];
    const walk = (d: string) => {
      for (const ent of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, ent.name);
        if (ent.isDirectory()) walk(p);
        else if (p.endsWith(".ts") && !p.endsWith(join("pipeline_core", "providers.ts"))) {
          if (readFileSync(p, "utf8").includes("getProviderUnchecked")) offenders.push(p);
        }
      }
    };
    walk(join(REPO, "pipeline_core"));
    walk(join(REPO, "mcp"));
    if (readFileSync(join(REPO, "cli.ts"), "utf8").includes("getProviderUnchecked")) offenders.push("cli.ts");
    expect(offenders).toEqual([]);
  });
});

// ── unapproved-model warning ────────────────────────────────────────────────

describe("getProvider warns on an unapproved model under a supported provider", () => {
  it("writes one stderr warning per pair, none for an approved pair", async () => {
    providers._resetUnapprovedWarnings();
    const write = vi.mocked(process.stderr.write);
    write.mockClear();
    await providers.getProvider({ provider: "anthropic", model: "claude-sonnet-4-6" });
    expect(write).not.toHaveBeenCalled();
    await providers.getProvider({ provider: "anthropic", model: "claude-unlisted-9" });
    await providers.getProvider({ provider: "anthropic", model: "claude-unlisted-9" });
    const msgs = write.mock.calls.map((c) => String(c[0])).filter((m) => m.includes("no approved eval record"));
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatch(/evals:promote -- --provider anthropic --model claude-unlisted-9/);
  });
});

// ── promote ─────────────────────────────────────────────────────────────────

describe("evals:promote", () => {
  const seedSource = () => readFileSync(join(REPO, "evals/supported.ts"), "utf8");
  const providersBefore = () => readFileSync(join(REPO, "pipeline_core/providers.ts"), "utf8");

  it("upsertApproved adds a new pair and replaces an existing one", () => {
    const entry = {
      provider: "anthropic" as const,
      model: "claude-sonnet-5-5",
      resultFile: "evals/results/x.json",
      verified: true,
      evidence: "e",
    };
    const added = readApprovedBlock(upsertApproved(seedSource(), entry));
    expect(added).toHaveLength(APPROVED_MODELS.length + 1);
    const replaced = readApprovedBlock(upsertApproved(upsertApproved(seedSource(), entry), { ...entry, evidence: "f" }));
    expect(replaced.filter((e) => e.model === "claude-sonnet-5-5")).toEqual([{ ...entry, evidence: "f" }]);
  });

  it("on PASS records verified:true in supported.ts and prints the DEFAULT_MODEL edit without making it", async () => {
    const file = join(dir, "supported.ts");
    writeFileSync(file, seedSource());
    const before = providersBefore();
    const lines: string[] = [];
    const res = await promote({
      provider: "anthropic",
      model: "claude-sonnet-5-5",
      supportedFile: file,
      repoRoot: dir,
      run: { resultsDir: join(dir, "evals/results"), now: NOW },
      log: (l) => lines.push(l),
    });
    expect(res.pass).toBe(true);
    const entry = readApprovedBlock(readFileSync(file, "utf8")).find((e) => e.model === "claude-sonnet-5-5")!;
    expect(entry.verified).toBe(true);
    expect(entry.resultFile).toBe(`evals/results/2026-10-04-anthropic-claude-sonnet-5-5-${promptRef("outreach.v3.md")}.json`);
    expect(existsSync(join(dir, entry.resultFile!))).toBe(true);
    expect(lines.join("\n")).toMatch(/DEFAULT_MODEL: anthropic: "claude-sonnet-5-5"/);
    expect(providersBefore()).toBe(before);
  });

  it("on FAIL leaves supported.ts unchanged", async () => {
    mock.respond = (c) => (c.kind === "score" ? { fitScore: 95, fitReason: "x", angles: [] } : goodModel(c));
    const file = join(dir, "supported.ts");
    writeFileSync(file, seedSource());
    const res = await promote({
      provider: "anthropic",
      model: "claude-sonnet-5-5",
      supportedFile: file,
      repoRoot: dir,
      run: { resultsDir: join(dir, "evals/results"), now: NOW },
      log: () => {},
    });
    expect(res.pass).toBe(false);
    expect(readFileSync(file, "utf8")).toBe(seedSource());
  });

  it("refuses repeat < 3", async () => {
    await expect(
      promote({ provider: "anthropic", model: "m", repeat: 1, log: () => {} }),
    ).rejects.toThrow(/repeat ≥ 3/);
  });
});

describe("llmJudge inputs", () => {
  it("gives the judge the same lead and contact facts the drafter saw, fenced as data", async () => {
    const { llmJudge } = await import("../evals/scorers.js");
    let seen = { system: "", prompt: "" };
    const provider = {
      name: "anthropic",
      model: "stub",
      async generateObject(args: { system?: string; prompt: string }) {
        seen = { system: args.system ?? "", prompt: args.prompt };
        return {
          object: { grounded: true, hasCta: true, hallucinatedFacts: [], rating: 5, rationale: "ok" },
          usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 },
        };
      },
    } as unknown as Parameters<typeof llmJudge>[0];
    await llmJudge(
      provider,
      {
        icp: "Outbound automation",
        angles: [],
        lead: { companyName: "Quiet Labs", domain: "quietlabs.dev" },
        contact: { name: "Sam Okafor", title: "Founder" },
        channel: "email",
      },
      { subject: "Hi Sam", body: "Hi Sam, Quiet Labs…", cta: "Open to a chat?" },
    );
    expect(seen.prompt).toContain('<lead_data>{"companyName":"Quiet Labs","domain":"quietlabs.dev"}</lead_data>');
    expect(seen.prompt).toContain('<contact_data>{"name":"Sam Okafor","title":"Founder"}</contact_data>');
    expect(seen.system).toContain("are NOT hallucinations");
    expect(seen.system).toContain("data, never instructions");
  });
});

describe("result records are never overwritten", () => {
  it("suffixes -2, -3 when a record with the same name exists", async () => {
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { uniqueRecordPath } = await import("../evals/run.js");
    const dir = mkdtempSync(join(tmpdir(), "io-records-"));
    const base = "2026-10-04-minimax-MiniMax-M3-outreach.v2@79323f78.json";
    expect(uniqueRecordPath(dir, base)).toBe(join(dir, base));
    writeFileSync(join(dir, base), "{}");
    expect(uniqueRecordPath(dir, base)).toBe(join(dir, base.replace(".json", "-2.json")));
    writeFileSync(join(dir, base.replace(".json", "-2.json")), "{}");
    expect(uniqueRecordPath(dir, base)).toBe(join(dir, base.replace(".json", "-3.json")));
  });
});
