/**
 * pipeline_core/compliance/suppression.ts — the suppression (opt-out) gate.
 *
 * An opt-out is the one B2B stop that CAN-SPAM makes mandatory: once someone
 * says "unsubscribe", no further commercial email may go to them. This module
 * holds the PURE check. Loading the list from `suppressions.jsonl` is I/O and
 * lives in ../suppressions.ts; the gate only evaluates a list it is handed.
 *
 * Design invariants (same as ./index.ts — do not weaken):
 *   • FAIL-CLOSED. A contact email that cannot be normalized is BLOCKED
 *     ("suppression:malformed-email"), never treated as clean — when a list
 *     exists we must be able to prove the address is not on it.
 *   • PURE. No I/O, no clock, no model. Same list + same contact ⇒ same verdict.
 *   • BACKWARDS-COMPATIBLE. An empty list blocks nothing (and inspects nothing),
 *     so a user with no suppressions gets exactly the pre-suppression behavior.
 *
 * Matching is case-insensitive. A suppressed DOMAIN also covers its subdomains
 * (suppressing acme.com blocks jane@mail.acme.com and lead eu.acme.com).
 *
 * PHONE (E.164) and MAILING-ADDRESS entries exist for the non-email channels: an
 * SMS "STOP" or a "take me off your mailing list" must be honored on every later
 * run, whatever channel that run drafts for. Each kind is only inspected when the
 * list holds at least one entry of that kind, so a B2B email user with no phone
 * suppressions never has a contact blocked over a messy vendor phone string.
 */

import { normalizePhone } from "./index.js";
import type { ComplianceContext, ComplianceGate, ComplianceResult } from "../packs/types.js";

export type SuppressionKind = "email" | "domain" | "phone" | "address";
export const SUPPRESSION_KINDS: readonly SuppressionKind[] = ["email", "domain", "phone", "address"];

/** One persisted suppression record (a line of suppressions.jsonl). */
export interface SuppressionEntry {
  kind: SuppressionKind;
  /** Normalized value: lowercase email, bare lowercase domain, E.164 phone, or normalized mailing address. */
  value: string;
  /** ISO-8601 instant the suppression was added. */
  addedAt: string;
  reason?: string;
}

/** The in-memory form the gate checks against (normalized, O(1) lookups). */
export interface SuppressionList {
  readonly emails: ReadonlySet<string>;
  readonly domains: ReadonlySet<string>;
  readonly phones: ReadonlySet<string>;
  readonly addresses: ReadonlySet<string>;
}

export const EMPTY_SUPPRESSION_LIST: SuppressionList = Object.freeze({
  emails: new Set<string>(),
  domains: new Set<string>(),
  phones: new Set<string>(),
  addresses: new Set<string>(),
});

// Deliberately strict: one "@", no whitespace, a dotted domain part.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LABEL_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const TLD_RE = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

/**
 * Canonical bare domain: lowercase, scheme/path/port/trailing dot/leading
 * `www.` stripped. Throws on anything that is not a dotted hostname.
 */
export function normalizeSuppressionDomain(input: string): string {
  if (typeof input !== "string" || !input.trim()) throw new Error("domain is empty");
  let host = input.trim().toLowerCase();
  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // scheme
  host = host.replace(/^[^@/]*@/, ""); // userinfo
  host = host.split(/[/?#]/)[0] ?? "";
  host = host.replace(/:\d+$/, "").replace(/\.$/, "");
  const labels = host.split(".");
  if (labels[0] === "www" && labels.length > 2) labels.shift();
  const tld = labels[labels.length - 1] ?? "";
  if (labels.length < 2 || !labels.every((l) => LABEL_RE.test(l)) || !TLD_RE.test(tld)) {
    throw new Error(`${JSON.stringify(input)} is not a valid domain`);
  }
  return labels.join(".");
}

/** Canonical email: trimmed + lowercased, domain part normalized. Throws if malformed. */
export function normalizeSuppressionEmail(input: string): string {
  if (typeof input !== "string") throw new Error("email must be a string");
  const e = input.trim().toLowerCase();
  if (!EMAIL_RE.test(e)) throw new Error(`${JSON.stringify(input)} is not a valid email`);
  const at = e.lastIndexOf("@");
  return `${e.slice(0, at)}@${normalizeSuppressionDomain(e.slice(at + 1))}`;
}

/** Canonical E.164 phone (the same normalizer the DNC scrub uses). Throws if malformed. */
export function normalizeSuppressionPhone(input: string): string {
  return normalizePhone(input);
}

// USPS Publication 28 abbreviations for the tokens that vary most between data
// sources. Not a full CASS standardization: the goal is that the same mailbox
// typed two common ways produces the same key.
const ADDRESS_ABBREVIATIONS: Readonly<Record<string, string>> = {
  STREET: "ST", AVENUE: "AVE", ROAD: "RD", DRIVE: "DR", BOULEVARD: "BLVD", LANE: "LN",
  COURT: "CT", CIRCLE: "CIR", PLACE: "PL", PARKWAY: "PKWY", HIGHWAY: "HWY", TERRACE: "TER",
  TRAIL: "TRL", WAY: "WAY", SQUARE: "SQ", POINT: "PT", COVE: "CV", LOOP: "LOOP",
  NORTH: "N", SOUTH: "S", EAST: "E", WEST: "W",
  NORTHEAST: "NE", NORTHWEST: "NW", SOUTHEAST: "SE", SOUTHWEST: "SW",
  APARTMENT: "APT", SUITE: "STE", UNIT: "UNIT", BUILDING: "BLDG", FLOOR: "FL",
};
const ZIP_TAIL_RE = /\b(\d{5})(?:-\d{4})?$/;

/**
 * Canonical mailing address: uppercase, punctuation dropped, whitespace
 * collapsed, common street/direction/unit words abbreviated, "P.O. Box" → "PO
 * BOX", ZIP+4 trimmed to ZIP5. Requires a trailing 5-digit ZIP and a street
 * part, so a bare city or a fragment can never become a suppression key that
 * fails to match the real mailbox. Throws if malformed.
 */
export function normalizeMailingAddress(input: string): string {
  if (typeof input !== "string" || !input.trim()) throw new Error("address is empty");
  let a = input.toUpperCase().replace(/#/g, " UNIT ");
  a = a.replace(/\bP\.?\s*O\.?\s*BOX\b/g, "PO BOX");
  a = a.replace(/[.,;]/g, " ").replace(/\s+/g, " ").trim();
  const zip = ZIP_TAIL_RE.exec(a);
  if (!zip) throw new Error(`${JSON.stringify(input)} has no trailing 5-digit ZIP`);
  const head = a.slice(0, zip.index).trim();
  const tokens = head.split(" ").filter(Boolean).map((t) => ADDRESS_ABBREVIATIONS[t] ?? t);
  if (tokens.length < 3 || !/\d/.test(tokens.join(" "))) {
    throw new Error(`${JSON.stringify(input)} is not a full mailing address (street, city, state, ZIP)`);
  }
  return `${tokens.join(" ")} ${zip[1]}`;
}

function normalizeByKind(kind: SuppressionKind, value: string): string {
  switch (kind) {
    case "email":
      return normalizeSuppressionEmail(value);
    case "domain":
      return normalizeSuppressionDomain(value);
    case "phone":
      return normalizeSuppressionPhone(value);
    case "address":
      return normalizeMailingAddress(value);
    default:
      throw new Error(`unknown suppression kind ${JSON.stringify(kind as unknown)}`);
  }
}

/** Normalize `value` as `kind`. Throws on an unknown kind or a malformed value. */
export function normalizeSuppression(kind: SuppressionKind, value: string): string {
  return normalizeByKind(kind, value);
}

const PHONE_SHAPE_RE = /^\+?[\d\s\-.()]{7,}$/;

/**
 * Classify + normalize a user-supplied suppression value. With an explicit
 * `kind` the value is normalized as that kind. Otherwise: "@" ⇒ email; only
 * digits and phone punctuation ⇒ phone; contains a space ⇒ mailing address;
 * else ⇒ domain.
 */
export function parseSuppressionValue(
  input: string,
  kind?: SuppressionKind,
): { kind: SuppressionKind; value: string } {
  const raw = typeof input === "string" ? input.trim() : "";
  if (kind !== undefined) return { kind, value: normalizeByKind(kind, raw) };
  if (raw.includes("@")) return { kind: "email", value: normalizeSuppressionEmail(raw) };
  if (PHONE_SHAPE_RE.test(raw)) return { kind: "phone", value: normalizeSuppressionPhone(raw) };
  if (/\s/.test(raw)) return { kind: "address", value: normalizeMailingAddress(raw) };
  return { kind: "domain", value: normalizeSuppressionDomain(raw) };
}

/**
 * Build the lookup form from entries. Entries are re-normalized; an entry that
 * cannot be normalized is a hard error (a corrupt opt-out list must surface,
 * not be silently skipped — skipping it could contact someone who opted out).
 */
export function buildSuppressionList(entries: Iterable<Pick<SuppressionEntry, "kind" | "value">>): SuppressionList {
  const sets: Record<SuppressionKind, Set<string>> = {
    email: new Set(),
    domain: new Set(),
    phone: new Set(),
    address: new Set(),
  };
  for (const e of entries) {
    const set = sets[e.kind];
    if (!set) throw new Error(`unknown suppression kind ${JSON.stringify((e as { kind: unknown }).kind)}`);
    set.add(normalizeByKind(e.kind, e.value));
  }
  return { emails: sets.email, domains: sets.domain, phones: sets.phone, addresses: sets.address };
}

function isEmptyList(list: SuppressionList): boolean {
  return list.emails.size + list.domains.size + list.phones.size + list.addresses.size === 0;
}

function domainSuppressed(list: SuppressionList, domain: string): boolean {
  const labels = domain.split(".");
  // acme.com, then every parent suffix with ≥2 labels: eu.acme.com → acme.com.
  for (let i = 0; i <= labels.length - 2; i++) {
    if (list.domains.has(labels.slice(i).join("."))) return true;
  }
  return false;
}

/**
 * The identifiers of one contact to check. `phones` and `addresses` are every
 * phone number and mailing address known for the person, from any channel: an
 * opt-out by phone blocks an email draft to the same person too.
 */
export interface SuppressionSubject {
  email?: string;
  domains: readonly string[];
  phones?: readonly string[];
  addresses?: readonly string[];
}

/** Pure verdict for one contact against a list. */
export function checkSuppression(list: SuppressionList, subject: SuppressionSubject): ComplianceResult {
  if (isEmptyList(list)) return { status: "clean" };

  if (subject.email !== undefined) {
    let email: string;
    try {
      email = normalizeSuppressionEmail(subject.email);
    } catch {
      return { status: "blocked", reason: "suppression:malformed-email" };
    }
    if (list.emails.has(email)) return { status: "blocked", reason: "suppressed:email" };
    if (domainSuppressed(list, email.slice(email.lastIndexOf("@") + 1))) {
      return { status: "blocked", reason: "suppressed:domain" };
    }
  }

  for (const d of subject.domains) {
    let domain: string;
    try {
      domain = normalizeSuppressionDomain(d);
    } catch {
      return { status: "blocked", reason: "suppression:malformed-domain" };
    }
    if (domainSuppressed(list, domain)) return { status: "blocked", reason: "suppressed:domain" };
  }

  if (list.phones.size > 0) {
    for (const p of subject.phones ?? []) {
      let phone: string;
      try {
        phone = normalizeSuppressionPhone(p);
      } catch {
        return { status: "blocked", reason: "suppression:malformed-phone" };
      }
      if (list.phones.has(phone)) return { status: "blocked", reason: "suppressed:phone" };
    }
  }

  if (list.addresses.size > 0) {
    for (const a of subject.addresses ?? []) {
      let address: string;
      try {
        address = normalizeMailingAddress(a);
      } catch {
        return { status: "blocked", reason: "suppression:malformed-address" };
      }
      if (list.addresses.has(address)) return { status: "blocked", reason: "suppressed:address" };
    }
  }
  return { status: "clean" };
}

/**
 * A ComplianceGate that blocks a contact whose email, lead domain, or any
 * enrichment phone is suppressed. Compose it with a pack's own gate via
 * `composeGates`. Mailing addresses have no typed field on today's records
 * (they arrive with the schema v6 ContactPoint), so address entries are
 * enforced through `checkSuppression` by callers that hold one.
 */
export function suppressionGate(list: SuppressionList): ComplianceGate {
  return {
    check: (ctx: ComplianceContext) =>
      checkSuppression(list, {
        ...(ctx.contact.email !== undefined ? { email: ctx.contact.email } : {}),
        domains: [ctx.lead.domain, ctx.contact.leadDomain],
        phones: ctx.enrichments.flatMap((e) => (e.phone !== undefined ? [e.phone] : [])),
      }),
  };
}

/**
 * Run gates in order; the first non-clean verdict wins. Fail-closed: a gate
 * returning anything but exactly `{ status: "clean" }` is passed through as-is,
 * so the engine's own fail-closed handling still sees it.
 */
export function composeGates(...gates: ComplianceGate[]): ComplianceGate {
  return {
    check(ctx: ComplianceContext): ComplianceResult {
      for (const gate of gates) {
        const verdict = gate.check(ctx);
        if (!verdict || verdict.status !== "clean") return verdict;
      }
      return { status: "clean" };
    },
  };
}
