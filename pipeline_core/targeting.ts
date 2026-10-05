/**
 * pipeline_core/targeting.ts — deterministic buyer-title targeting.
 *
 * Pure, zero-I/O, zero-model: given the people a connector found and the buyer
 * titles the operator wants (profile `filtering.contactTitles` or the CLI's
 * `--buyer-titles`), order them so the buyers come first. Used twice:
 *   - by the Apollo connector, BEFORE it spends reveal credits, and
 *   - by runCampaign, BEFORE it slices a lead's contacts to maxContactsPerLead.
 *
 * The LLM never picks who gets drafted; this function does, the same way every
 * run. With no buyer titles it is the identity (same order, new array), so a run
 * without targeting is byte-identical to the pre-targeting engine.
 */

/** Abbreviation → canonical phrase. Applied to BOTH sides, so matching works either way. */
const ABBREVIATIONS: Readonly<Record<string, string>> = {
  ceo: "chief executive officer",
  cto: "chief technology officer",
  coo: "chief operating officer",
  cio: "chief information officer",
  cfo: "chief financial officer",
  cmo: "chief marketing officer",
  cro: "chief revenue officer",
  cpo: "chief product officer",
  ciso: "chief information security officer",
  vp: "vice president",
  svp: "senior vice president",
  evp: "executive vice president",
  avp: "assistant vice president",
  sr: "senior",
  dir: "director",
  mgr: "manager",
  ops: "operations",
  hr: "human resources",
};

/** Phrase-level synonyms, applied after abbreviation expansion. */
const PHRASE_SYNONYMS: readonly [RegExp, string][] = [
  [/\bchief technical officer\b/g, "chief technology officer"],
  [/\bchief operations officer\b/g, "chief operating officer"],
  [/\bvice-president\b/g, "vice president"],
];

/** Words that carry no role signal ("Head of Operations" ≈ "Operations Head"). */
const STOPWORDS = new Set(["of", "the", "and", "for", "a", "an", "to", "in", "at"]);

/**
 * Functions that are clearly not the buyer for an operations/technology offer.
 * A contact whose title carries one of these is pushed below unmatched contacts,
 * unless the operator's own buyer titles name that function (e.g. "VP Sales").
 * Matched against the NORMALIZED title (abbreviations already expanded).
 */
const NON_BUYER_FUNCTIONS: readonly string[] = [
  "human resources",
  "people operations",
  "talent acquisition",
  "recruiting",
  "recruiter",
  "recruitment",
  "sales",
  "marketing",
  "legal",
  "counsel",
  "attorney",
  "paralegal",
];

const SCORE_EXACT = 100;
const SCORE_CONTAINS_BUYER = 80;
const SCORE_INSIDE_BUYER = 60;
const SCORE_ALL_TOKENS = 50;
const PENALTY_NON_BUYER = 50;

/**
 * Lowercase, strip punctuation, expand abbreviations, collapse whitespace.
 *   normalizeTitle("Sr. VP, Ops & IT") === "senior vice president operations and it"
 */
export function normalizeTitle(title: string): string {
  const words = title
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => ABBREVIATIONS[w] ?? w);
  let out = words.join(" ");
  for (const [re, to] of PHRASE_SYNONYMS) out = out.replace(re, to);
  return out;
}

const contentTokens = (s: string) => s.split(" ").filter((w) => w && !STOPWORDS.has(w));

/** Whole-phrase containment on word boundaries (" vice president " in " senior vice president sales "). */
const containsPhrase = (haystack: string, needle: string) =>
  needle.length > 0 && ` ${haystack} `.includes(` ${needle} `);

/** Best match of one normalized contact title against the normalized buyer titles (0 = none). */
function matchScore(title: string, buyers: readonly string[]): number {
  let best = 0;
  const titleTokens = new Set(contentTokens(title));
  for (const b of buyers) {
    let s = 0;
    if (title === b) s = SCORE_EXACT;
    else if (containsPhrase(title, b)) s = SCORE_CONTAINS_BUYER;
    else if (containsPhrase(b, title)) s = SCORE_INSIDE_BUYER;
    else {
      const bt = contentTokens(b);
      if (bt.length > 0 && bt.every((w) => titleTokens.has(w))) s = SCORE_ALL_TOKENS;
    }
    if (s > best) best = s;
  }
  return best;
}

/** True when `title` names a non-buyer function the operator did not ask for. */
function isNonBuyer(title: string, buyers: readonly string[]): boolean {
  return NON_BUYER_FUNCTIONS.some((f) => containsPhrase(title, f) && !buyers.some((b) => containsPhrase(b, f)));
}

/** Score a raw title against already-normalized buyer titles. */
function scoreAgainst(title: string | null | undefined, buyers: readonly string[]): number {
  const t = title ? normalizeTitle(title) : "";
  if (!t) return 0;
  return matchScore(t, buyers) - (isNonBuyer(t, buyers) ? PENALTY_NON_BUYER : 0);
}

const normalizedBuyers = (buyerTitles: readonly string[] | undefined) =>
  cleanBuyerTitles(buyerTitles).map(normalizeTitle).filter(Boolean);

/** Trim, drop empties. Returns [] when nothing usable remains. */
export function cleanBuyerTitles(buyerTitles: readonly string[] | undefined): string[] {
  return (buyerTitles ?? []).map((t) => (typeof t === "string" ? t.trim() : "")).filter((t) => t.length > 0);
}

/**
 * Score one title against the buyer titles: exact (100) > contact title contains
 * a buyer title (80) > contact title inside a buyer title (60) > every word of a
 * buyer title present (50) > no match (0); minus 50 for a non-buyer function.
 * Exported for tests and diagnostics.
 */
export function titleScore(title: string | null | undefined, buyerTitles: readonly string[]): number {
  const buyers = normalizedBuyers(buyerTitles);
  return buyers.length === 0 ? 0 : scoreAgainst(title, buyers);
}

/**
 * Order `contacts` buyers-first. Deterministic and stable: equal scores keep
 * their input order. No (or only blank) buyer titles ⇒ the input order, as a
 * new array. Never drops or mutates a contact.
 */
export function rankContactsByTitle<T extends { title?: string | null | undefined }>(
  contacts: readonly T[],
  buyerTitles: readonly string[] | undefined,
): T[] {
  const buyers = normalizedBuyers(buyerTitles);
  if (buyers.length === 0) return contacts.slice();
  return contacts
    .map((c, i) => ({ c, i, score: scoreAgainst(c.title, buyers) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.c);
}

/**
 * True when a name's last token is a lone initial, optionally dotted
 * ("Kristina L", "Kristina L."): the vendor withheld the surname. Such a
 * contact is kept but addressed by first name only.
 */
export function hasInitialOnlyLastName(name: string): boolean {
  const tokens = name.trim().split(/\s+/);
  if (tokens.length < 2) return false;
  return /^\p{L}\.?$/u.test(tokens[tokens.length - 1]!);
}
