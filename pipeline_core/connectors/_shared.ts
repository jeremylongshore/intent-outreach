/**
 * pipeline_core/connectors/_shared.ts — small helpers shared by the adapters.
 *
 *   useSecret()      getSecret() + register the value for error-message redaction.
 *   keepRawOptIn()   INTENT_OUTREACH_KEEP_RAW=1 (read via the secrets layer).
 *   pickAllowed()    PII minimization: keep only an allowlist of B2B fields.
 *   parseVendor()    tolerant zod safeParse → value, or a SchemaFailure.
 */

import type { z } from "zod";
import { registerSecretForRedaction } from "../http.js";
import { getSecret, hasSecret } from "../secrets.js";

/**
 * Several keys per connector with monthly quotas (key-quotas.ts): use this
 * instead of useSecret when a vendor bills per call. Charges `credits` to the
 * chosen key before the call; throws when every key is out of quota.
 */
export { useKey, KeyQuotaExhaustedError } from "../key-quotas.js";

/** Read a secret and register it so it can never appear in an HttpError message. */
export function useSecret(name: string): string {
  const v = getSecret(name);
  registerSecretForRedaction(v);
  return v;
}

const KEEP_RAW_ENV = "INTENT_OUTREACH_KEEP_RAW";
const PUBLIC_RECORDS_ENV = "INTENT_OUTREACH_PUBLIC_RECORDS";

/**
 * Keyless public-records connectors (county and state parcel rolls, FEMA flood
 * zones) are ON by default and turned off with INTENT_OUTREACH_PUBLIC_RECORDS=0.
 * They only ever answer property queries. Off values: 0, false, off, no.
 */
export function publicRecordsEnabled(): boolean {
  return !(hasSecret(PUBLIC_RECORDS_ENV) && /^(0|false|off|no)$/i.test(getSecret(PUBLIC_RECORDS_ENV).trim()));
}

/** True only when the user explicitly opted in to retaining full vendor payloads. */
export function keepRawOptIn(): boolean {
  return hasSecret(KEEP_RAW_ENV) && getSecret(KEEP_RAW_ENV).trim() === "1";
}

/**
 * Return a copy of `record` holding only `allow`ed keys (undefined/null dropped),
 * unless the user opted in to raw retention. Personal emails, personal/mobile
 * phones, home addresses and birth data are never on an allowlist.
 */
export function pickAllowed(
  record: Record<string, unknown> | undefined | null,
  allow: readonly string[],
): Record<string, unknown> {
  if (!record || typeof record !== "object") return {};
  if (keepRawOptIn()) return { ...record };
  const out: Record<string, unknown> = {};
  for (const k of allow) {
    const v = record[k];
    if (v !== undefined && v !== null) out[k] = v;
  }
  return out;
}

/** Thrown by parseVendor; forEachContact records it as a "schema" failure. */
export class SchemaFailure extends Error {
  constructor(public readonly detail: string) {
    super(`vendor response failed schema validation: ${detail}`);
    this.name = "SchemaFailure";
  }
}

/**
 * safeParse a vendor response against a tolerant (.passthrough(), all-optional)
 * schema. On mismatch throw a SchemaFailure carrying only the issue paths — no
 * values — instead of letting a TypeError surface deep inside a .map().
 */
export function parseVendor<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const r = schema.safeParse(value);
  if (r.success) return r.data;
  const detail = r.error.issues
    .slice(0, 3)
    .map((i) => `${i.path.map(String).join(".") || "(root)"}: ${i.code}`)
    .join("; ");
  throw new SchemaFailure(detail);
}
