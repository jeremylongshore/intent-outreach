/**
 * pipeline_core/prompts.ts — load versioned prompt files at runtime.
 *
 * Prompts are prompts-as-code: versioned .md files under prompts/, eval-gated.
 * This resolves the prompts dir whether running from source (tsx), built dist
 * (the build copies prompts/ → dist/prompts) or the esbuild bundle (bundle/ →
 * ../prompts), with an env override for evals.
 *
 * There is deliberately NO `process.cwd()/prompts` fallback: running the CLI from
 * an untrusted checkout would otherwise let any `./prompts/outreach.v2.md` in
 * that directory silently replace the system prompt (prompt hijack). The only
 * override is the explicit INTENT_OUTREACH_PROMPTS_DIR env var.
 *
 * Every load carries a sha256 of the exact bytes sent, so a run can record which
 * prompt text produced it (`promptRef` = "<basename>@<sha8>").
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface LoadedPrompt {
  text: string;
  /** Hex sha256 of `text` (utf8). */
  sha256: string;
}

const cache = new Map<string, LoadedPrompt>();

/** Prompt names are bare file names — no path traversal out of the prompts dir. */
function assertBareName(name: string): void {
  if (!name || name !== basename(name) || name.includes("..")) {
    throw new Error(`invalid prompt name: ${JSON.stringify(name)} (must be a bare file name)`);
  }
}

function candidatePaths(name: string): string[] {
  const here = dirname(fileURLToPath(import.meta.url)); // pipeline_core/, dist/pipeline_core/ or bundle/
  const out: string[] = [];
  if (process.env.INTENT_OUTREACH_PROMPTS_DIR) {
    out.push(join(process.env.INTENT_OUTREACH_PROMPTS_DIR, name));
  }
  out.push(join(here, "..", "prompts", name)); // ../prompts (source, bundle) & dist/prompts (built)
  return out;
}

/** Read a prompt file by name (e.g. "outreach.v2.md"), cached, with its sha256. */
export function loadPrompt(name: string): LoadedPrompt {
  assertBareName(name);
  const cached = cache.get(name);
  if (cached !== undefined) return cached;
  for (const path of candidatePaths(name)) {
    let text: string;
    try {
      text = readFileSync(path, "utf8");
    } catch {
      continue; // try next candidate
    }
    const loaded: LoadedPrompt = { text, sha256: createHash("sha256").update(text, "utf8").digest("hex") };
    cache.set(name, loaded);
    return loaded;
  }
  throw new Error(`prompt not found: ${name} (looked in: ${candidatePaths(name).join(", ")})`);
}

/** Provenance handle for a prompt file: "<basename-without-.md>@<first 8 hex of sha256>". */
export function promptRef(name: string): string {
  const { sha256 } = loadPrompt(name);
  return `${name.replace(/\.md$/i, "")}@${sha256.slice(0, 8)}`;
}

/** Reset the prompt cache. Tests only. */
export function _resetPromptCache(): void {
  cache.clear();
}
