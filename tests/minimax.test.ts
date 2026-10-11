/**
 * tests/minimax.test.ts — the MiniMax-M3 adapter, keyless.
 *
 * Guards:
 *   - the provider resolves (gated in via evals/supported.ts) with default model MiniMax-M3
 *   - auto-detect order: minimax → anthropic → openai (Grok requires explicit selection)
 *   - <think> stripping (terminated, multiple, unterminated) and fence unwrapping
 *   - "" → [] coercion only at schema-array paths, at the provider boundary only
 *   - the middleware end to end through generateText + Output.object on a mock model:
 *     schema moved into a system message, json mode without schema, output-token floor
 *   - the cost row
 *
 * No network: the mock model stands in for the OpenAI-compatible client.
 */

import { generateText, Output } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { z } from "zod";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  coerceEmptyArrays,
  MINIMAX_MIN_OUTPUT_TOKENS,
  normalizeMinimaxText,
  stripFences,
  stripThink,
} from "../pipeline_core/minimax.js";
import { DETECT_ORDER, detectProvider, getProvider, wrapMinimax } from "../pipeline_core/providers.js";
import { costFor, priceFor } from "../pipeline_core/cost.js";
import { ScoreOutputSchema } from "../pipeline_core/seam.js";
import { _resetSecretCache } from "../pipeline_core/secrets.js";

const KEYS = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "XAI_API_KEY", "MINIMAX_API_KEY", "INTENT_OUTREACH_MODEL"];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  _resetSecretCache();
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  _resetSecretCache();
});

describe("minimax provider resolution", () => {
  it("resolves through the product gate (approved in evals/supported.ts) with default model MiniMax-M3", async () => {
    process.env.MINIMAX_API_KEY = "mm-test";
    const p = await getProvider({ provider: "minimax" });
    expect(p.name).toBe("minimax");
    expect(p.model).toBe("MiniMax-M3");
  });

  it("auto-detect order puts minimax first and excludes Grok", () => {
    expect(DETECT_ORDER).toEqual(["minimax", "anthropic", "openai"]);
  });

  it("detects minimax when it is the only key", () => {
    process.env.MINIMAX_API_KEY = "mm-test";
    expect(detectProvider()).toBe("minimax");
  });

  it("minimax wins even when other provider keys are present", () => {
    process.env.MINIMAX_API_KEY = "mm-test";
    process.env.OPENAI_API_KEY = "sk-openai-test";
    expect(detectProvider()).toBe("minimax");
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    expect(detectProvider()).toBe("minimax");
  });

  it("minimax beats xai", () => {
    process.env.MINIMAX_API_KEY = "mm-test";
    process.env.XAI_API_KEY = "xai-test";
    expect(detectProvider()).toBe("minimax");
  });

  it("with no key the default is minimax", () => {
    expect(detectProvider()).toBe("minimax");
  });
});

describe("stripThink / stripFences", () => {
  it("removes a terminated think block", () => {
    expect(stripThink('<think>plan it</think>\n{"a":1}')).toBe('{"a":1}');
  });

  it("removes several think blocks", () => {
    expect(stripThink('<think>x</think>{"a":<think>y</think>1}')).toBe('{"a":1}');
  });

  it("an unterminated think block (budget exhausted) becomes empty text", () => {
    expect(stripThink("<think>still thinking about the answer")).toBe("");
  });

  it("leaves text without think blocks alone", () => {
    expect(stripThink(' {"a":1} ')).toBe('{"a":1}');
  });

  it("unwraps a ```json fence and a bare ``` fence", () => {
    expect(stripFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripFences('```\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripFences('{"a":1}')).toBe('{"a":1}');
  });
});

describe('coerceEmptyArrays ("" → [] at schema-array paths only)', () => {
  const schema = {
    type: "object",
    properties: {
      angles: { type: "array", items: { type: "string" } },
      reason: { type: "string" },
      maybe: { anyOf: [{ type: "array", items: { type: "string" } }, { type: "null" }] },
      nested: {
        type: "array",
        items: { type: "object", properties: { refs: { type: "array", items: { type: "string" } } } },
      },
    },
  };

  it('rewrites "" to [] where the schema says array', () => {
    expect(coerceEmptyArrays({ angles: "", reason: "" }, schema)).toEqual({ angles: [], reason: "" });
  });

  it("handles nullable arrays (anyOf) and nested item schemas", () => {
    expect(coerceEmptyArrays({ maybe: "", nested: [{ refs: "" }] }, schema)).toEqual({
      maybe: [],
      nested: [{ refs: [] }],
    });
  });

  it("never touches a non-empty string, a real array, or keys the schema does not describe", () => {
    const v = { angles: "one angle", other: "", reason: "ok" };
    expect(coerceEmptyArrays(v, schema)).toEqual(v);
    expect(coerceEmptyArrays({ angles: ["a"] }, schema)).toEqual({ angles: ["a"] });
  });

  it("is a no-op without a schema", () => {
    expect(coerceEmptyArrays({ angles: "" }, undefined)).toEqual({ angles: "" });
  });

  it("normalizeMinimaxText strips, unfences, coerces and re-serialises; unparseable text passes through stripped", () => {
    expect(normalizeMinimaxText('<think>hm</think>```json\n{"angles":""}\n```', schema)).toBe('{"angles":[]}');
    expect(normalizeMinimaxText("<think>hm</think>not json", schema)).toBe("not json");
  });

  it("the seam schema itself stays strict: the leniency lives at the provider boundary only", () => {
    expect(ScoreOutputSchema.safeParse({ fitScore: 10, fitReason: "x", angles: "" }).success).toBe(false);
  });
});

describe("minimax middleware through generateText + Output.object", () => {
  function m3(reply: string) {
    const seen: { options?: unknown } = {};
    const model = new MockLanguageModelV4({
      provider: "minimax.chat",
      modelId: "MiniMax-M3",
      doGenerate: async (options) => {
        seen.options = options;
        return {
          content: [{ type: "text", text: reply }],
          finishReason: { unified: "stop", raw: "stop" },
          usage: {
            inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 50, text: 20, reasoning: 30 },
          },
          warnings: [],
        };
      },
    });
    return { model: wrapMinimax(model), seen };
  }

  it('parses a reply with a think block, a fence and "" for angles', async () => {
    const { model, seen } = m3(
      '<think>The lead fits.</think>\n```json\n{"fitScore": 80, "fitReason": "fits", "angles": ""}\n```',
    );
    const res = await generateText({
      model,
      output: Output.object({ schema: ScoreOutputSchema }),
      prompt: "score it",
      maxOutputTokens: 2000,
    });
    expect(res.output).toEqual({ fitScore: 80, fitReason: "fits", angles: [] });
    expect(res.reasoningText).toContain("The lead fits.");

    const opts = seen.options as {
      maxOutputTokens: number;
      responseFormat: { type: string; schema?: unknown };
      prompt: { role: string; content: unknown }[];
    };
    // Token floor so M3 cannot think away the whole budget.
    expect(opts.maxOutputTokens).toBe(MINIMAX_MIN_OUTPUT_TOKENS);
    // Plain JSON mode: the schema is NOT sent as response_format (M3 ignores it)…
    expect(opts.responseFormat).toEqual({ type: "json" });
    // …it is carried in a leading system message instead.
    expect(opts.prompt[0]!.role).toBe("system");
    expect(String(opts.prompt[0]!.content)).toContain('"fitScore"');
  });

  it("keeps a caller cap above the floor", async () => {
    const { model, seen } = m3('{"fitScore": 1, "fitReason": "no", "angles": []}');
    await generateText({
      model,
      output: Output.object({ schema: ScoreOutputSchema }),
      prompt: "x",
      maxOutputTokens: 30_000,
    });
    expect((seen.options as { maxOutputTokens: number }).maxOutputTokens).toBe(30_000);
  });

  it("an unterminated think block surfaces as a no-output error, not a bogus object", async () => {
    const { model } = m3("<think>ran out of budget mid-thought");
    await expect(
      generateText({ model, output: Output.object({ schema: z.object({ a: z.number() }) }), prompt: "x" }),
    ).rejects.toMatchObject({ name: "AI_NoObjectGeneratedError", text: "" });
  });
});

describe("cost row", () => {
  it("prices MiniMax-M3 at the official standard tier ($0.30 in / $1.20 out per MTok)", () => {
    expect(priceFor("MiniMax-M3")).toEqual({ in: 0.3, out: 1.2 });
    expect(priceFor("minimax/MiniMax-M3")).toEqual({ in: 0.3, out: 1.2 });
    expect(costFor("MiniMax-M3", 1_000_000, 1_000_000)).toBeCloseTo(1.5, 10);
  });
});
