/**
 * pipeline_core/providers.ts — the provider-pluggable LLM seam.
 *
 * Because connector calls are deterministic glue (pipeline.ts), the hard
 * cross-provider TOOL-CALLING problem collapses to the easy cross-provider
 * STRUCTURED-OUTPUT problem — which the Vercel AI SDK's generateText +
 * Output.object solves uniformly across Anthropic / OpenAI / xAI / MiniMax.
 *
 * Google was dropped entirely (owner decision, 2026-10): no adapter, no key
 * lookup, no optional dependency. Intent Outreach is zero-Google.
 *
 * D4 (Claude-first): only providers in SUPPORTED_PROVIDERS may run. A provider
 * earns its place by passing the eval gate (Epic 4/6). Until then it throws —
 * "BYO any key with no gate" is the silent-quality trap Huyen warned about.
 * Keys come from getSecret (env | local file); non-Anthropic deps are optional
 * and dynamically imported, so a minimal install still works on Claude alone.
 */

import {
  extractReasoningMiddleware,
  generateText,
  Output,
  wrapLanguageModel,
  type LanguageModel,
  type LanguageModelUsage,
} from "ai";
import type { z } from "zod";
import { getSecret, hasSecret } from "./secrets.js";
import { costFor, type Usage } from "./cost.js";
import { minimaxJsonMiddleware } from "./minimax.js";
import { approvedEntry, supportedProviderNames } from "../evals/supported.js";

export type ProviderName = "anthropic" | "openai" | "xai" | "minimax";

/**
 * Providers that may run unguarded: DERIVED from evals/supported.ts. A provider
 * is supported iff it has at least one approved {provider, model} pair there;
 * a pair is approved by a passing keyed run of the eval harness (`npm run
 * evals:promote`). anthropic + openai are carried as legacy claims
 * (verified: false) until re-run with a key. The xai adapter ships ready but
 * stays gated until an eval run with a real key passes.
 */
export const SUPPORTED_PROVIDERS: ReadonlySet<ProviderName> = new Set<ProviderName>(supportedProviderNames());

const DEFAULT_MODEL: Record<ProviderName, string> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4o",
  xai: "grok-2-latest",
  minimax: "MiniMax-M3",
};

const KEY_ENV: Record<ProviderName, string[]> = {
  anthropic: ["ANTHROPIC_API_KEY"],
  openai: ["OPENAI_API_KEY"],
  xai: ["XAI_API_KEY"],
  minimax: ["MINIMAX_API_KEY"],
};

/** Anthropic effort levels the seams use (thinking depth + overall token spend). */
export type Effort = "low" | "medium" | "high";

/**
 * Per-call bounds. All optional so stubs and older callers keep compiling.
 * `effort` is forwarded ONLY to Anthropic models that accept it (see
 * `supportsEffort`); other providers ignore it.
 */
export interface GenerateOptions {
  /** Hard ceiling on generated tokens. On thinking models, thinking counts toward it. */
  maxOutputTokens?: number;
  /** Cancels the request (e.g. AbortSignal.timeout(60_000)). */
  abortSignal?: AbortSignal;
  effort?: Effort;
}

export interface GenerateObjectArgs<S extends z.ZodTypeAny> {
  schema: S;
  prompt: string;
  system?: string;
  options?: GenerateOptions;
}

export interface LLMProvider {
  readonly name: ProviderName;
  readonly model: string;
  generateObject<S extends z.ZodTypeAny>(
    args: GenerateObjectArgs<S>,
  ): Promise<{ object: z.infer<S>; usage: Usage }>;
}

/** MiniMax's OpenAI-compatible endpoint (override for a gateway with MINIMAX_BASE_URL). */
export const MINIMAX_BASE_URL = "https://api.minimax.io/v1";

/**
 * Auto-detect preference order: Claude first (D4), then OpenAI, then MiniMax.
 * MiniMax sits after both, so adding a MINIMAX_API_KEY never displaces a
 * configured Anthropic/OpenAI key. Making it the default is an owner decision.
 */
export const DETECT_ORDER: readonly ProviderName[] = ["anthropic", "openai", "minimax", "xai"];

/** First provider with a configured key, in Claude-first preference order. */
export function detectProvider(): ProviderName {
  for (const p of DETECT_ORDER) {
    if (KEY_ENV[p].some((k) => hasSecret(k))) return p;
  }
  return "anthropic";
}

function assertSupported(provider: ProviderName): void {
  if (SUPPORTED_PROVIDERS.has(provider)) return;
  if (process.env.INTENT_OUTREACH_ALLOW_UNGATED === "1") return;
  throw new Error(
    `provider "${provider}" has not passed the eval gate yet (D4: Claude-first). ` +
      `Run the eval harness to gate it, or set INTENT_OUTREACH_ALLOW_UNGATED=1 to override.`,
  );
}

function firstKey(provider: ProviderName): string {
  const name = KEY_ENV[provider].find((k) => hasSecret(k)) ?? KEY_ENV[provider][0]!;
  return getSecret(name);
}

async function resolveModel(provider: ProviderName, modelId: string): Promise<LanguageModel> {
  switch (provider) {
    case "anthropic": {
      const { createAnthropic } = await import("@ai-sdk/anthropic");
      const baseURL = process.env.ANTHROPIC_BASE_URL; // gateway path (LiteLLM/Bifrost)
      return createAnthropic({ apiKey: firstKey("anthropic"), ...(baseURL ? { baseURL } : {}) })(
        modelId,
      );
    }
    case "openai": {
      const { createOpenAI } = await import("@ai-sdk/openai");
      return createOpenAI({ apiKey: firstKey("openai") })(modelId);
    }
    case "xai": {
      const { createXai } = await import("@ai-sdk/xai");
      return createXai({ apiKey: firstKey("xai") })(modelId);
    }
    case "minimax": {
      // OpenAI-compatible endpoint. supportsStructuredOutputs is OFF on purpose:
      // a live probe showed M3 accepts response_format json_schema and ignores
      // it, so we run JSON mode and minimaxJsonMiddleware carries the schema in
      // a system message, strips <think> blocks/fences and coerces "" -> [].
      const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
      const baseURL = process.env.MINIMAX_BASE_URL ?? MINIMAX_BASE_URL;
      const base = createOpenAICompatible({
        name: "minimax",
        baseURL,
        apiKey: firstKey("minimax"),
        includeUsage: true,
        supportsStructuredOutputs: false,
      })(modelId);
      return wrapMinimax(base);
    }
  }
}

/**
 * Apply the MiniMax middleware stack. The JSON middleware is listed first, so
 * it is outermost and sees text AFTER extractReasoningMiddleware has lifted
 * terminated <think> blocks into reasoning parts; its own stripThink stays as
 * the safety net for an unterminated block (token budget exhausted).
 */
export function wrapMinimax(model: Parameters<typeof wrapLanguageModel>[0]["model"]): LanguageModel {
  return wrapLanguageModel({
    model,
    middleware: [minimaxJsonMiddleware, extractReasoningMiddleware({ tagName: "think" })],
  });
}

/**
 * Does this Anthropic model accept `output_config.effort`? Effort is GA on Opus
 * 4.5+, Sonnet 4.6+ and every 5.x model; Sonnet 4.5 / Haiku 4.5 and older reject
 * it with a 400, so it is only sent where it is known to work.
 */
export function supportsEffort(modelId: string): boolean {
  const id = modelId.replace(/^.*\//, "").replace(/^(?:anthropic\.|us\.anthropic\.)/, "").replace(/^claude-/, "");
  return /^(?:opus-4-[5-9]|opus-[5-9]|sonnet-4-[6-9]|sonnet-[5-9]|fable|mythos)/.test(id);
}

/**
 * Map AI SDK v7 LanguageModelUsage onto our Usage. `inputTokens` is the SDK's
 * total (uncached + cache read + cache write); the cache split is priced
 * separately in costFor. Fields a provider didn't report count as 0.
 */
export function usageFrom(model: string, u: LanguageModelUsage): Usage {
  const inputTokens = u.inputTokens ?? 0;
  const outputTokens = u.outputTokens ?? 0;
  const cacheReadTokens = u.inputTokenDetails?.cacheReadTokens ?? 0;
  const cacheWriteTokens = u.inputTokenDetails?.cacheWriteTokens ?? 0;
  const cache = {
    ...(cacheReadTokens > 0 ? { cacheReadTokens } : {}),
    ...(cacheWriteTokens > 0 ? { cacheWriteTokens } : {}),
  };
  return {
    inputTokens,
    outputTokens,
    costUsd: costFor(model, inputTokens, outputTokens, cache),
    ...cache,
  };
}

export interface GetProviderOptions {
  provider?: ProviderName;
  model?: string;
}

const warnedUnapproved = new Set<string>();

/**
 * Warn (stderr, once per pair per process) when a supported provider runs a
 * model with no approved record in evals/supported.ts: the provider passed the
 * gate, this model has not.
 */
function warnIfUnapproved(provider: ProviderName, model: string): void {
  if (approvedEntry(provider, model)) return;
  const key = `${provider}:${model}`;
  if (warnedUnapproved.has(key)) return;
  warnedUnapproved.add(key);
  process.stderr.write(
    `intent-outreach: warning: ${provider} model "${model}" has no approved eval record (evals/supported.ts); ` +
      `qualify it with: npm run evals:promote -- --provider ${provider} --model ${model}\n`,
  );
}

/** Reset the once-per-pair warning memory. Tests only. */
export function _resetUnapprovedWarnings(): void {
  warnedUnapproved.clear();
}

/** Resolve a usable provider from options + env, enforcing the eval gate. */
export async function getProvider(opts: GetProviderOptions = {}): Promise<LLMProvider> {
  return createProvider(opts, true);
}

/**
 * EVAL HARNESS ONLY (evals/run.ts). Same as getProvider but skips the eval
 * gate, because the harness is what qualifies an ungated provider/model in the
 * first place. Product code (pipeline_core, mcp, cli) must call getProvider;
 * tests/eval-gate.test.ts fails if anything outside evals/ calls this.
 */
export async function getProviderUnchecked(opts: GetProviderOptions = {}): Promise<LLMProvider> {
  return createProvider(opts, false);
}

async function createProvider(opts: GetProviderOptions, gated: boolean): Promise<LLMProvider> {
  const name = opts.provider ?? detectProvider();
  // Runtime check too: CLI/MCP callers pass untyped strings (e.g. a stale "google").
  if (!Object.hasOwn(KEY_ENV, name)) {
    throw new Error(`unknown provider "${String(name)}" (known: ${Object.keys(KEY_ENV).join(", ")})`);
  }
  if (gated) assertSupported(name);
  const model = opts.model ?? process.env.INTENT_OUTREACH_MODEL ?? DEFAULT_MODEL[name];
  if (gated && SUPPORTED_PROVIDERS.has(name)) warnIfUnapproved(name, model);
  const languageModel = await resolveModel(name, model);

  return {
    name,
    model,
    async generateObject<S extends z.ZodTypeAny>(
      args: GenerateObjectArgs<S>,
    ): Promise<{ object: z.infer<S>; usage: Usage }> {
      const opts = args.options ?? {};
      const providerOptions =
        name === "anthropic" && opts.effort && supportsEffort(model)
          ? { anthropic: { effort: opts.effort } }
          : undefined;
      const res = await generateText({
        model: languageModel,
        output: Output.object({ schema: args.schema }),
        prompt: args.prompt,
        ...(args.system ? { system: args.system } : {}),
        ...(opts.maxOutputTokens !== undefined ? { maxOutputTokens: opts.maxOutputTokens } : {}),
        ...(opts.abortSignal ? { abortSignal: opts.abortSignal } : {}),
        ...(providerOptions ? { providerOptions } : {}),
      });
      const usage = usageFrom(model, res.usage);
      let object: z.infer<S>;
      try {
        object = res.output as z.infer<S>;
      } catch (err) {
        // NoOutputGeneratedError (e.g. the token cap hit before any text) carries
        // neither usage nor finishReason; attach both so the pipeline's error
        // path still meters the spend and records why.
        throw Object.assign(err instanceof Error ? err : new Error(String(err)), {
          usage: res.usage,
          finishReason: res.finishReason,
        });
      }
      return { object, usage };
    },
  };
}

/** Introspection for the skill/CLI: which providers are configured + gated. */
export function listProviderStatus() {
  return (Object.keys(KEY_ENV) as ProviderName[]).map((p) => ({
    name: p,
    configured: KEY_ENV[p].some((k) => hasSecret(k)),
    supported: SUPPORTED_PROVIDERS.has(p),
    defaultModel: DEFAULT_MODEL[p],
    keyEnvVars: KEY_ENV[p],
  }));
}
