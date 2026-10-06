/**
 * pipeline_core/compliance/risk.ts — real estate risk gates (pure).
 *
 *   • MANUAL REVIEW: probate, divorce and pre-foreclosure leads are people in a
 *     hard moment, and state law and brokerage policy treat soliciting them
 *     with care (and some states regulate foreclosure-rescue solicitation).
 *     Such a lead is never auto-drafted: it goes to the manual queue with the
 *     reason `manual-review:<signal>`.
 *   • ACTIVE LISTING: a property under an active exclusive listing agreement
 *     belongs to another agent; contacting the owner to solicit the listing is
 *     an ethics violation (NAR Code Article 16). Unknown status blocks.
 *   • FCRA: credit and personal-financial variables never reach scoring or
 *     drafting. Property-level public records (liens on the parcel, tax status)
 *     are not consumer credit, but a consumer's own credit, income, debt or
 *     bankruptcy data is stripped before any prompt sees it.
 *
 * All pure and clock-injected; the data comes from connectors as Facts.
 */

import type { ComplianceResult } from "../packs/types.js";

/** Signals that send a lead to the manual queue instead of drafting. */
export const MANUAL_REVIEW_SIGNALS: Readonly<Record<string, string>> = {
  probate: "probate",
  estate: "probate",
  "estate-sale": "probate",
  "deceased-owner": "probate",
  divorce: "divorce",
  "dissolution-of-marriage": "divorce",
  "pre-foreclosure": "pre-foreclosure",
  preforeclosure: "pre-foreclosure",
  foreclosure: "pre-foreclosure",
  "lis-pendens": "pre-foreclosure",
  "notice-of-default": "pre-foreclosure",
  "notice-of-trustee-sale": "pre-foreclosure",
  "tax-sale": "pre-foreclosure",
};

/**
 * The manual-review verdict for a lead's distress signals (as connectors tag
 * them). Any listed signal blocks with `manual-review:<category>`; the
 * categories are deduped and sorted so the reason is deterministic.
 */
export function manualReviewVerdict(signals: readonly string[]): ComplianceResult {
  const categories = new Set<string>();
  for (const raw of signals) {
    const key = raw.trim().toLowerCase().replace(/[\s_]+/g, "-");
    const category = MANUAL_REVIEW_SIGNALS[key];
    if (category) categories.add(category);
  }
  if (categories.size === 0) return { status: "clean" };
  return { status: "blocked", reason: `manual-review:${[...categories].sort().join(",")}` };
}

export type ListingStatus =
  | "active"
  | "pending"
  | "coming-soon"
  | "withdrawn"
  | "expired"
  | "cancelled"
  | "sold"
  | "off-market"
  | "unknown";

export interface ListingState {
  status: ListingStatus;
  /** When the exclusive listing agreement ends, if known (ISO 8601). */
  agreementEndsAt?: string | undefined;
}

/**
 * May the owner be contacted, given the listing state? Fail closed:
 *   active / pending / coming-soon            → blocked (listed with another agent)
 *   withdrawn                                  → blocked unless the agreement is known to have ended
 *   expired / cancelled                        → clean, unless the agreement is known to still run
 *   sold / off-market                          → clean (no listing)
 *   unknown or a malformed agreement end date  → blocked
 */
export function listingContactVerdict(listing: ListingState, now: Date): ComplianceResult {
  const ends = listing.agreementEndsAt !== undefined ? Date.parse(listing.agreementEndsAt) : undefined;
  if (ends !== undefined && Number.isNaN(ends)) return { status: "blocked", reason: "listing:agreement-date-invalid" };
  const stillRuns = ends !== undefined && ends > now.getTime();
  switch (listing.status) {
    case "active":
    case "pending":
    case "coming-soon":
      return { status: "blocked", reason: `listing:${listing.status}` };
    case "withdrawn":
      return ends !== undefined && !stillRuns ? { status: "clean" } : { status: "blocked", reason: "listing:withdrawn-under-agreement" };
    case "expired":
    case "cancelled":
      return stillRuns ? { status: "blocked", reason: "listing:agreement-still-in-effect" } : { status: "clean" };
    case "sold":
    case "off-market":
      return { status: "clean" };
    default:
      return { status: "blocked", reason: "listing:status-unknown" };
  }
}

/** Attribute keys that look like consumer credit or personal-financial data (FCRA). */
export const FCRA_SENSITIVE_KEY = /credit|fico|score[-_ ]?band|income|salary|wage|debt|bankrupt|net[-_ ]?worth|collections?|delinquen|garnish|payday/i;

/**
 * Drop FCRA-sensitive keys from an attribute map before it reaches a scoring
 * or drafting prompt. Returns a new object; the stored record is untouched.
 */
export function stripFcraSensitive<T>(attributes: Readonly<Record<string, T>>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(attributes)) {
    if (!FCRA_SENSITIVE_KEY.test(k)) out[k] = v;
  }
  return out;
}
