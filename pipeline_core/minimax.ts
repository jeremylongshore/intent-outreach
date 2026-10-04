/**
 * pipeline_core/minimax.ts — provider-local output normalisation for MiniMax-M3.
 *
 * MiniMax exposes an OpenAI-compatible chat/completions endpoint, but M3 is a
 * reasoning model with three quirks the seams cannot absorb on their own
 * (live-probed 2026-10-04, see the PR that added this file):
 *
 *   1. `response_format: json_schema` is accepted and IGNORED: the probe got a
 *      different key name, a string where the schema said array, and a
 *      ```json fence. So the adapter runs in JSON mode (`json_object`) and this
 *      middleware puts the JSON Schema into a system message instead.
 *   2. Reasoning arrives inline as `<think>…</think>` in `content`. The AI SDK's
 *      extractReasoningMiddleware lifts terminated blocks into reasoning parts;
 *      `stripThink` is the safety net for an UNTERMINATED block (the token
 *      budget ran out mid-thought), which must become empty text, not JSON
 *      garbage. A generous output-token floor makes that rare.
 *   3. It emits "" where the schema says array (e.g. `angles`). `coerceEmptyArrays`
 *      rewrites "" → [] ONLY at paths the request schema types as array, so the
 *      persistence schemas in models.ts never see or need the leniency.
 *
 * Everything here is pure except the middleware object, and only providers.ts
 * applies it, only to the minimax adapter. Other providers are untouched.
 */

import type { LanguageModelMiddleware } from "ai";

/**
 * Minimum maxOutputTokens sent to MiniMax. M3's thinking counts toward the cap,
 * and a seam cap sized for a non-thinking reply (score: 2000) lets it spend the
 * whole budget thinking and return no content.
 */
export const MINIMAX_MIN_OUTPUT_TOKENS = 16_000;

/** providerOptions key the middleware uses to carry the schema from transformParams to wrapGenerate. */
const STASH = "intentOutreachMinimax";

type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema | JsonSchema[];
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
};

/** Remove every `<think>…</think>` block; an unterminated `<think>` swallows the rest of the text. */
export function stripThink(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/<think>[\s\S]*$/, "")
    .trim();
}

/** Unwrap a single markdown code fence (```json … ``` or ``` … ```) around the whole reply. */
export function stripFences(text: string): string {
  const m = /^```[A-Za-z0-9_-]*\s*\n?([\s\S]*?)\n?```$/.exec(text.trim());
  return (m?.[1] ?? text).trim();
}

function allowsArray(s: JsonSchema | undefined): boolean {
  if (!s) return false;
  if (s.type === "array" || (Array.isArray(s.type) && s.type.includes("array"))) return true;
  return [...(s.anyOf ?? []), ...(s.oneOf ?? []), ...(s.allOf ?? [])].some(allowsArray);
}

function branches(s: JsonSchema): JsonSchema[] {
  return [s, ...(s.anyOf ?? []), ...(s.oneOf ?? []), ...(s.allOf ?? [])];
}

/**
 * Return `value` with every "" replaced by [] where `schema` types that
 * position as an array (including nullable arrays expressed as anyOf).
 * Recurses through object properties and array items. Anything the schema does
 * not describe is left exactly as it is; validation stays the schema's job.
 */
export function coerceEmptyArrays(value: unknown, schema: JsonSchema | undefined): unknown {
  if (!schema) return value;
  if (value === "" && allowsArray(schema)) return [];
  if (Array.isArray(value)) {
    const itemSchema = branches(schema)
      .map((b) => b.items)
      .find((i): i is JsonSchema => i !== undefined && !Array.isArray(i));
    return itemSchema ? value.map((v) => coerceEmptyArrays(v, itemSchema)) : value;
  }
  if (value !== null && typeof value === "object") {
    const props = Object.assign({}, ...branches(schema).map((b) => b.properties ?? {})) as Record<string, JsonSchema>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = coerceEmptyArrays(v, props[k]);
    return out;
  }
  return value;
}

/**
 * Normalise one text reply: strip think blocks and fences, then (when it
 * parses as JSON and a schema is known) coerce "" → [] and re-serialise. Text
 * that does not parse is returned stripped, so the SDK raises its usual parse
 * error with the real content attached.
 */
export function normalizeMinimaxText(text: string, schema?: JsonSchema): string {
  const stripped = stripFences(stripThink(text));
  if (!schema || stripped === "") return stripped;
  try {
    return JSON.stringify(coerceEmptyArrays(JSON.parse(stripped), schema));
  } catch {
    return stripped;
  }
}

/** The system instruction that carries the schema, since M3 ignores json_schema. */
export function schemaInstruction(schema: unknown): string {
  return (
    "Respond with exactly one JSON object and nothing else: no prose, no markdown code fences. " +
    "It must conform to this JSON Schema, using exactly these property names and types. " +
    'Use [] for an empty array, never "". Use null only where the schema allows it.\n' +
    JSON.stringify(schema)
  );
}

/**
 * The MiniMax JSON middleware. transformParams: raise the output-token floor,
 * move the JSON Schema out of responseFormat (plain JSON mode, no "unsupported
 * schema" warning per call) into a system message, and stash it for the
 * response side. wrapGenerate: normalise every text part against that schema.
 */
export const minimaxJsonMiddleware: LanguageModelMiddleware = {
  transformParams: async ({ params }) => {
    const floor = Math.max(params.maxOutputTokens ?? 0, MINIMAX_MIN_OUTPUT_TOKENS);
    const rf = params.responseFormat;
    if (rf?.type !== "json" || rf.schema === undefined) return { ...params, maxOutputTokens: floor };
    return {
      ...params,
      maxOutputTokens: floor,
      prompt: [{ role: "system" as const, content: schemaInstruction(rf.schema) }, ...params.prompt],
      responseFormat: { type: "json" as const },
      providerOptions: { ...params.providerOptions, [STASH]: { schema: rf.schema as never } },
    };
  },
  wrapGenerate: async ({ doGenerate, params }) => {
    const res = await doGenerate();
    const schema = (params.providerOptions?.[STASH] as { schema?: JsonSchema } | undefined)?.schema;
    return {
      ...res,
      content: res.content.map((part) =>
        part.type === "text" ? { ...part, text: normalizeMinimaxText(part.text, schema) } : part,
      ),
    };
  },
};
