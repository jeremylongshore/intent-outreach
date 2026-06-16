/**
 * pipeline_core/cost.ts — per-campaign cost metering.
 *
 * Ports the CostMeter concept from the eval-lab router (_arm_common.py) to TS.
 * Tracks input/output tokens and cumulative USD spend across the LLM seams so a
 * CampaignRun can record what it cost. Pricing is a rough, override-able table —
 * a meter, not an invoice.
 */

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/** USD per 1M tokens, {input, output}. Approximate; override via setPricing(). */
const PRICING: Record<string, { in: number; out: number }> = {
  // Anthropic
  "claude-opus-4-8": { in: 15, out: 75 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-haiku-4-5": { in: 1, out: 5 },
  // OpenAI
  "gpt-4o": { in: 2.5, out: 10 },
  "gpt-4.1": { in: 2, out: 8 },
  // Google
  "gemini-2.0-flash": { in: 0.1, out: 0.4 },
  "gemini-1.5-pro": { in: 1.25, out: 5 },
  // xAI
  "grok-2-latest": { in: 2, out: 10 },
};

/** Default when a model isn't in the table (kept conservative-ish). */
const FALLBACK = { in: 3, out: 15 };

export function setPricing(model: string, inUsdPerMTok: number, outUsdPerMTok: number): void {
  PRICING[model] = { in: inUsdPerMTok, out: outUsdPerMTok };
}

export function costFor(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model] ?? FALLBACK;
  return (inputTokens / 1_000_000) * p.in + (outputTokens / 1_000_000) * p.out;
}

export class CostMeter {
  private inTokens = 0;
  private outTokens = 0;
  private spent = 0;
  private callCount = 0;

  record(model: string, inputTokens: number, outputTokens: number): Usage {
    const costUsd = costFor(model, inputTokens, outputTokens);
    this.inTokens += inputTokens;
    this.outTokens += outputTokens;
    this.spent += costUsd;
    this.callCount += 1;
    return { inputTokens, outputTokens, costUsd };
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
