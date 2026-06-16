/**
 * pipeline_core/providers.ts — the provider-pluggable LLM seam.
 *
 * Because connector calls are deterministic glue (pipeline.ts), the hard
 * cross-provider TOOL-CALLING problem collapses to the easy cross-provider
 * STRUCTURED-OUTPUT problem — which the Vercel AI SDK's generateObject solves
 * uniformly across Anthropic / OpenAI / Google / xAI.
 *
 * D4 (Claude-first): only providers in SUPPORTED_PROVIDERS may run. A provider
 * earns its place by passing the eval gate (Epic 4/6). Until then it throws —
 * "BYO any key with no gate" is the silent-quality trap Huyen warned about.
 * Keys come from getSecret (env | local file); non-Anthropic deps are optional
 * and dynamically imported, so a minimal install still works on Claude alone.
 */

import { generateObject as aiGenerateObject, type LanguageModel } from "ai";
import type { z } from "zod";
import { getSecret, hasSecret } from "./secrets.js";
import { costFor, type Usage } from "./cost.js";

export type ProviderName = "anthropic" | "openai" | "google" | "xai";

/** Providers that have passed the eval gate and may run unguarded. */
export const SUPPORTED_PROVIDERS = new Set<ProviderName>(["anthropic"]);

const DEFAULT_MODEL: Record<ProviderName, string> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4o",
  google: "gemini-2.0-flash",
  xai: "grok-2-latest",
};

const KEY_ENV: Record<ProviderName, string[]> = {
  anthropic: ["ANTHROPIC_API_KEY"],
  openai: ["OPENAI_API_KEY"],
  google: ["GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"],
  xai: ["XAI_API_KEY"],
};

export interface GenerateObjectArgs<S extends z.ZodTypeAny> {
  schema: S;
  prompt: string;
  system?: string;
}

export interface LLMProvider {
  readonly name: ProviderName;
  readonly model: string;
  generateObject<S extends z.ZodTypeAny>(
    args: GenerateObjectArgs<S>,
  ): Promise<{ object: z.infer<S>; usage: Usage }>;
}

/** First provider with a configured key, in Claude-first preference order. */
export function detectProvider(): ProviderName {
  const order: ProviderName[] = ["anthropic", "openai", "xai", "google"];
  for (const p of order) {
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
    case "google": {
      const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
      return createGoogleGenerativeAI({ apiKey: firstKey("google") })(modelId);
    }
    case "xai": {
      const { createXai } = await import("@ai-sdk/xai");
      return createXai({ apiKey: firstKey("xai") })(modelId);
    }
  }
}

export interface GetProviderOptions {
  provider?: ProviderName;
  model?: string;
}

/** Resolve a usable provider from options + env, enforcing the eval gate. */
export async function getProvider(opts: GetProviderOptions = {}): Promise<LLMProvider> {
  const name = opts.provider ?? detectProvider();
  assertSupported(name);
  const model = opts.model ?? process.env.INTENT_OUTREACH_MODEL ?? DEFAULT_MODEL[name];
  const languageModel = await resolveModel(name, model);

  return {
    name,
    model,
    async generateObject<S extends z.ZodTypeAny>(
      args: GenerateObjectArgs<S>,
    ): Promise<{ object: z.infer<S>; usage: Usage }> {
      const res = await aiGenerateObject({
        model: languageModel,
        schema: args.schema,
        prompt: args.prompt,
        ...(args.system ? { system: args.system } : {}),
      });
      const u = res.usage;
      const inputTokens = (u as { promptTokens?: number }).promptTokens ?? 0;
      const outputTokens = (u as { completionTokens?: number }).completionTokens ?? 0;
      return {
        object: res.object as z.infer<S>,
        usage: { inputTokens, outputTokens, costUsd: costFor(model, inputTokens, outputTokens) },
      };
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
