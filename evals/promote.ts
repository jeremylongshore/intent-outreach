/**
 * evals/promote.ts — qualify a {provider, model} pair through the keyed gate.
 *
 *   npm run evals:promote -- --provider anthropic --model claude-sonnet-5-5 [--repeat 3] [--judge]
 *
 * 1. Runs the KEYED eval harness for that one pair (repeat ≥3, every fixture
 *    must pass every run) and writes the result record to evals/results/.
 * 2. On PASS, upserts {provider, model, resultFile, verified: true} into
 *    evals/supported.ts. On FAIL, changes nothing and exits 1.
 * 3. It NEVER edits pipeline_core/providers.ts DEFAULT_MODEL: switching the
 *    default is a reviewed code change, so it prints the one-line edit instead.
 *
 * Needs the provider's API key (e.g. ANTHROPIC_API_KEY) and costs money.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import type { ProviderName } from "../pipeline_core/providers.js";
import { DEFAULT_KEYED_REPEAT, formatReport, runEvals, type RunEvalsOptions } from "./run.js";
import type { ApprovedModel } from "./supported.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..");
export const SUPPORTED_FILE = join(HERE, "supported.ts");
export const MIN_PROMOTE_REPEAT = 3;

const BEGIN = "// BEGIN APPROVED_MODELS";
const END = "// END APPROVED_MODELS";

/** Parse the JSON block between the markers in supported.ts source. */
export function readApprovedBlock(source: string): ApprovedModel[] {
  const b = source.indexOf(BEGIN);
  const e = source.indexOf(END);
  if (b === -1 || e === -1 || e < b) throw new Error("supported.ts: APPROVED_MODELS markers not found");
  const afterBeginLine = source.indexOf("\n", b) + 1;
  return JSON.parse(source.slice(afterBeginLine, e)) as ApprovedModel[];
}

/** Return supported.ts source with `entry` inserted or replacing the same {provider, model}. */
export function upsertApproved(source: string, entry: ApprovedModel): string {
  const entries = readApprovedBlock(source);
  const i = entries.findIndex((x) => x.provider === entry.provider && x.model === entry.model);
  if (i === -1) entries.push(entry);
  else entries[i] = entry;
  const b = source.indexOf(BEGIN);
  const afterBeginLine = source.indexOf("\n", b) + 1;
  const e = source.indexOf(END);
  return `${source.slice(0, afterBeginLine)}${JSON.stringify(entries, null, 2)}\n${source.slice(e)}`;
}

export interface PromoteOptions {
  provider: ProviderName;
  model: string;
  repeat?: number;
  judge?: boolean;
  judgeFloor?: number;
  /** Test seams. */
  supportedFile?: string;
  repoRoot?: string;
  run?: Pick<RunEvalsOptions, "providerFactory" | "resultsDir" | "now" | "fixturesDir">;
  log?: (line: string) => void;
}

export interface PromoteResult {
  pass: boolean;
  recordPath: string | null;
  entry: ApprovedModel | null;
}

export async function promote(opts: PromoteOptions): Promise<PromoteResult> {
  const log = opts.log ?? ((l: string) => console.log(l));
  const repeat = opts.repeat ?? DEFAULT_KEYED_REPEAT;
  if (!Number.isInteger(repeat) || repeat < MIN_PROMOTE_REPEAT) {
    throw new Error(`promotion needs --repeat ≥ ${MIN_PROMOTE_REPEAT} (got ${repeat})`);
  }
  const result = await runEvals({
    providers: [opts.provider],
    model: opts.model,
    repeat,
    offline: false,
    writeRecord: true,
    ...(opts.judge ? { judge: true } : {}),
    ...(opts.judgeFloor !== undefined ? { judgeFloor: opts.judgeFloor } : {}),
    ...(opts.run ?? {}),
  });
  log(formatReport(result));
  const p = result.providers[0]!;
  if (!p.supported || !p.recordPath) {
    log(`\nNOT PROMOTED: ${opts.provider}/${opts.model} failed the gate; evals/supported.ts unchanged.`);
    return { pass: false, recordPath: p.recordPath, entry: null };
  }
  const root = opts.repoRoot ?? REPO_ROOT;
  const resultFile = relative(root, p.recordPath).split("\\").join("/");
  const entry: ApprovedModel = {
    provider: opts.provider,
    model: p.model,
    resultFile,
    verified: true,
    evidence: `keyed eval gate passed: repeat ${repeat}, ${p.fixtures.length}/${p.fixtures.length} fixtures in all runs${
      p.judge ? `, judge mean ${p.judge.meanRating.toFixed(2)} ≥ ${p.judge.floor}` : ""
    } (${resultFile})`,
  };
  const file = opts.supportedFile ?? SUPPORTED_FILE;
  writeFileSync(file, upsertApproved(readFileSync(file, "utf8"), entry), "utf8");
  log(`\nPROMOTED: ${opts.provider}/${p.model} recorded as verified in evals/supported.ts.`);
  log("Commit the result record and evals/supported.ts together.");
  log(
    `To make it the default, edit pipeline_core/providers.ts DEFAULT_MODEL: ${opts.provider}: "${p.model}",` +
      " (not done automatically; it is a reviewed change).",
  );
  return { pass: true, recordPath: p.recordPath, entry };
}

function arg(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
}

const invokedDirectly =
  typeof process !== "undefined" && process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

if (invokedDirectly) {
  const argv = process.argv.slice(2);
  const provider = arg(argv, "--provider") as ProviderName | undefined;
  const model = arg(argv, "--model");
  if (!provider || !model) {
    console.error("usage: npm run evals:promote -- --provider <anthropic|openai|xai> --model <id> [--repeat 3] [--judge]");
    process.exit(2);
  }
  const repeatRaw = arg(argv, "--repeat");
  const floorRaw = arg(argv, "--judge-floor");
  promote({
    provider,
    model,
    ...(repeatRaw ? { repeat: Number(repeatRaw) } : {}),
    ...(argv.includes("--judge") ? { judge: true } : {}),
    ...(floorRaw ? { judgeFloor: Number(floorRaw) } : {}),
  })
    .then((r) => process.exit(r.pass ? 0 : 1))
    .catch((err) => {
      console.error("promotion failed:", err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
