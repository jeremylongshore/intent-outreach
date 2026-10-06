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
  ["probate", /\bestate of\b/],
  ["probate", /\bheirs?\b/],
  ["probate", /\blife estate\b/],
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
 * Attribute keys are judged by their WORDS, not substrings ("currentCreditScore"
 * is current + credit + score, so "rent" inside "current" proves nothing):
 *
 *   • always personal: credit (except "credit union"), fico, vantage, wealth,
 *     worth, salary, wage, bankrupt*, judgment*, eviction*, reposs*, collection*,
 *     garnish*, payday, ssn, dob, birth*, age, marital, gender, sex, race,
 *     ethnic*, religio*, disab*, child*, familial, household, occupation,
 *     education, spouse;
 *   • personal unless the key also names the property context: income (kept
 *     with rent/rental/gross/operating/property/producing/noi), debt (kept with
 *     mortgage/lien/loan), delinquen* (kept with tax), payment (kept with
 *     mortgage/tax/hoa), score (kept only for flood/wind/hurricane), assets
 *     (always personal).
 */
const ALWAYS_PERSONAL = [
  /^credit$/, /^fico$/, /^vantage/, /^wealth/, /^worth$/, /^salar/, /^wages?$/, /^bankrupt/, /^judge?ments?$/,
  /^evict/, /^reposs/, /^collections?$/, /^garnish/, /^payday$/, /^ssn$/, /^dob$/, /^birth/, /^ages?$/, /^marital$/,
  /^gender$/, /^sex$/, /^race$/, /^ethnic/, /^religio/, /^disab/, /^child/, /^familial$/, /^household$/,
  /^occupation$/, /^education$/, /^spouse$/,
];
const CONDITIONAL: readonly [RegExp, RegExp][] = [
  [/^incomes?$/, /^(rent|rental|rents|gross|operating|property|producing|noi)$/],
  [/^debts?$/, /^(mortgage|liens?|loans?)$/],
  [/^delinquen/, /^tax(es)?$/],
  [/^assets?$/, /^$/],
  [/^scores?$/, /^(flood|wind|hurricane)$/],
  [/^payments?$/, /^(mortgage|tax|taxes|hoa)$/],
];

/** Split an attribute key into lowercase words (camelCase, snake_case, kebab-case, spaces). */
export function keyTokens(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** True when an attribute key describes the PERSON (credit, finances, identity, a protected trait). */
export function isFcraSensitiveKey(key: string): boolean {
  const tokens = keyTokens(key);
  const creditUnion = tokens.some((t, i) => t === "credit" && tokens[i + 1] === "union");
  if (tokens.some((t) => ALWAYS_PERSONAL.some((re) => re.test(t))) && !creditUnion) return true;
  for (const [word, context] of CONDITIONAL) {
    if (tokens.some((t) => word.test(t)) && !tokens.some((t) => context.test(t))) return true;
  }
  return false;
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
