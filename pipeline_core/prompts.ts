/**
 * pipeline_core/prompts.ts — load versioned prompt files at runtime.
 *
 * Prompts are prompts-as-code: versioned .md files under prompts/, eval-gated.
 * This resolves the prompts dir whether running from source (tsx) or built dist
 * (the build copies prompts/ → dist/prompts), with an env override for evals.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const cache = new Map<string, string>();

function candidatePaths(name: string): string[] {
  const here = dirname(fileURLToPath(import.meta.url)); // pipeline_core/ or dist/pipeline_core/
  const out: string[] = [];
  if (process.env.INTENT_OUTREACH_PROMPTS_DIR) {
    out.push(join(process.env.INTENT_OUTREACH_PROMPTS_DIR, name));
  }
  out.push(join(here, "..", "prompts", name)); // ../prompts (source) & dist/prompts (built)
  out.push(join(process.cwd(), "prompts", name));
  return out;
}

/** Read a prompt file by name (e.g. "outreach.v1.md"), cached. */
export function loadPrompt(name: string): string {
  const cached = cache.get(name);
  if (cached !== undefined) return cached;
  for (const path of candidatePaths(name)) {
    try {
      const text = readFileSync(path, "utf8");
      cache.set(name, text);
      return text;
    } catch {
      // try next candidate
    }
  }
  throw new Error(`prompt not found: ${name} (looked in: ${candidatePaths(name).join(", ")})`);
}

/** Reset the prompt cache. Tests only. */
export function _resetPromptCache(): void {
  cache.clear();
}
