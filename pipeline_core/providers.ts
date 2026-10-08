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
 * D4 (Claude-first): B2B retains the SUPPORTED_PROVIDERS gate; other packs
 * require a verified approval for the exact provider/model/pack. Until then it throws —
 * "BYO any key with no gate" is the silent-quality trap Huyen warned about.
 * Keys come from getSecret (env | local file); non-Anthropic deps are optional
 * and dynamically imported, so a minimal install still works on Claude alone.
 */

import {
  extractReasoningMiddleware,
  generateText,
  NoObjectGeneratedError,
  Output,
  wrapLanguageModel,
  type LanguageModel,
  type LanguageModelUsage,
} from "ai";
import type { z } from "zod";
import { getSecret, hasSecret } from "./secrets.js";
import { costFor, type Usage } from "./cost.js";
import { minimaxJsonMiddleware } from "./minimax.js";
import { approvedEntry, DEFAULT_EVAL_PACK, supportedProviderNames } from "../evals/supported.js";

export type ProviderName = "anthropic" | "openai" | "xai" | "minimax";

/**
 * Providers that may run unguarded: DERIVED from evals/supported.ts. A provider
 * is supported iff it has at least one approved {provider, model} pair there;
 * a pair is approved by a passing keyed run of the eval harness (`pnpm run
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

/** Thinking-depth levels the seams use for models with explicit effort support. */
export type Effort = "low" | "medium" | "high";

/**
 * Per-call bounds. All optional so stubs and older callers keep compiling.
 * `effort` is forwarded to supported Anthropic models (see `supportsEffort`)
 * and MiniMax-M3.1-Flash-Preview. Other models retain their endpoint defaults.
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
  /** Production factories enforce approval again when a campaign selects its pack. */
  assertPackApproved?(pack: string): void;
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
/** Sum two attempts' usage (tokens, cost and cache counts). */
export function addUsage(a: Usage, b: Usage): Usage {
  const cacheReadTokens = (a.cacheReadTokens ?? 0) + (b.cacheReadTokens ?? 0);
  const cacheWriteTokens = (a.cacheWriteTokens ?? 0) + (b.cacheWriteTokens ?? 0);
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    costUsd: a.costUsd + b.costUsd,
    ...(cacheReadTokens > 0 ? { cacheReadTokens } : {}),
    ...(cacheWriteTokens > 0 ? { cacheWriteTokens } : {}),
  };
}

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
  /** Eval approval scope. Default b2b-sdr retains its legacy provider gate. */
  pack?: string;
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
      `qualify it with: pnpm run evals:promote --provider ${provider} --model ${model}\n`,
  );
}

/** Runtime approval uses the exact model AND pack; B2B's legacy behavior stays intact. */
function assertModelSupported(provider: ProviderName, model: string, pack: string): void {
  if (pack === DEFAULT_EVAL_PACK) {
    assertSupported(provider);
    if (SUPPORTED_PROVIDERS.has(provider)) warnIfUnapproved(provider, model);
    return;
  }
  if (process.env.INTENT_OUTREACH_ALLOW_UNGATED === "1") return;
  const entry = approvedEntry(provider, model, undefined, pack);
  if (entry?.verified && entry.resultFile) return;
  throw new Error(
    `model "${provider}/${model}" has not passed the eval gate for pack "${pack}". ` +
      `Qualify it with: pnpm run evals:promote --provider ${provider} --model ${model} --pack ${pack}. ` +
      `INTENT_OUTREACH_ALLOW_UNGATED=1 overrides this check for local testing only.`,
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
  const model = opts.model ?? process.env.INTENT_OUTREACH_MODEL ?? DEFAULT_MODEL[name];
  if (gated) assertModelSupported(name, model, opts.pack ?? DEFAULT_EVAL_PACK);
  const languageModel = await resolveModel(name, model);

  return {
    name,
    model,
    ...(gated ? { assertPackApproved: (pack: string) => assertModelSupported(name, model, pack) } : {}),
    async generateObject<S extends z.ZodTypeAny>(
      args: GenerateObjectArgs<S>,
    ): Promise<{ object: z.infer<S>; usage: Usage }> {
      const opts = args.options ?? {};
      // Anchor the option bag to the installed SDK; inferred union keys include
      // undefined values that its JSON provider-options type does not accept.
      const providerOptions: Parameters<typeof generateText>[0]["providerOptions"] =
        name === "anthropic" && opts.effort && supportsEffort(model)
          ? { anthropic: { effort: opts.effort } }
          : name === "minimax" && model === "MiniMax-M3.1-Flash-Preview" && opts.effort
            ? { minimax: { reasoningEffort: opts.effort } }
          : undefined;
      const attempt = async (): Promise<{ object: z.infer<S>; usage: Usage }> => {
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
        try {
          return { object: res.output as z.infer<S>, usage };
        } catch (err) {
          // NoOutputGeneratedError (e.g. the token cap hit before any text) carries
          // neither usage nor finishReason; attach both so the pipeline's error
          // path still meters the spend and records why.
          throw Object.assign(err instanceof Error ? err : new Error(String(err)), {
            usage: res.usage,
            finishReason: res.finishReason,
          });
        }
      };

      try {
        return await attempt();
      } catch (first) {
        // One retry, only for a response that came back but could not be parsed or
        // validated against the schema (an intermittent model glitch; ~2.5% of
        // MiniMax-M3 calls in the 2026-10-04 gate runs). Transport errors, refusals,
        // aborts and empty/truncated output (NoOutputGeneratedError) are not retried.
        if (!NoObjectGeneratedError.isInstance(first) || opts.abortSignal?.aborted) throw first;
        const firstUsage = usageFrom(model, first.usage ?? ({} as LanguageModelUsage));
        process.stderr.write(
          `[intent-outreach] ${name}/${model}: unparseable structured response, retrying once (${first.message})\n`,
        );
        try {
          const second = await attempt();
          return { object: second.object, usage: { ...addUsage(firstUsage, second.usage), retries: 1 } };
        } catch (err) {
          // Both attempts failed: surface the second error with the spend of both,
          // so the pipeline meters everything the user paid for.
          const e = err as Error & { usage?: LanguageModelUsage };
          const secondUsage = usageFrom(model, e.usage ?? ({} as LanguageModelUsage));
          const both = addUsage(firstUsage, secondUsage);
          throw Object.assign(e instanceof Error ? e : new Error(String(e)), {
            usage: { inputTokens: both.inputTokens, outputTokens: both.outputTokens, costUsd: both.costUsd },
            retries: 1,
          });
        }
      }
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
