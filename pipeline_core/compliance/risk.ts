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

/**
 * Distress signals that send a lead to the manual queue, as word-boundary
 * patterns over a normalized tag (lowercase; hyphens, underscores, dashes and
 * punctuation read as spaces). Stems catch the forms connectors emit:
 * "Probate Court", "divorced", "foreclosures", "NOD".
 */
const MANUAL_REVIEW_PATTERNS: readonly [category: string, pattern: RegExp][] = [
  ["probate", /\bprobat/],
  ["probate", /\bdeceased\b/],
  ["probate", /^estate$/],
  ["probate", /\bestate sale\b/],
  ["divorce", /\bdivorc/],
  ["divorce", /\bdissolution of marriage\b/],
  ["pre-foreclosure", /\bforeclos/],
  ["pre-foreclosure", /\blis pendens\b/],
  ["pre-foreclosure", /\bnotice of (?:default|trustee sale|sale)\b/],
  ["pre-foreclosure", /^nod$/],
  ["pre-foreclosure", /\btax (?:sale|lien sale|deed)\b/],
];

const normalizeTag = (raw: string) =>
  String(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * The manual-review verdict for a lead's distress signals (as connectors tag
 * them). Any matching signal blocks with `manual-review:<category>`; the
 * categories are deduped and sorted so the reason is deterministic.
 */
export function manualReviewVerdict(signals: readonly string[]): ComplianceResult {
  const categories = new Set<string>();
  for (const raw of signals) {
    const tag = normalizeTag(raw);
    for (const [category, pattern] of MANUAL_REVIEW_PATTERNS) if (pattern.test(tag)) categories.add(category);
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
  status: ListingStatus | string;
  /**
   * When the exclusive listing agreement ends: an ISO 8601 date-time with an
   * offset, or a date (YYYY-MM-DD). A bare date means the agreement runs
   * through that whole day in EVERY US time zone, so it is treated as ending at
   * noon UTC the next day.
   */
  agreementEndsAt?: string | undefined;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

/** Epoch ms the agreement ends, or NaN when the value is not a strict ISO date/date-time. */
function agreementEnd(value: string): number {
  if (ISO_DATE.test(value)) {
    const day = Date.parse(`${value}T00:00:00Z`);
    return Number.isNaN(day) || new Date(day).toISOString().slice(0, 10) !== value ? Number.NaN : day + 36 * 3_600_000;
  }
  return ISO_DATETIME.test(value) ? Date.parse(value) : Number.NaN;
}

/**
 * May the owner be contacted, given the listing state? Fail closed:
 *   active / pending / coming-soon            → blocked (listed with another agent)
 *   withdrawn                                  → blocked unless the agreement is known to have ended
 *   expired / cancelled                        → clean, unless the agreement is known to still run
 *   sold / off-market                          → clean (no listing)
 *   unknown status, or an unreadable date      → blocked
 * Status is matched case-insensitively ("Active", "Coming Soon").
 */
export function listingContactVerdict(listing: ListingState, now: Date): ComplianceResult {
  const ends = listing.agreementEndsAt !== undefined ? agreementEnd(listing.agreementEndsAt) : undefined;
  if (ends !== undefined && Number.isNaN(ends)) return { status: "blocked", reason: "listing:agreement-date-invalid" };
  const stillRuns = ends !== undefined && ends > now.getTime();
  const status = normalizeTag(String(listing.status ?? "")).replace(/ /g, "-");
  switch (status) {
    case "active":
    case "pending":
    case "coming-soon":
      return { status: "blocked", reason: `listing:${status}` };
    case "withdrawn":
      return ends !== undefined && !stillRuns ? { status: "clean" } : { status: "blocked", reason: "listing:withdrawn-under-agreement" };
    case "expired":
    case "cancelled":
    case "canceled":
      return stillRuns ? { status: "blocked", reason: "listing:agreement-still-in-effect" } : { status: "clean" };
    case "sold":
    case "off-market":
      return { status: "clean" };
    default:
      return { status: "blocked", reason: "listing:status-unknown" };
  }
}

/**
 * Attribute keys that describe the PERSON's credit, finances, identity or a
 * protected characteristic. Owner age and marital status are stripped too: they
 * are fair-housing inputs, not property facts.
 */
export const FCRA_SENSITIVE_KEY =
  /credit(?![-_ ]?union)|fico|vantage|wealth|financial[-_ ]?score|net[-_ ]?worth|debt|income|salary|wage|bankrupt|judg(?:e)?ment|eviction|repossess|collection|delinquen|garnish|payday|payment[-_ ]?history|assets|ssn|social[-_ ]?security|birth|dob\b|^age$|owner[-_ ]?age|marital|gender|^sex$|race|ethnic|religio|disabilit|children|familial/i;

/**
 * Property-level facts that are public records about the PARCEL, kept even when
 * a word above matches: rental or gross property income, income-producing
 * status, tax delinquency, and recorded mortgage, lien, loan and equity data.
 */
export const PROPERTY_LEVEL_KEY =
  /rent|noi|gross[-_ ]?(?:rent|income|operating)|income[-_ ]?(?:property|producing)|tax|mortgage|lien|loan|equity|ltv/i;

/** True when an attribute key must not reach a prompt. */
export function isFcraSensitiveKey(key: string): boolean {
  return FCRA_SENSITIVE_KEY.test(key) && !PROPERTY_LEVEL_KEY.test(key);
}

/**
 * Drop sensitive keys from an attribute map (recursively, through nested
 * objects and arrays) before it reaches a scoring or drafting prompt. Returns a
 * new object; the stored record is untouched.
 */
export function stripFcraSensitive<T>(attributes: Readonly<Record<string, T>>): Record<string, T> {
  const scrub = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(scrub);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, inner] of Object.entries(v)) if (!isFcraSensitiveKey(k)) out[k] = scrub(inner);
      return out;
    }
    return v;
  };
  return scrub(attributes) as Record<string, T>;
}
