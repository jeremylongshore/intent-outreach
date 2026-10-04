/**
 * evals/run.ts — the cross-provider EVAL HARNESS (D4 eval gate).
 *
 * A model is approved only if it passes the golden fixtures at each LLM seam,
 * every time, across k repeats. For each provider it runs every score/draft
 * fixture through the real seam (scoreLead / draftMessage), applies the
 * deterministic scorers, and emits a report + a verdict:
 *
 *   score fixture passes ⇔ schemaConformance + scoreBand + angleGrounding
 *   draft fixture passes ⇔ schemaConformance + draftContract + draftStyle + groundingHeuristic
 *   provider passes      ⇔ every fixture passes in ALL k runs (+ judge floor with --judge)
 *
 * Two modes:
 *   KEYED (the real gate)  --providers a,b   real models — COSTS MONEY. Default
 *                          --repeat 3. Writes a result record to
 *                          evals/results/<date>-<provider>-<model>-<promptRef>.json.
 *   OFFLINE (wiring check) --offline         a deterministic stub, no key, free.
 *                          Proves the harness, seams and scorers are wired end to
 *                          end; it does NOT measure model quality (the stub is
 *                          grounded by construction) and never writes a record.
 *
 * Providers: anthropic, openai, minimax, xai. The harness is the qualifier, so it may run
 * a provider/model that has not passed the gate yet (getProviderUnchecked);
 * product code cannot. Approval lives in evals/supported.ts (see evals/promote.ts).
 *
 *   tsx evals/run.ts --offline
 *   tsx evals/run.ts --providers anthropic                    # needs ANTHROPIC_API_KEY
 *   tsx evals/run.ts --providers anthropic --model claude-sonnet-5-5 --repeat 3 --judge
 *
 * Exit code: 0 if all requested providers pass, 1 otherwise.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_DRAFT_PROMPT,
  DEFAULT_SCORE_PROMPTS,
  DraftRejectedError,
  draftMessage,
  scoreLead,
  type DraftContext,
  type DraftOutput,
  type ScoreContext,
} from "../pipeline_core/seam.js";
import {
  getProviderUnchecked,
  type GenerateObjectArgs,
  type LLMProvider,
  type ProviderName,
} from "../pipeline_core/providers.js";
import { promptRef } from "../pipeline_core/prompts.js";
import type { Usage } from "../pipeline_core/cost.js";
import type { z } from "zod";
import {
  angleGrounding,
  draftContract,
  draftStyle,
  groundingHeuristic,
  llmJudge,
  schemaConformance,
  scoreBand,
  type ScoreExpect,
  type ScoreResult,
} from "./scorers.js";
import { approvedEntry } from "./supported.js";

// ───────────────────────────────── fixtures ──────────────────────────────────

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(HERE, "fixtures");
export const DEFAULT_RESULTS_DIR = join(HERE, "results");
export const DEFAULT_KEYED_REPEAT = 3;
export const DEFAULT_JUDGE_FLOOR = 4;
export const RECORD_VERSION = 1;

export interface ScoreFixture extends ScoreContext {
  name: string;
  expect?: ScoreExpect;
}
export interface DraftFixture extends DraftContext {
  name: string;
}

export function loadFixtures<T>(kind: "score" | "draft", fixturesDir = FIXTURES_DIR): T[] {
  const dir = join(fixturesDir, kind);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort() // deterministic order
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as T);
}

// ───────────────────────── deterministic stub provider ───────────────────────

type StubProvider = LLMProvider & { _setDraftContext(ctx: DraftContext | null): void };

/**
 * The OFFLINE wiring-check provider. It builds drafts from the CURRENT
 * fixture's own angles, so its output is grounded by construction: it proves
 * the plumbing (seams → schema → guard → scorers → report), not quality. That
 * is why offline mode skips scoreBand (a constant score proves nothing) and
 * never writes a result record.
 */
function makeStubProvider(name: ProviderName): StubProvider {
  let currentDraft: DraftContext | null = null;

  function superset() {
    const ctx = currentDraft;
    const lead = ctx?.lead.companyName ?? "your team";
    const firstAngle = ctx && ctx.angles.length > 0 ? ctx.angles[0]! : null;
    const channel = ctx?.channel ?? "email";
    const body = firstAngle
      ? `Hi, I work with teams like ${lead}. ${firstAngle} I'd love to help you do more of that with less manual work.`
      : `Hi, I work with founders on outbound, and thought ${lead} might be a fit. No assumptions about your current setup.`;
    return {
      fitScore: 50,
      fitReason: "Stub score (offline wiring check; not a judgment).",
      angles: ctx ? ctx.angles.slice(0, 3) : [],
      subject: channel === "email" ? `An idea for ${lead}` : null,
      body,
      cta: "Open to a 15-minute call next week?",
    };
  }

  return {
    name,
    model: "stub-model",
    async generateObject<S extends z.ZodTypeAny>(args: GenerateObjectArgs<S>): Promise<{ object: z.infer<S>; usage: Usage }> {
      return { object: args.schema.parse(superset()), usage: { inputTokens: 50, outputTokens: 40, costUsd: 0 } };
    },
    _setDraftContext(ctx: DraftContext | null) {
      currentDraft = ctx;
    },
  };
}

// ─────────────────────────────── result types ────────────────────────────────

export interface RunOutcome {
  pass: boolean;
  scorers: Record<string, ScoreResult>;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  /** The seam output (score or draft), when the call returned one. */
  output?: unknown;
  /** Set when the call threw (transport error, guard rejection...). */
  error?: string;
}

export interface FixtureResult {
  fixture: string;
  seam: "score" | "draft";
  runs: RunOutcome[];
  passes: number;
  passRate: number;
  /** true iff ALL runs passed. */
  pass: boolean;
  /** Scorers of the first failing run, or of the first run when all passed. */
  scorers: Record<string, ScoreResult>;
  costUsd: number;
}

export interface JudgeSummary {
  floor: number;
  meanRating: number;
  ratings: { fixture: string; run: number; rating: number; grounded: boolean; hallucinatedFacts: string[] }[];
  errors: string[];
  pass: boolean;
  costUsd: number;
}

export interface ProviderResult {
  provider: string;
  model: string;
  offline: boolean;
  /** "wiring-check" (offline stub) or "keyed" (the real gate). */
  mode: "wiring-check" | "keyed";
  repeat: number;
  fixtures: FixtureResult[];
  judge: JudgeSummary | null;
  /** Fixtures passed in all runs / fixtures. */
  passRate: number;
  /** Runs passed / total runs, across all fixtures. */
  runPassRate: number;
  supported: boolean;
  totalCostUsd: number;
  promptRefs: { score: string[]; draft: string };
  /** Path of the written result record (keyed mode only). */
  recordPath: string | null;
}

export interface EvalRunResult {
  offline: boolean;
  providers: ProviderResult[];
  allSupported: boolean;
}

export type ProviderFactory = (name: ProviderName, model: string | undefined) => Promise<LLMProvider>;

export interface RunEvalsOptions {
  providers?: ProviderName[];
  offline?: boolean;
  /** Model override for every requested provider (keyed). Default: the provider default. */
  model?: string;
  /** Runs per fixture; all must pass. Default 3 keyed, 1 offline. */
  repeat?: number;
  /** Run llmJudge over every draft (keyed only, costs money). */
  judge?: boolean;
  /** Minimum mean judge rating (1-5). Default 4. */
  judgeFloor?: number;
  /** Write a result record (keyed only). Default true keyed; offline never writes. */
  writeRecord?: boolean;
  resultsDir?: string;
  fixturesDir?: string;
  /** Clock for the record date (tests). */
  now?: () => Date;
  /** Provider construction (tests inject a mock-model provider). Default: getProviderUnchecked. */
  providerFactory?: ProviderFactory;
}

// ─────────────────────────────────── runner ──────────────────────────────────

const defaultFactory: ProviderFactory = (name, model) =>
  // The harness is the qualifier: it must be able to evaluate an ungated
  // provider/model without INTENT_OUTREACH_ALLOW_UNGATED.
  getProviderUnchecked({ provider: name, ...(model ? { model } : {}) });

function usageOf(err: unknown): Partial<Usage> & { inputTokens?: number; outputTokens?: number } {
  if (err instanceof DraftRejectedError) return err.usage;
  const u = (err as { usage?: { inputTokens?: number; outputTokens?: number; costUsd?: number } } | null)?.usage;
  return u ?? {};
}

function failedRun(err: unknown, scorerName: string): RunOutcome {
  const u = usageOf(err);
  const message = err instanceof DraftRejectedError ? err.issues : [err instanceof Error ? err.message : String(err)];
  // AI SDK NoObjectGeneratedError carries the raw model text; keep a short snippet
  // so a parse failure can be told apart from an adapter bug after the fact.
  const raw = (err as { text?: unknown } | null)?.text;
  if (typeof raw === "string") message.push(`raw output (first 400 chars): ${JSON.stringify(raw.slice(0, 400))}`);
  return {
    pass: false,
    scorers: { [scorerName]: { pass: false, findings: message } },
    costUsd: u.costUsd ?? 0,
    inputTokens: u.inputTokens ?? 0,
    outputTokens: u.outputTokens ?? 0,
    error: message.join("; "),
  };
}

function aggregate(fixture: string, seam: "score" | "draft", runs: RunOutcome[]): FixtureResult {
  const passes = runs.filter((r) => r.pass).length;
  const firstFail = runs.find((r) => !r.pass);
  return {
    fixture,
    seam,
    runs,
    passes,
    passRate: runs.length === 0 ? 0 : passes / runs.length,
    pass: runs.length > 0 && passes === runs.length,
    scorers: (firstFail ?? runs[0])?.scorers ?? {},
    costUsd: runs.reduce((a, r) => a + r.costUsd, 0),
  };
}

async function evalOneProvider(name: ProviderName, opts: RunEvalsOptions): Promise<ProviderResult> {
  const offline = opts.offline ?? false;
  const repeat = opts.repeat ?? (offline ? 1 : DEFAULT_KEYED_REPEAT);
  if (!Number.isInteger(repeat) || repeat < 1) throw new Error(`--repeat must be a positive integer (got ${repeat})`);
  if (offline && opts.judge) throw new Error("--judge needs a real provider; it cannot run with --offline");

  const provider: LLMProvider & { _setDraftContext?(c: DraftContext | null): void } = offline
    ? makeStubProvider(name)
    : await (opts.providerFactory ?? defaultFactory)(name, opts.model);

  if (!offline && !approvedEntry(name, provider.model)) {
    process.stderr.write(
      `eval: ${name} model "${provider.model}" has no approved record yet; this run qualifies it (see evals/promote.ts).\n`,
    );
  }

  const scoreFixtures = loadFixtures<ScoreFixture>("score", opts.fixturesDir);
  const draftFixtures = loadFixtures<DraftFixture>("draft", opts.fixturesDir);
  const fixtures: FixtureResult[] = [];

  // SCORE seam.
  provider._setDraftContext?.(null);
  for (const fx of scoreFixtures) {
    const inputs = { icp: fx.icp, lead: fx.lead, contacts: fx.contacts, enrichments: fx.enrichments };
    const runs: RunOutcome[] = [];
    for (let i = 0; i < repeat; i++) {
      try {
        const res = await scoreLead(provider, inputs);
        const scorers: Record<string, ScoreResult> = {
          schemaConformance: schemaConformance("score", res.object),
          angleGrounding: angleGrounding(inputs, res.object.angles, res.droppedAngles),
        };
        // A stub's constant score proves nothing, so bands are a keyed-only gate.
        if (!offline) scorers.scoreBand = scoreBand(fx.expect, res.object);
        runs.push({
          pass: Object.values(scorers).every((s) => s.pass),
          scorers,
          costUsd: res.usage.costUsd,
          inputTokens: res.usage.inputTokens,
          outputTokens: res.usage.outputTokens,
          output: { ...res.object, droppedAngles: res.droppedAngles },
        });
      } catch (err) {
        runs.push(failedRun(err, "scoreCall"));
      }
    }
    fixtures.push(aggregate(fx.name, "score", runs));
  }

  // DRAFT seam.
  const judged: { fixture: string; run: number; ctx: DraftContext; output: DraftOutput }[] = [];
  for (const fx of draftFixtures) {
    const ctx: DraftContext = {
      icp: fx.icp,
      lead: fx.lead,
      contact: fx.contact,
      angles: fx.angles,
      channel: fx.channel,
      ...(fx.styleOverride ? { styleOverride: fx.styleOverride } : {}),
    };
    provider._setDraftContext?.(ctx); // the stub only; real providers have no such hook
    const runs: RunOutcome[] = [];
    for (let i = 0; i < repeat; i++) {
      try {
        const res = await draftMessage(provider, ctx);
        const scorers: Record<string, ScoreResult> = {
          schemaConformance: schemaConformance("draft", res.object),
          draftContract: draftContract(ctx, res.object),
          draftStyle: draftStyle(ctx, res.object),
          groundingHeuristic: groundingHeuristic(ctx, res.object),
        };
        runs.push({
          pass: Object.values(scorers).every((s) => s.pass),
          scorers,
          costUsd: res.usage.costUsd,
          inputTokens: res.usage.inputTokens,
          outputTokens: res.usage.outputTokens,
          output: res.object,
        });
        judged.push({ fixture: fx.name, run: i, ctx, output: res.object });
      } catch (err) {
        // A DraftRejectedError is the product guard firing: a failed run, with its spend metered.
        runs.push(failedRun(err, err instanceof DraftRejectedError ? "draftGuard" : "draftCall"));
      }
    }
    fixtures.push(aggregate(fx.name, "draft", runs));
  }

  const judge = opts.judge ? await runJudge(provider, judged, opts.judgeFloor ?? DEFAULT_JUDGE_FLOOR) : null;

  const allRuns = fixtures.flatMap((f) => f.runs);
  const fixturesPass = fixtures.length > 0 && fixtures.every((f) => f.pass);
  const result: ProviderResult = {
    provider: name,
    model: provider.model,
    offline,
    mode: offline ? "wiring-check" : "keyed",
    repeat,
    fixtures,
    judge,
    passRate: fixtures.length === 0 ? 0 : fixtures.filter((f) => f.pass).length / fixtures.length,
    runPassRate: allRuns.length === 0 ? 0 : allRuns.filter((r) => r.pass).length / allRuns.length,
    supported: fixturesPass && (judge ? judge.pass : true),
    totalCostUsd: fixtures.reduce((a, f) => a + f.costUsd, 0) + (judge?.costUsd ?? 0),
    promptRefs: { score: DEFAULT_SCORE_PROMPTS.map(promptRef), draft: promptRef(DEFAULT_DRAFT_PROMPT) },
    recordPath: null,
  };

  if (!offline && (opts.writeRecord ?? true)) {
    result.recordPath = writeRecord(result, opts.resultsDir ?? DEFAULT_RESULTS_DIR, (opts.now ?? (() => new Date()))());
  }
  return result;
}

async function runJudge(
  provider: LLMProvider,
  drafts: { fixture: string; run: number; ctx: DraftContext; output: DraftOutput }[],
  floor: number,
): Promise<JudgeSummary> {
  const ratings: JudgeSummary["ratings"] = [];
  const errors: string[] = [];
  let costUsd = 0;
  for (const d of drafts) {
    try {
      const { object, usage } = await llmJudge(
        provider,
        { icp: d.ctx.icp, angles: d.ctx.angles, lead: d.ctx.lead, contact: d.ctx.contact, channel: d.ctx.channel },
        d.output,
      );
      costUsd += usage.costUsd;
      ratings.push({
        fixture: d.fixture,
        run: d.run,
        rating: object.rating,
        grounded: object.grounded,
        hallucinatedFacts: object.hallucinatedFacts,
      });
    } catch (err) {
      errors.push(`${d.fixture}#${d.run}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const meanRating = ratings.length === 0 ? 0 : ratings.reduce((a, r) => a + r.rating, 0) / ratings.length;
  // Fail closed: a judge error or an empty judgment is not a pass.
  const pass = errors.length === 0 && ratings.length > 0 && meanRating >= floor;
  return { floor, meanRating, ratings, errors, pass, costUsd };
}

// ─────────────────────────────── result records ──────────────────────────────

/** Filename-safe model id ("anthropic/claude-x:beta" → "anthropic_claude-x_beta"). */
export function safeSegment(s: string): string {
  return s.replace(/[^A-Za-z0-9._@-]+/g, "_");
}

/** evals/results/<YYYY-MM-DD>-<provider>-<model>-<promptRef>.json (promptRef = the draft prompt's "<file>@<sha8>"). */
export function recordFileName(provider: string, model: string, ref: string, date: Date): string {
  const day = date.toISOString().slice(0, 10);
  return `${day}-${safeSegment(provider)}-${safeSegment(model)}-${safeSegment(ref)}.json`;
}

export interface ResultRecord {
  recordVersion: number;
  createdAt: string;
  provider: string;
  model: string;
  promptRef: string;
  promptRefs: { score: string[]; draft: string };
  repeat: number;
  fixtures: {
    fixture: string;
    seam: "score" | "draft";
    pass: boolean;
    passes: number;
    runs: number;
    passRate: number;
    costUsd: number;
    outcomes: { pass: boolean; costUsd: number; failures: Record<string, string[]>; output?: unknown; error?: string }[];
  }[];
  judge: JudgeSummary | null;
  cost: { totalUsd: number; inputTokens: number; outputTokens: number };
  summary: {
    fixtures: number;
    fixturesPassed: number;
    passRate: number;
    runPassRate: number;
    verdict: "pass" | "fail";
  };
}

export function buildRecord(r: ProviderResult, date: Date): ResultRecord {
  const allRuns = r.fixtures.flatMap((f) => f.runs);
  return {
    recordVersion: RECORD_VERSION,
    createdAt: date.toISOString(),
    provider: r.provider,
    model: r.model,
    promptRef: r.promptRefs.draft,
    promptRefs: r.promptRefs,
    repeat: r.repeat,
    fixtures: r.fixtures.map((f) => ({
      fixture: f.fixture,
      seam: f.seam,
      pass: f.pass,
      passes: f.passes,
      runs: f.runs.length,
      passRate: f.passRate,
      costUsd: f.costUsd,
      outcomes: f.runs.map((o) => ({
        pass: o.pass,
        costUsd: o.costUsd,
        failures: Object.fromEntries(
          Object.entries(o.scorers)
            .filter(([, s]) => !s.pass)
            .map(([k, s]) => [k, s.findings]),
        ),
        ...(o.output !== undefined ? { output: o.output } : {}),
        ...(o.error !== undefined ? { error: o.error } : {}),
      })),
    })),
    judge: r.judge,
    cost: {
      totalUsd: r.totalCostUsd,
      inputTokens: allRuns.reduce((a, o) => a + o.inputTokens, 0),
      outputTokens: allRuns.reduce((a, o) => a + o.outputTokens, 0),
    },
    summary: {
      fixtures: r.fixtures.length,
      fixturesPassed: r.fixtures.filter((f) => f.pass).length,
      passRate: r.passRate,
      runPassRate: r.runPassRate,
      verdict: r.supported ? "pass" : "fail",
    },
  };
}

/**
 * Never overwrite an existing record: a second run on the same day with the same
 * model and prompt gets "-2", "-3", … so earlier evidence (including the record
 * evals/supported.ts points at) stays intact.
 */
export function uniqueRecordPath(dir: string, base: string): string {
  let path = join(dir, base);
  for (let n = 2; existsSync(path); n++) path = join(dir, base.replace(/\.json$/, `-${n}.json`));
  return path;
}

function writeRecord(r: ProviderResult, dir: string, date: Date): string {
  mkdirSync(dir, { recursive: true });
  const path = uniqueRecordPath(dir, recordFileName(r.provider, r.model, r.promptRefs.draft, date));
  writeFileSync(path, `${JSON.stringify(buildRecord(r, date), null, 2)}\n`, "utf8");
  return path;
}

/**
 * Run the harness for the given providers. Returns a structured result so tests
 * (and CI) can assert on it without parsing stdout.
 */
export async function runEvals(opts: RunEvalsOptions = {}): Promise<EvalRunResult> {
  const offline = opts.offline ?? false;
  const providers = opts.providers ?? (["anthropic"] as ProviderName[]);
  const results: ProviderResult[] = [];
  for (const p of providers) {
    results.push(await evalOneProvider(p, opts));
  }
  return { offline, providers: results, allSupported: results.length > 0 && results.every((r) => r.supported) };
}

// ─────────────────────────────────── report ──────────────────────────────────

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

export function formatReport(result: EvalRunResult): string {
  const lines: string[] = [];
  if (result.offline) {
    lines.push("Intent Outreach eval harness: WIRING CHECK (offline stub)");
    lines.push("Proves seams, guard, scorers and report run end to end. NOT a quality gate:");
    lines.push("the stub is grounded by construction and score bands are skipped. No record written.");
  } else {
    lines.push("Intent Outreach eval harness: KEYED GATE (real models)");
  }
  lines.push("=".repeat(60));
  for (const p of result.providers) {
    lines.push("");
    lines.push(
      `Provider: ${p.provider}  (model: ${p.model})  repeat: ${p.repeat}  cost: $${p.totalCostUsd.toFixed(6)}`,
    );
    for (const f of p.fixtures) {
      const mark = f.pass ? "PASS" : "FAIL";
      lines.push(`  [${mark}] ${f.seam}/${f.fixture}  (${f.passes}/${f.runs.length} runs)`);
      f.runs.forEach((run, i) => {
        for (const [scorer, r] of Object.entries(run.scorers)) {
          if (!r.pass) lines.push(`        run ${i + 1} ✗ ${scorer}: ${r.findings.join("; ")}`);
        }
      });
    }
    if (p.judge) {
      lines.push(
        `  judge: mean rating ${p.judge.meanRating.toFixed(2)} (floor ${p.judge.floor}) → ${p.judge.pass ? "PASS" : "FAIL"}` +
          (p.judge.errors.length ? `; ${p.judge.errors.length} judge error(s)` : ""),
      );
    }
    lines.push(`  fixtures passing all runs: ${pct(p.passRate)}  run pass rate: ${pct(p.runPassRate)}`);
    const verdict = p.offline ? (p.supported ? "WIRED" : "WIRING BROKEN") : p.supported ? "PASS" : "FAIL";
    lines.push(`  → ${p.provider}/${p.model}: ${verdict}`);
    if (p.recordPath) lines.push(`  record: ${p.recordPath}`);
  }
  lines.push("");
  if (result.offline) {
    lines.push(`VERDICT: ${result.allSupported ? "WIRING OK" : "WIRING BROKEN"} (offline; says nothing about model quality)`);
  } else {
    lines.push(`VERDICT: ${result.allSupported ? "ALL REQUESTED MODELS PASS" : "ONE OR MORE MODELS FAIL"}`);
  }
  return lines.join("\n");
}

// ───────────────────────────────────── CLI ───────────────────────────────────

function flagValue(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  if (i === -1) return undefined;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith("--")) throw new Error(`${flag} needs a value`);
  return v;
}

export function parseArgs(argv: string[]): RunEvalsOptions {
  const offline = argv.includes("--offline");
  const providersRaw = flagValue(argv, "--providers");
  const providers = providersRaw
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) as ProviderName[] | undefined;
  const model = flagValue(argv, "--model");
  const repeatRaw = flagValue(argv, "--repeat");
  const floorRaw = flagValue(argv, "--judge-floor");
  const resultsDir = flagValue(argv, "--results-dir");
  const repeat = repeatRaw === undefined ? undefined : Number(repeatRaw);
  if (repeat !== undefined && (!Number.isInteger(repeat) || repeat < 1)) {
    throw new Error(`--repeat must be a positive integer (got ${repeatRaw})`);
  }
  const judgeFloor = floorRaw === undefined ? undefined : Number(floorRaw);
  if (judgeFloor !== undefined && !(judgeFloor >= 1 && judgeFloor <= 5)) {
    throw new Error(`--judge-floor must be between 1 and 5 (got ${floorRaw})`);
  }
  return {
    offline,
    ...(providers ? { providers } : {}),
    ...(model ? { model } : {}),
    ...(repeat !== undefined ? { repeat } : {}),
    ...(argv.includes("--judge") ? { judge: true } : {}),
    ...(judgeFloor !== undefined ? { judgeFloor } : {}),
    ...(argv.includes("--no-record") ? { writeRecord: false } : {}),
    ...(resultsDir ? { resultsDir } : {}),
  };
}

// Run as a script (tsx evals/run.ts ...). Guarded so importing for tests is side-effect-free.
const invokedDirectly =
  typeof process !== "undefined" && process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

if (invokedDirectly) {
  Promise.resolve()
    .then(() => runEvals(parseArgs(process.argv.slice(2))))
    .then((result) => {
      console.log(formatReport(result));
      process.exit(result.allSupported ? 0 : 1);
    })
    .catch((err) => {
      console.error("eval harness failed:", err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
