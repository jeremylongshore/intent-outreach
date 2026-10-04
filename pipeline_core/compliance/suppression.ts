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
 */

import type { ComplianceContext, ComplianceGate, ComplianceResult } from "../packs/types.js";

export type SuppressionKind = "email" | "domain";

/** One persisted suppression record (a line of suppressions.jsonl). */
export interface SuppressionEntry {
  kind: SuppressionKind;
  /** Normalized value: lowercase email, or bare lowercase domain. */
  value: string;
  /** ISO-8601 instant the suppression was added. */
  addedAt: string;
  reason?: string;
}

/** The in-memory form the gate checks against (normalized, O(1) lookups). */
export interface SuppressionList {
  readonly emails: ReadonlySet<string>;
  readonly domains: ReadonlySet<string>;
}

export const EMPTY_SUPPRESSION_LIST: SuppressionList = Object.freeze({
  emails: new Set<string>(),
  domains: new Set<string>(),
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

/** Classify + normalize a user-supplied suppression value ("@" ⇒ email, else domain). */
export function parseSuppressionValue(input: string): { kind: SuppressionKind; value: string } {
  const raw = typeof input === "string" ? input.trim() : "";
  return raw.includes("@")
    ? { kind: "email", value: normalizeSuppressionEmail(raw) }
    : { kind: "domain", value: normalizeSuppressionDomain(raw) };
}

/**
 * Build the lookup form from entries. Entries are re-normalized; an entry that
 * cannot be normalized is a hard error (a corrupt opt-out list must surface,
 * not be silently skipped — skipping it could contact someone who opted out).
 */
export function buildSuppressionList(entries: Iterable<Pick<SuppressionEntry, "kind" | "value">>): SuppressionList {
  const emails = new Set<string>();
  const domains = new Set<string>();
  for (const e of entries) {
    if (e.kind === "email") emails.add(normalizeSuppressionEmail(e.value));
    else if (e.kind === "domain") domains.add(normalizeSuppressionDomain(e.value));
    else throw new Error(`unknown suppression kind ${JSON.stringify((e as { kind: unknown }).kind)}`);
  }
  return { emails, domains };
}

function domainSuppressed(list: SuppressionList, domain: string): boolean {
  const labels = domain.split(".");
  // acme.com, then every parent suffix with ≥2 labels: eu.acme.com → acme.com.
  for (let i = 0; i <= labels.length - 2; i++) {
    if (list.domains.has(labels.slice(i).join("."))) return true;
  }
  return false;
}

/** Pure verdict for one contact against a list. */
export function checkSuppression(
  list: SuppressionList,
  subject: { email?: string; domains: readonly string[] },
): ComplianceResult {
  if (list.emails.size === 0 && list.domains.size === 0) return { status: "clean" };

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
  return { status: "clean" };
}

/**
 * A ComplianceGate that blocks a contact whose email, or whose lead's domain,
 * is suppressed. Compose it with a pack's own gate via `composeGates`.
 */
export function suppressionGate(list: SuppressionList): ComplianceGate {
  return {
    check: (ctx: ComplianceContext) =>
      checkSuppression(list, {
        ...(ctx.contact.email !== undefined ? { email: ctx.contact.email } : {}),
        domains: [ctx.lead.domain, ctx.contact.leadDomain],
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
