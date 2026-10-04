/**
 * pipeline_core/validator.ts — the deterministic gate.
 *
 * Hickey's refusal made enforceable: "the probabilistic system must never write
 * the system of record." Raw LLM output (and raw connector output) is `unknown`
 * until it passes a zod schema here. Only this module can mint the `Validated<T>`
 * brand, and store.ts accepts ONLY branded values — so any code path that tries
 * to persist un-validated model output fails `tsc`, not just review.
 *
 * This is the CI invariant from 017-AT-DECR §8, expressed in the type system.
 */

import { z } from "zod";
import {
  CampaignRunSchema,
  ContactSchema,
  EnrichmentSchema,
  LeadSchema,
  MessageSchema,
  type CampaignRun,
  type Contact,
  type Enrichment,
  type Lead,
  type Message,
} from "./models.js";

/**
 * The brand. `unique symbol` declared (not exported) here means no other module
 * can name it, so no other module can construct a `Validated<T>` — they can only
 * receive one from the functions below.
 */
declare const VALIDATED: unique symbol;

/**
 * Recursively readonly view of a value. A validated record is a SNAPSHOT: the
 * compiler rejects `run.messages.push(x)` / `run.id = "y"` after the gate, and
 * the runtime backs that up with a deep `Object.freeze` (see `deepFreeze`).
 */
export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer U)[]
    ? readonly DeepReadonly<U>[]
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

export type Validated<T> = DeepReadonly<T> & { readonly [VALIDATED]: true };

/**
 * Recursively `Object.freeze` a freshly-parsed value. Post-validation mutation
 * then throws in strict mode (all ESM is strict) instead of silently producing a
 * branded-but-invalid record. zod builds new objects/arrays for every schema'd
 * node; opaque `z.unknown()` payloads (Enrichment.data values) pass through by
 * reference and are frozen too — they are part of the record from here on.
 */
function deepFreeze<T>(value: T, seen: WeakSet<object> = new WeakSet()): T {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze((value as Record<PropertyKey, unknown>)[key], seen);
  }
  return Object.freeze(value);
}

export class ValidationError extends Error {
  constructor(
    public readonly kind: string,
    public readonly issues: z.ZodIssue[],
  ) {
    super(
      `validation failed for ${kind}: ${issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ")}`,
    );
    this.name = "ValidationError";
  }
}

export type ValidateResult<T> =
  | { ok: true; value: Validated<T> }
  | { ok: false; error: ValidationError };

// `S extends z.ZodTypeAny` + `z.infer<S>` (the OUTPUT type) so zod's input/output
// split under `.default()` never leaks an optional-array type past the gate.
function gate<S extends z.ZodTypeAny>(
  kind: string,
  schema: S,
  raw: unknown,
): ValidateResult<z.infer<S>> {
  const parsed = schema.safeParse(raw);
  if (parsed.success) {
    // The ONLY place the brand is minted (CI rejects `as Validated` elsewhere).
    return { ok: true, value: deepFreeze(parsed.data) as Validated<z.infer<S>> };
  }
  return { ok: false, error: new ValidationError(kind, parsed.error.issues) };
}

/** Throwing variants — use when an invalid value is a programmer error. */
function gateOrThrow<S extends z.ZodTypeAny>(
  kind: string,
  schema: S,
  raw: unknown,
): Validated<z.infer<S>> {
  const r = gate(kind, schema, raw);
  if (!r.ok) throw r.error;
  return r.value;
}

// ── Soft (Result) gates — for model output, where failure is expected & handled ──
export const validateMessage = (raw: unknown) => gate("Message", MessageSchema, raw);
export const validateLead = (raw: unknown) => gate("Lead", LeadSchema, raw);
export const validateContact = (raw: unknown) => gate("Contact", ContactSchema, raw);
export const validateEnrichment = (raw: unknown) =>
  gate("Enrichment", EnrichmentSchema, raw);
export const validateCampaignRun = (raw: unknown) =>
  gate("CampaignRun", CampaignRunSchema, raw);

// ── Hard (throwing) gates — for the final record before persist ──
export const assertCampaignRun = (raw: unknown): Validated<CampaignRun> =>
  gateOrThrow("CampaignRun", CampaignRunSchema, raw);
export const assertMessage = (raw: unknown): Validated<Message> =>
  gateOrThrow("Message", MessageSchema, raw);
export const assertLead = (raw: unknown): Validated<Lead> =>
  gateOrThrow("Lead", LeadSchema, raw);
export const assertContact = (raw: unknown): Validated<Contact> =>
  gateOrThrow("Contact", ContactSchema, raw);
export const assertEnrichment = (raw: unknown): Validated<Enrichment> =>
  gateOrThrow("Enrichment", EnrichmentSchema, raw);
