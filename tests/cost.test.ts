/**
 * tests/cost.test.ts — real token usage + cost metering.
 *
 * Guards:
 *   - getProvider().generateObject reads AI SDK v7 usage (inputTokens /
 *     outputTokens / inputTokenDetails) and records NON-ZERO tokens + cost.
 *     Runs the real `ai` generateObject against a MockLanguageModelV4 injected
 *     via a mocked @ai-sdk/anthropic factory — no network.
 *   - model-id normalization (provider prefix, snapshot date, longest prefix)
 *   - cache pricing (read 0.1x, write 1.25x input)
 *   - one-time stderr warning on unknown-model fallback
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { MockLanguageModelV4 } from "ai/test";
import {
  CostMeter,
  _resetPricingWarnings,
  costFor,
  normalizeModelId,
  priceFor,
} from "../pipeline_core/cost.js";

// ── mock the Anthropic factory so getProvider resolves to a mock model ──────
const mockState = vi.hoisted(() => ({
  usage: {
    inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 } as {
      total: number | undefined;
      noCache: number | undefined;
      cacheRead: number | undefined;
      cacheWrite: number | undefined;
    },
    outputTokens: { total: 0, text: 0, reasoning: 0 } as {
      total: number | undefined;
      text: number | undefined;
      reasoning: number | undefined;
    },
  },
  modelIds: [] as string[],
}));

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: () => (modelId: string) => {
    mockState.modelIds.push(modelId);
    return new MockLanguageModelV4({
      provider: "anthropic.messages",
      modelId,
      doGenerate: async () => ({
        content: [{ type: "text", text: JSON.stringify({ score: 87, reason: "fit" }) }],
        finishReason: { unified: "stop", raw: "end_turn" },
        usage: mockState.usage,
        warnings: [],
      }),
    });
  },
}));

const { getProvider, usageFrom } = await import("../pipeline_core/providers.js");
const { _resetSecretCache } = await import("../pipeline_core/secrets.js");

const PER_M = 1_000_000;

describe("getProvider().generateObject — real AI SDK v7 usage", () => {
  let savedKey: string | undefined;
  beforeEach(() => {
    savedKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    _resetSecretCache();
    mockState.modelIds = [];
  });
  afterEach(() => {
    if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = savedKey;
    _resetSecretCache();
  });

  const schema = z.object({ score: z.number(), reason: z.string() });

  it("records non-zero tokens and the right cost (no cache)", async () => {
    mockState.usage = {
      inputTokens: { total: 1000, noCache: 1000, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 200, text: 200, reasoning: 0 },
    };
    const p = await getProvider({ provider: "anthropic", model: "claude-sonnet-4-6" });
    const res = await p.generateObject({ schema, prompt: "score this lead" });

    expect(mockState.modelIds).toEqual(["claude-sonnet-4-6"]);
    expect(res.object).toEqual({ score: 87, reason: "fit" });
    expect(res.usage.inputTokens).toBe(1000);
    expect(res.usage.outputTokens).toBe(200);
    // sonnet-4-6: $3 in / $15 out per MTok
    expect(res.usage.costUsd).toBeCloseTo((1000 * 3 + 200 * 15) / PER_M, 12);
    expect(res.usage.costUsd).toBeGreaterThan(0);
    expect(res.usage.cacheReadTokens).toBeUndefined();
    expect(res.usage.cacheWriteTokens).toBeUndefined();
  });

  it("prices cache read/write tokens through the real path", async () => {
    mockState.usage = {
      inputTokens: { total: 10_000, noCache: 1_000, cacheRead: 8_000, cacheWrite: 1_000 },
      outputTokens: { total: 500, text: 400, reasoning: 100 },
    };
    const p = await getProvider({ provider: "anthropic", model: "claude-opus-5-5" });
    const res = await p.generateObject({ schema, prompt: "x" });

    expect(res.usage.inputTokens).toBe(10_000);
    expect(res.usage.outputTokens).toBe(500);
    expect(res.usage.cacheReadTokens).toBe(8_000);
    expect(res.usage.cacheWriteTokens).toBe(1_000);
    // opus-5-5: $4 in / $20 out. 1k uncached @4 + 8k read @0.4 + 1k write @5 + 500 out @20
    const expected = (1_000 * 4 + 8_000 * 0.4 + 1_000 * 5 + 500 * 20) / PER_M;
    expect(res.usage.costUsd).toBeCloseTo(expected, 12);
  });

  it("treats unreported usage as zero rather than throwing", async () => {
    mockState.usage = {
      inputTokens: { total: undefined, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: undefined, text: undefined, reasoning: undefined },
    };
    const p = await getProvider({ provider: "anthropic", model: "claude-sonnet-4-6" });
    const res = await p.generateObject({ schema, prompt: "x" });
    expect(res.usage).toEqual({ inputTokens: 0, outputTokens: 0, costUsd: 0 });
  });
});

describe("usageFrom", () => {
  it("maps LanguageModelUsage fields without casts", () => {
    const u = usageFrom("claude-haiku-4-5", {
      inputTokens: 2_000,
      inputTokenDetails: { noCacheTokens: 1_500, cacheReadTokens: 500, cacheWriteTokens: undefined },
      outputTokens: 100,
      outputTokenDetails: { textTokens: 100, reasoningTokens: undefined },
      totalTokens: 2_100,
    });
    expect(u.inputTokens).toBe(2_000);
    expect(u.outputTokens).toBe(100);
    expect(u.cacheReadTokens).toBe(500);
    expect(u.cacheWriteTokens).toBeUndefined();
    // haiku-4-5: $1/$5 — 1500 @1 + 500 @0.1 + 100 @5
    expect(u.costUsd).toBeCloseTo((1_500 + 50 + 500) / PER_M, 12);
  });
});

describe("pricing table + normalization", () => {
  let errSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    _resetPricingWarnings();
    errSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });
  afterEach(() => errSpy.mockRestore());

  it.each([
    ["claude-opus-5-5", 4, 20],
    ["claude-sonnet-5-5", 2, 10],
    ["claude-opus-5", 5, 25],
    ["claude-sonnet-5", 2, 10],
    ["claude-opus-4-8", 5, 25],
    ["claude-opus-4-7", 5, 25],
    ["claude-opus-4-6", 5, 25],
    ["claude-sonnet-4-6", 3, 15],
    ["claude-haiku-4-5", 1, 5],
  ])("%s is $%d / $%d per MTok", (model, inP, outP) => {
    expect(priceFor(model)).toEqual({ in: inP, out: outP });
  });

  it("strips provider prefix and snapshot date", () => {
    expect(normalizeModelId("anthropic/claude-haiku-4-5-20251001")).toBe("claude-haiku-4-5");
    expect(normalizeModelId("claude-sonnet-4-6")).toBe("claude-sonnet-4-6");
    expect(priceFor("anthropic/claude-haiku-4-5-20251001")).toEqual({ in: 1, out: 5 });
    expect(priceFor("claude-opus-4-8-20260101")).toEqual({ in: 5, out: 25 });
  });

  it("longest-prefix match prefers the most specific row", () => {
    // opus-5-5 must not collapse to opus-5
    expect(priceFor("claude-opus-5-5-fast")).toEqual({ in: 4, out: 20 });
    expect(priceFor("claude-opus-5-experimental")).toEqual({ in: 5, out: 25 });
    // date-free variant ids resolve to their family row
    expect(priceFor("gpt-4o-mini")).toEqual({ in: 2.5, out: 10 });
    expect(errSpy).not.toHaveBeenCalled();
  });

  it("falls back for unknown models and warns exactly once per model", () => {
    expect(priceFor("mystery-model-9")).toEqual({ in: 3, out: 15 });
    priceFor("mystery-model-9");
    costFor("mystery-model-9", 10, 10);
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(String(errSpy.mock.calls[0]![0])).toContain('"mystery-model-9"');
    priceFor("another-unknown");
    expect(errSpy).toHaveBeenCalledTimes(2);
  });
});

describe("cache pricing", () => {
  it("reads at 0.1x and writes at 1.25x the input price", () => {
    // sonnet-4-6 input $3/MTok
    expect(costFor("claude-sonnet-4-6", 1_000_000, 0, { cacheReadTokens: 1_000_000 })).toBeCloseTo(0.3, 12);
    expect(costFor("claude-sonnet-4-6", 1_000_000, 0, { cacheWriteTokens: 1_000_000 })).toBeCloseTo(3.75, 12);
    expect(costFor("claude-sonnet-4-6", 1_000_000, 0)).toBeCloseTo(3, 12);
  });

  it("is backward compatible: 3-arg costFor equals uncached pricing", () => {
    expect(costFor("claude-opus-4-8", 1_000, 1_000)).toBeCloseTo((1_000 * 5 + 1_000 * 25) / PER_M, 12);
  });

  it("never prices negative uncached input when cache exceeds total", () => {
    expect(costFor("claude-sonnet-4-6", 100, 0, { cacheReadTokens: 1_000 })).toBeCloseTo(
      (1_000 * 0.3) / PER_M,
      12,
    );
  });

  it("CostMeter accumulates cache-aware cost", () => {
    const m = new CostMeter();
    const u = m.record("claude-sonnet-4-6", 2_000, 100, { cacheReadTokens: 1_000 });
    expect(u.cacheReadTokens).toBe(1_000);
    expect(u.costUsd).toBeCloseTo((1_000 * 3 + 1_000 * 0.3 + 100 * 15) / PER_M, 12);
    m.record("claude-sonnet-4-6", 1_000, 0);
    expect(m.calls).toBe(2);
    expect(m.summary().inputTokens).toBe(3_000);
    expect(m.spentUsd).toBeCloseTo(u.costUsd + 3_000 / PER_M, 12);
  });
});
