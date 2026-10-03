/**
 * pipeline_core/connectors/_per-item.ts — per-contact loop with partial results.
 *
 * Enrich connectors look contacts up one at a time. Before this helper, one bad
 * contact (a 404, a malformed body) threw out of the loop and discarded every
 * earlier, already-paid-for result. forEachContact isolates each item:
 *
 *   - 404 / 422                    → "no data for this contact" (empty, not a failure)
 *   - 401 / 403                    → rethrown immediately (bad key; stop spending)
 *   - anything else                → recorded as a per-item failure; loop continues
 *   - every attempted item failed  → rethrow the last error (the call as a whole failed)
 *
 * It also stops wasting paid lookups on contacts that cannot match: names that
 * are "(unknown)" or a single token are skipped before any request (opt out with
 * requireFullName:false for email-keyed lookups, where the name is irrelevant).
 */

import { HttpError } from "../http.js";
import { SchemaFailure } from "./_shared.js";
import type { Contact } from "../models.js";
import type { ConnectorItemFailure } from "./types.js";

export interface PerItemOptions {
  /** Skip "(unknown)" / single-token names (default true — name-keyed lookups). */
  requireFullName?: boolean;
  /** Extra eligibility predicate (e.g. "has an email" / "lacks an email"). */
  filter?: (c: Contact) => boolean;
}

export interface PerItemResult<T> {
  results: T[];
  failures: ConnectorItemFailure[];
}

/** True when the name has at least two tokens and isn't the "(unknown)" placeholder. */
export function hasFullName(c: Contact): boolean {
  const name = (c.name ?? "").trim();
  if (!name || name === "(unknown)") return false;
  return name.split(/\s+/).length >= 2;
}

/** The contacts a connector should actually spend a lookup on, capped. */
export function eligibleContacts(
  contacts: readonly Contact[],
  cap: number,
  opts: PerItemOptions = {},
): Contact[] {
  const { requireFullName = true, filter } = opts;
  return contacts
    .filter((c) => (filter ? filter(c) : true))
    .filter((c) => (requireFullName ? hasFullName(c) : true))
    .slice(0, cap);
}

/** 404/422 = the vendor has no record — an empty result, not an error. */
export function isNotFound(err: unknown): boolean {
  return err instanceof HttpError && (err.status === 404 || err.status === 422);
}

/** 401/403 = credential problem — abort the whole connector call. */
export function isAuthFailure(err: unknown): boolean {
  return err instanceof HttpError && (err.status === 401 || err.status === 403);
}

/** Sanitized failure record for an error (no URL, no body, no PII). */
export function toFailure(item: number, err: unknown): ConnectorItemFailure {
  if (err instanceof SchemaFailure) return { item, reason: "schema", detail: err.detail };
  if (err instanceof HttpError) return { item, reason: "http", status: err.status };
  return { item, reason: "error" };
}

export async function forEachContact<T>(
  contacts: readonly Contact[],
  cap: number,
  fn: (c: Contact, index: number) => Promise<T | null | undefined>,
  opts: PerItemOptions = {},
): Promise<PerItemResult<T>> {
  const items = eligibleContacts(contacts, cap, opts);
  const results: T[] = [];
  const failures: ConnectorItemFailure[] = [];
  let lastErr: unknown;

  for (let i = 0; i < items.length; i++) {
    try {
      const r = await fn(items[i]!, i);
      if (r !== null && r !== undefined) results.push(r);
    } catch (err) {
      if (isAuthFailure(err)) throw err;
      if (isNotFound(err)) continue;
      failures.push(toFailure(i, err));
      lastErr = err;
    }
  }

  if (items.length > 0 && failures.length === items.length) throw lastErr;
  return { results, failures };
}
