/**
 * tests/parse-retry.test.ts — one logged retry on an unparseable structured response.
 *
 * Runs the real `ai` generateText + Output.object against a MockLanguageModelV4
 * (injected via a mocked @ai-sdk/anthropic factory) that returns a scripted
 * sequence of replies. Guards:
 *   - a garbled reply followed by a valid one succeeds, with usage summed over
 *     both attempts and `retries: 1`, and a stderr line saying so;
 *   - two garbled replies throw, carrying the spend of both attempts;
 *   - a valid first reply makes exactly one call (no retry);
 *   - a schema-invalid reply is retried the same way as unparseable text.
 */

import { _resetSecretCache } from "../pipeline_core/secrets.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { MockLanguageModelV4 } from "ai/test";

const script = vi.hoisted(() => ({ replies: [] as string[], calls: 0 }));

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: () => (modelId: string) =>
    new MockLanguageModelV4({
      provider: "anthropic.messages",
      modelId,
      doGenerate: async () => {
        const text = script.replies[script.calls] ?? "";
        script.calls++;
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
    }),
}));

const { getProvider } = await import("../pipeline_core/providers.js");
const schema = z.object({ score: z.number().int(), reason: z.string() });
const VALID = JSON.stringify({ score: 87, reason: "fit" });

describe("structured output: one retry on an unparseable response", () => {
  let savedKey: string | undefined;
  let stderr: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    savedKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    _resetSecretCache();
    script.replies = [];
    script.calls = 0;
    stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });
  afterEach(() => {
    if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = savedKey;
    _resetSecretCache();
    stderr.mockRestore();
  });

  it("recovers from one garbled reply and meters both attempts", async () => {
    script.replies = ['{"score": 87, "reason": "fit', VALID];
    const p = await getProvider({ provider: "anthropic", model: "claude-sonnet-4-6" });
    const res = await p.generateObject({ schema, prompt: "x" });
    expect(res.object).toEqual({ score: 87, reason: "fit" });
    expect(script.calls).toBe(2);
    expect(res.usage.inputTokens).toBe(2000);
    expect(res.usage.outputTokens).toBe(200);
    expect(res.usage.retries).toBe(1);
    expect(res.usage.costUsd).toBeGreaterThan(0);
    expect(stderr.mock.calls.map((c: unknown[]) => String(c[0])).join("")).toContain("unparseable structured response, retrying once");
  });

  it("retries a schema-invalid reply the same way", async () => {
    script.replies = [JSON.stringify({ score: "high", reason: "fit" }), VALID];
    const p = await getProvider({ provider: "anthropic", model: "claude-sonnet-4-6" });
    const res = await p.generateObject({ schema, prompt: "x" });
    expect(res.object.score).toBe(87);
    expect(script.calls).toBe(2);
  });

  it("throws after a second garbled reply, carrying the spend of both attempts", async () => {
    script.replies = ["not json", "still not json"];
    const p = await getProvider({ provider: "anthropic", model: "claude-sonnet-4-6" });
    const err = (await p.generateObject({ schema, prompt: "x" }).catch((e) => e)) as {
      usage?: { inputTokens: number; outputTokens: number; costUsd: number };
      retries?: number;
    };
    expect(err).toBeInstanceOf(Error);
    expect(script.calls).toBe(2);
    expect(err.retries).toBe(1);
    expect(err.usage?.inputTokens).toBe(2000);
    expect(err.usage?.outputTokens).toBe(200);
    expect(err.usage?.costUsd).toBeGreaterThan(0);
  });

  it("does not retry a valid first reply", async () => {
    script.replies = [VALID, VALID];
    const p = await getProvider({ provider: "anthropic", model: "claude-sonnet-4-6" });
    const res = await p.generateObject({ schema, prompt: "x" });
    expect(script.calls).toBe(1);
    expect(res.usage.retries).toBeUndefined();
    expect(stderr).not.toHaveBeenCalled();
  });
});
