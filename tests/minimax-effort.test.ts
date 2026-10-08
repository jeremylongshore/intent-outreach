import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { getProviderUnchecked, type Effort } from "../pipeline_core/providers.js";
import { _resetSecretCache } from "../pipeline_core/secrets.js";
import { MINIMAX_MIN_OUTPUT_TOKENS } from "../pipeline_core/minimax.js";

// Exercise the actual AI SDK client and middleware against intercepted HTTP,
// so a providerOptions spelling that never reaches the wire cannot pass.
const requests: { body: Record<string, unknown>; signal?: AbortSignal | null }[] = [];

beforeEach(() => {
  requests.length = 0;
  vi.stubEnv("MINIMAX_API_KEY", "minimax-test");
  vi.stubEnv("MINIMAX_BASE_URL", "https://minimax.invalid/v1");
  _resetSecretCache();
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.stubGlobal("fetch", vi.fn(async (_input: unknown, init?: RequestInit) => {
    requests.push({ body: JSON.parse(String(init?.body)), signal: init?.signal });
    return new Response(JSON.stringify({
      id: "test-completion",
      object: "chat.completion",
      created: 1,
      model: "test-model",
      choices: [{ index: 0, message: { role: "assistant", content: '{"value":"ok"}' }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }), { headers: { "content-type": "application/json" } });
  }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  _resetSecretCache();
});

async function generate(model: string, effort?: Effort) {
  const provider = await getProviderUnchecked({ provider: "minimax", model });
  return provider.generateObject({
    schema: z.object({ value: z.string() }),
    prompt: "Return value ok.",
    options: { maxOutputTokens: 2000, abortSignal: AbortSignal.timeout(60_000), ...(effort ? { effort } : {}) },
  });
}

describe("MiniMax native effort on the HTTP wire", () => {
  it.each(["low", "medium", "high"] as const)("maps %s to reasoning_effort for M3.1", async (effort) => {
    const result = await generate("MiniMax-M3.1-Flash-Preview", effort);
    expect(result.object).toEqual({ value: "ok" });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.body.reasoning_effort).toBe(effort);
    expect(requests[0]?.body.model).toBe("MiniMax-M3.1-Flash-Preview");
    // The existing middleware deliberately raises 2000 to its token floor.
    expect(requests[0]?.body.max_tokens).toBe(MINIMAX_MIN_OUTPUT_TOKENS);
    expect(requests[0]?.body.response_format).toEqual({ type: "json_object" });
    expect(requests[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(result.usage.inputTokens).toBe(10);
    expect(result.usage.outputTokens).toBe(5);
  });

  it.each(["MiniMax-M3", "MiniMax-M2.7", "MiniMax-M3.1-unknown"])("leaves %s unchanged", async (model) => {
    await generate(model, "low");
    expect(requests[0]?.body).not.toHaveProperty("reasoning_effort");
  });

  it("preserves the endpoint default when no effort is requested", async () => {
    await generate("MiniMax-M3.1-Flash-Preview");
    expect(requests[0]?.body).not.toHaveProperty("reasoning_effort");
  });
});
