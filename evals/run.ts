/**
 * evals/run.ts — the cross-provider EVAL HARNESS (Epic 4).
 *
 * This harness IS the model-agnostic story: a provider is "supported" only if it
 * passes the golden fixtures at each LLM seam. For each provider it runs every
 * score/draft fixture through the matching seam (scoreLead / draftMessage), applies
 * the deterministic scorers, and emits a per-provider report + a SUPPORTED verdict.
 *
 *   SUPPORTED  ⇔  every fixture passes schemaConformance + draftContract + groundingHeuristic.
 *
 * Modes:
 *   --offline           use a deterministic STUB provider (no key, free, for CI)
 *   --providers a,b     run real providers (anthropic, openai, google, xai) — COSTS MONEY
 *
 * Run with tsx:
 *   tsx evals/run.ts --offline
 *   tsx evals/run.ts --providers anthropic            # real, needs ANTHROPIC_API_KEY
 *   tsx evals/run.ts --providers anthropic,openai     # cross-provider gate
 *
 * Exit code: 0 if all requested providers are SUPPORTED, 1 otherwise.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  draftMessage,
  scoreLead,
  type DraftContext,
  type DraftOutput,
  type ScoreContext,
  type ScoreOutput,
} from "../pipeline_core/seam.js";
import {
  getProvider,
  type GenerateObjectArgs,
  type LLMProvider,
  type ProviderName,
} from "../pipeline_core/providers.js";
import type { z } from "zod";
import { draftContract, groundingHeuristic, schemaConformance, type ScoreResult } from "./scorers.js";

// ───────────────────────────────── fixtures ──────────────────────────────────

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(HERE, "fixtures");

interface ScoreFixture extends ScoreContext {
  name: string;
}
interface DraftFixture extends DraftContext {
  name: string;
}

function loadFixtures<T>(kind: "score" | "draft"): T[] {
  const dir = join(FIXTURES_DIR, kind);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort() // deterministic order
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as T);
}

// ───────────────────────── deterministic stub provider ───────────────────────

/**
 * A deterministic, free, key-less provider for --offline / CI. It returns
 * structured output exactly like the test stub (schema.parse(superset)), BUT it
 * builds the draft body from the CURRENT fixture's angles so the output is
 * grounded by construction — a fixed superset would leak "Series A" into the
 * thin-data fixture and (correctly) fail the grounding heuristic.
 *
 * The runner sets `currentDraft` before each draftMessage call so the stub can
 * see which fixture it's answering. This is a property of the STUB only; real
 * providers never see it.
 */
function makeStubProvider(name: ProviderName): LLMProvider & { _setDraftContext(ctx: DraftContext): void } {
  let currentDraft: DraftContext | null = null;

  function groundedDraftSuperset() {
    const ctx = currentDraft;
    const lead = ctx?.lead.companyName ?? "your team";
    const firstAngle = ctx && ctx.angles.length > 0 ? ctx.angles[0]! : null;
    const channel = ctx?.channel ?? "email";

    // Body uses ONLY the lead name + the (grounded) first angle, or an honest
    // generic line when there are no angles (the thin-data path).
    const body = firstAngle
      ? `Hi — I work with teams like ${lead}. ${firstAngle} I'd love to help you do more of that with less manual work.`
      : `Hi — I work with founders on outbound, and thought ${lead} might be a fit. No assumptions about your current setup.`;

    return {
      // ScoreOutput superset
      fitScore: 72,
      fitReason: "Matches the ICP on industry and size.",
      angles: ctx ? ctx.angles.slice(0, 3) : ["Scaling go-to-market after a recent raise."],
      // DraftOutput superset (subject omitted for linkedin)
      ...(channel === "email" ? { subject: `An idea for ${lead}` } : {}),
      body,
      cta: "Open to a 15-minute call next week?",
    };
  }

  return {
    name,
    model: "stub-model",
    async generateObject<S extends z.ZodTypeAny>(
      args: GenerateObjectArgs<S>,
    ): Promise<{ object: z.infer<S>; usage: { inputTokens: number; outputTokens: number; costUsd: number } }> {
      const object = args.schema.parse(groundedDraftSuperset());
      return { object, usage: { inputTokens: 50, outputTokens: 40, costUsd: 0 } };
    },
    _setDraftContext(ctx: DraftContext) {
      currentDraft = ctx;
    },
  };
}

// ─────────────────────────────── result types ────────────────────────────────

export interface FixtureResult {
  fixture: string;
  seam: "score" | "draft";
  scorers: Record<string, ScoreResult>;
  pass: boolean;
  costUsd: number;
}

export interface ProviderResult {
  provider: string;
  model: string;
  offline: boolean;
  fixtures: FixtureResult[];
  supported: boolean;
  totalCostUsd: number;
}

export interface EvalRunResult {
  offline: boolean;
  providers: ProviderResult[];
  allSupported: boolean;
}

export interface RunEvalsOptions {
  providers?: ProviderName[];
  offline?: boolean;
}

// ─────────────────────────────────── runner ──────────────────────────────────

async function resolveProvider(
  name: ProviderName,
  offline: boolean,
): Promise<LLMProvider & { _setDraftContext?(ctx: DraftContext): void }> {
  if (offline) return makeStubProvider(name);
  return getProvider({ provider: name }); // enforces the eval gate + needs a key
}

async function evalOneProvider(name: ProviderName, offline: boolean): Promise<ProviderResult> {
  const provider = await resolveProvider(name, offline);
  const scoreFixtures = loadFixtures<ScoreFixture>("score");
  const draftFixtures = loadFixtures<DraftFixture>("draft");
  const fixtures: FixtureResult[] = [];

  // SCORE seam: schemaConformance is the only deterministic gate (no draft contract).
  for (const fx of scoreFixtures) {
    const { object, usage } = await scoreLead(provider, {
      icp: fx.icp,
      lead: fx.lead,
      contacts: fx.contacts,
      enrichments: fx.enrichments,
    });
    const scorers: Record<string, ScoreResult> = {
      schemaConformance: schemaConformance("score", object),
    };
    fixtures.push({
      fixture: fx.name,
      seam: "score",
      scorers,
      pass: Object.values(scorers).every((s) => s.pass),
      costUsd: usage.costUsd,
    });
  }

  // DRAFT seam: all three deterministic gates.
  for (const fx of draftFixtures) {
    const ctx: DraftContext = {
      icp: fx.icp,
      lead: fx.lead,
      contact: fx.contact,
      angles: fx.angles,
      channel: fx.channel,
      ...(fx.styleOverride ? { styleOverride: fx.styleOverride } : {}),
    };
    // Tell the stub which fixture it's drafting (no-op for real providers).
    (provider as { _setDraftContext?(c: DraftContext): void })._setDraftContext?.(ctx);

    const { object, usage } = await draftMessage(provider, ctx);
    const scorers: Record<string, ScoreResult> = {
      schemaConformance: schemaConformance("draft", object),
      draftContract: draftContract(ctx, object),
      groundingHeuristic: groundingHeuristic(ctx, object),
    };
    fixtures.push({
      fixture: fx.name,
      seam: "draft",
      scorers,
      pass: Object.values(scorers).every((s) => s.pass),
      costUsd: usage.costUsd,
    });
  }

  const supported = fixtures.every((f) => f.pass);
  const totalCostUsd = fixtures.reduce((acc, f) => acc + f.costUsd, 0);
  return { provider: name, model: provider.model, offline, fixtures, supported, totalCostUsd };
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
    results.push(await evalOneProvider(p, offline));
  }
  return { offline, providers: results, allSupported: results.every((r) => r.supported) };
}

// ─────────────────────────────────── report ──────────────────────────────────

export function formatReport(result: EvalRunResult): string {
  const lines: string[] = [];
  lines.push(`Intent Outreach — cross-provider eval gate${result.offline ? " (OFFLINE / stub)" : ""}`);
  lines.push("=".repeat(60));
  for (const p of result.providers) {
    lines.push("");
    lines.push(`Provider: ${p.provider}  (model: ${p.model})  cost: $${p.totalCostUsd.toFixed(6)}`);
    for (const f of p.fixtures) {
      const mark = f.pass ? "PASS" : "FAIL";
      lines.push(`  [${mark}] ${f.seam}/${f.fixture}`);
      for (const [scorer, r] of Object.entries(f.scorers)) {
        if (!r.pass) {
          lines.push(`        ✗ ${scorer}: ${r.findings.join("; ")}`);
        }
      }
    }
    lines.push(`  → ${p.provider}: ${p.supported ? "SUPPORTED" : "NOT SUPPORTED"}`);
  }
  lines.push("");
  lines.push(`VERDICT: ${result.allSupported ? "ALL REQUESTED PROVIDERS SUPPORTED" : "ONE OR MORE PROVIDERS NOT SUPPORTED"}`);
  return lines.join("\n");
}

// ───────────────────────────────────── CLI ───────────────────────────────────

function parseArgs(argv: string[]): RunEvalsOptions {
  const offline = argv.includes("--offline");
  const provIdx = argv.indexOf("--providers");
  let providers: ProviderName[] | undefined;
  if (provIdx !== -1 && argv[provIdx + 1]) {
    providers = argv[provIdx + 1]!
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean) as ProviderName[];
  }
  return { offline, ...(providers ? { providers } : {}) };
}

// Run as a script (tsx evals/run.ts ...). Guarded so importing for tests is side-effect-free.
const invokedDirectly =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (invokedDirectly) {
  const opts = parseArgs(process.argv.slice(2));
  runEvals(opts)
    .then((result) => {
      console.log(formatReport(result));
      process.exit(result.allSupported ? 0 : 1);
    })
    .catch((err) => {
      console.error("eval harness failed:", err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
