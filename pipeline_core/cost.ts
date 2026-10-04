/**
 * pipeline_core/cost.ts — per-campaign cost metering.
 *
 * Ports the CostMeter concept from the eval-lab router (_arm_common.py) to TS.
 * Tracks input/output tokens and cumulative USD spend across the LLM seams so a
 * CampaignRun can record what it cost. Pricing is a rough, override-able table —
 * a meter, not an invoice.
 */

export interface Usage {
  /** Total input tokens, INCLUDING any cache-read / cache-write tokens. */
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  /** Input tokens served from the prompt cache (subset of inputTokens). */
  cacheReadTokens?: number;
  /** Input tokens written to the prompt cache (subset of inputTokens). */
  cacheWriteTokens?: number;
}

/** Cache multipliers relative to the base input price (Anthropic's published ratios). */
export const CACHE_READ_MULTIPLIER = 0.1;
export const CACHE_WRITE_MULTIPLIER = 1.25;

/** USD per 1M tokens, {input, output}. Approximate; override via setPricing(). */
const PRICING: Record<string, { in: number; out: number }> = {
  // Anthropic
  "claude-opus-5-5": { in: 4, out: 20 },
  "claude-sonnet-5-5": { in: 2, out: 10 },
  "claude-opus-5": { in: 5, out: 25 },
  "claude-sonnet-5": { in: 2, out: 10 },
  "claude-opus-4-8": { in: 5, out: 25 },
  "claude-opus-4-7": { in: 5, out: 25 },
  "claude-opus-4-6": { in: 5, out: 25 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-haiku-4-5": { in: 1, out: 5 },
  // OpenAI
  "gpt-4o": { in: 2.5, out: 10 },
  "gpt-4.1": { in: 2, out: 8 },
  // xAI
  "grok-2-latest": { in: 2, out: 10 },
};

/** Default when a model isn't in the table (kept conservative-ish). */
const FALLBACK = { in: 3, out: 15 };

const warnedUnknown = new Set<string>();

export function setPricing(model: string, inUsdPerMTok: number, outUsdPerMTok: number): void {
  PRICING[model] = { in: inUsdPerMTok, out: outUsdPerMTok };
}

/**
 * Normalize a model id for lookup: strip a provider prefix (`anthropic/...`) and a
 * trailing snapshot date (`-20251001`).
 */
export function normalizeModelId(model: string): string {
  let id = model.trim().toLowerCase();
  const slash = id.lastIndexOf("/");
  if (slash >= 0) id = id.slice(slash + 1);
  return id.replace(/-\d{8}$/, "");
}

/**
 * Resolve the price row for a model: exact match (raw, then normalized), else the
 * longest table key that is a `-`-boundary prefix of the normalized id (so
 * `claude-opus-5-5-fast` hits `claude-opus-5-5`, and `claude-opus-5-5` never
 * falls through to `claude-opus-5`). Unknown models use FALLBACK and warn once
 * per model id on stderr.
 */
export function priceFor(model: string): { in: number; out: number } {
  const exact = PRICING[model];
  if (exact) return exact;
  const id = normalizeModelId(model);
  const normalized = PRICING[id];
  if (normalized) return normalized;
  let best: string | undefined;
  for (const key of Object.keys(PRICING)) {
    const k = key.toLowerCase();
    if (id.startsWith(k + "-") && (best === undefined || k.length > best.length)) best = key;
  }
  if (best !== undefined) return PRICING[best]!;
  if (!warnedUnknown.has(model)) {
    warnedUnknown.add(model);
    process.stderr.write(
      `[intent-outreach] cost: no pricing for model "${model}"; using fallback ` +
        `$${FALLBACK.in}/$${FALLBACK.out} per MTok (override with setPricing()).\n`,
    );
  }
  return FALLBACK;
}

/** Test hook: forget which unknown models have already warned. */
export function _resetPricingWarnings(): void {
  warnedUnknown.clear();
}

export interface CacheTokens {
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

/**
 * USD cost of one call. `inputTokens` is the TOTAL input (AI SDK semantics), so
 * cache tokens are carved out of it: uncached input at 1x, cache reads at 0.1x,
 * cache writes at 1.25x the base input price.
 */
export function costFor(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cache: CacheTokens = {},
): number {
  const p = priceFor(model);
  const cacheRead = Math.max(0, cache.cacheReadTokens ?? 0);
  const cacheWrite = Math.max(0, cache.cacheWriteTokens ?? 0);
  const uncached = Math.max(0, inputTokens - cacheRead - cacheWrite);
  const inputUsd =
    uncached * p.in +
    cacheRead * p.in * CACHE_READ_MULTIPLIER +
    cacheWrite * p.in * CACHE_WRITE_MULTIPLIER;
  return (inputUsd + outputTokens * p.out) / 1_000_000;
}

export class CostMeter {
  private inTokens = 0;
  private outTokens = 0;
  private spent = 0;
  private callCount = 0;

  record(model: string, inputTokens: number, outputTokens: number, cache: CacheTokens = {}): Usage {
    const costUsd = costFor(model, inputTokens, outputTokens, cache);
    this.inTokens += inputTokens;
    this.outTokens += outputTokens;
    this.spent += costUsd;
    this.callCount += 1;
    return { inputTokens, outputTokens, costUsd, ...cache };
  }

  get spentUsd(): number {
    return this.spent;
  }
  get calls(): number {
    return this.callCount;
  }
  summary() {
    return {
      calls: this.callCount,
      inputTokens: this.inTokens,
      outputTokens: this.outTokens,
      spentUsd: Number(this.spent.toFixed(6)),
    };
  }
}
