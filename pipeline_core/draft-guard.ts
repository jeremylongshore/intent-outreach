/**
 * pipeline_core/draft-guard.ts — deterministic post-checks on LLM output.
 *
 * The schema (zod) only proves a draft has the right SHAPE. These checks prove
 * it is safe to send under the user's name:
 *
 *   guardDraft()   — no url / email / phone the inputs did not contain (the
 *                    signature of a prompt injection riding in from connector
 *                    data), length caps, single-line subject, banned openers,
 *                    the operator's optional voice rules (checkVoice), and
 *                    (given the fact text) no quantity pinned to a rate or
 *                    time period the inputs never state (checkQuantities).
 *   groundAngles() — drop score-seam angles that cite a fact (money, round,
 *                    percentage, headcount, proper name) absent from the inputs.
 *
 * Pure: no I/O, no clock, no model. The caller supplies the allowlisted input
 * text (seam.ts builds it from explicit normalized fields — never raw payloads).
 */

/** Hard caps. The prompt asks for ≤90 words; the margin absorbs honest overshoot. */
export const MAX_BODY_WORDS = 120;
export const MAX_SUBJECT_WORDS = 10;

/** Stock openers that read as spam (matched case-insensitively, apostrophes normalized). */
export const BANNED_PHRASES = [
  "quick question",
  "i hope this email finds you well",
  "hope this email finds you well",
  "i hope this finds you well",
  "hope you're doing well",
  "hope you are doing well",
  "i hope you're doing well",
  "i hope you are doing well",
] as const;

export interface DraftLike {
  subject: string | null;
  body: string;
  cta: string;
}

/**
 * A pack's deterministic draft rule (Pack v2 `draftRules`): returns the issues
 * it finds, [] when the draft passes. A rule that THROWS fails the draft
 * (fail closed) with a "draft-rule-error" issue.
 */
export type DraftRule = (draft: Readonly<DraftLike>) => readonly string[];

export interface GuardInputs {
  /**
   * Strings whose urls / email addresses / phone numbers a draft may repeat.
   * Pass STRUCTURED identifier fields (lead domain, contact email/linkedin,
   * verified email/phone) and the user's own text (ICP/offer, profile) only.
   * Never free-text third-party fields like a company description: that is
   * exactly where an injected "book at evil.io" would come from, and including
   * it would let the injection legitimize itself.
   */
  allowedText: string[];
  /**
   * Operator voice rules (Report Profile `voice`). Optional: absent ⇒ the guard
   * behaves exactly as it did before voice rules existed.
   */
  voice?: VoiceRules | undefined;
  /**
   * The full allowlisted FACT text (lead description, enrichment web titles,
   * grounded angles, the user's own text) — never raw `_raw`/`data` payloads.
   * When present, a quantity the draft pins to a rate or time period ("40
   * acquisitions a year", "40% since 2019") must appear in these facts with a
   * compatible qualifier (checkQuantities). Absent ⇒ the check is skipped.
   */
  facts?: readonly string[] | undefined;
  /** Pack draft rules, run after the built-in checks. Absent ⇒ none. */
  rules?: readonly DraftRule[] | undefined;
}

export type GuardResult = { ok: true } | { ok: false; issues: string[] };

// ─────────────────────────── extraction helpers ────────────────────────────

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'`)\]]+/gi;
// Bare host (+ optional path): "calendly.com/x", "evil.io". Common TLDs only, so
// ordinary prose ("e.g.", "Series A.") never matches.
const BARE_HOST_RE =
  /\b(?:[a-z0-9-]+\.)+(?:com|io|ai|co|net|org|app|dev|xyz|me|so|gg|ly|link|info|biz|us|uk|tech|site|online|page|to|sh|cc)\b(?:\/[^\s<>"'`)\]]*)?/gi;
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/g;

function normApostrophes(s: string): string {
  return s.replace(/[‘’ʼ]/g, "'");
}

function trimTrailingPunct(s: string): string {
  return s.replace(/[.,;:!?]+$/, "");
}

export function extractEmails(text: string): string[] {
  return (text.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase());
}

/** Normalized url-ish tokens: lowercase host, no scheme, no "www.", no trailing slash/punct. */
export function extractUrls(text: string): string[] {
  const withoutEmails = text.replace(EMAIL_RE, " ");
  const found = new Set<string>();
  for (const m of withoutEmails.match(URL_RE) ?? []) found.add(normalizeUrl(m));
  // Bare hosts, skipping ones already covered by a full url match.
  const withoutUrls = withoutEmails.replace(URL_RE, " ");
  for (const m of withoutUrls.match(BARE_HOST_RE) ?? []) found.add(normalizeUrl(m));
  found.delete("");
  return [...found];
}

export function normalizeUrl(raw: string): string {
  let s = trimTrailingPunct(raw.trim());
  s = s.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  const slash = s.indexOf("/");
  const host = (slash === -1 ? s : s.slice(0, slash)).toLowerCase();
  const path = slash === -1 ? "" : s.slice(slash).replace(/\/+$/, "");
  return host + path;
}

function hostOf(normalizedUrl: string): string {
  const slash = normalizedUrl.indexOf("/");
  return slash === -1 ? normalizedUrl : normalizedUrl.slice(0, slash);
}

/** Phone-like digit runs (10–15 digits), returned as their last 10 digits. */
export function extractPhones(text: string): string[] {
  const out: string[] = [];
  for (const m of text.match(PHONE_RE) ?? []) {
    const digits = m.replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 15) out.push(digits.slice(-10));
  }
  return out;
}

function wordCount(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

// ────────────────────────────── the allowlist ──────────────────────────────

interface Allowlist {
  emails: Set<string>;
  urls: Set<string>;
  hosts: Set<string>;
  phones: Set<string>;
}

function buildAllowlist(allowedText: string[]): Allowlist {
  const emails = new Set<string>();
  const urls = new Set<string>();
  const hosts = new Set<string>();
  const phones = new Set<string>();
  for (const t of allowedText) {
    if (!t) continue;
    for (const e of extractEmails(t)) {
      emails.add(e);
      hosts.add(e.slice(e.indexOf("@") + 1));
    }
    for (const u of extractUrls(t)) {
      urls.add(u);
      hosts.add(hostOf(u));
    }
    for (const p of extractPhones(t)) phones.add(p);
  }
  return { emails, urls, hosts, phones };
}

// ─────────────────────────────── guardDraft ────────────────────────────────

/**
 * Deterministic send-safety check for one drafted message. Returns every issue
 * found (not just the first) so the audit trail explains the whole rejection.
 */
export function guardDraft(draft: DraftLike, inputs: GuardInputs): GuardResult {
  const issues: string[] = [];
  const allow = buildAllowlist(inputs.allowedText);
  const fields: [string, string][] = [
    ["subject", draft.subject ?? ""],
    ["body", draft.body],
    ["cta", draft.cta],
  ];

  for (const [field, text] of fields) {
    for (const e of new Set(extractEmails(text))) {
      if (!allow.emails.has(e)) issues.push(`${field}: email address not present in inputs (${e})`);
    }
    for (const u of new Set(extractUrls(text))) {
      // A full url must appear in the inputs verbatim; a bare host is fine when
      // the inputs mention that host (e.g. the lead's own domain).
      const hasPath = u.includes("/");
      const ok = allow.urls.has(u) || (!hasPath && allow.hosts.has(u));
      if (!ok) issues.push(`${field}: url not present in inputs (${u})`);
    }
    for (const p of new Set(extractPhones(text))) {
      if (!allow.phones.has(p)) issues.push(`${field}: phone number not present in inputs`);
    }
  }

  const bodyWords = wordCount(draft.body);
  if (bodyWords > MAX_BODY_WORDS) issues.push(`body: ${bodyWords} words exceeds the ${MAX_BODY_WORDS}-word cap`);

  if (draft.subject !== null) {
    if (/[\r\n]/.test(draft.subject)) issues.push("subject: contains a line break (header injection risk)");
    const subjectWords = wordCount(draft.subject);
    if (subjectWords > MAX_SUBJECT_WORDS) {
      issues.push(`subject: ${subjectWords} words exceeds the ${MAX_SUBJECT_WORDS}-word cap`);
    }
    if (/^\s*(?:re|fwd?|fw)\s*:/i.test(draft.subject)) issues.push('subject: fake reply/forward prefix ("Re:"/"Fwd:")');
  }

  for (const [field, text] of fields) {
    const lower = normApostrophes(text).toLowerCase();
    for (const phrase of BANNED_PHRASES) {
      if (lower.includes(phrase)) {
        issues.push(`${field}: banned stock phrase ("${phrase}")`);
        break;
      }
    }
  }
  if (/^\s*(?:re|fwd?)\s*:/i.test(draft.body)) issues.push('body: fake reply prefix ("Re:")');

  if (inputs.facts) issues.push(...checkQuantities([draft.subject ?? "", draft.body, draft.cta], inputs.facts));

  issues.push(...checkVoice(draft, inputs.voice));

  for (const rule of inputs.rules ?? []) {
    try {
      issues.push(...rule(draft));
    } catch (err) {
      issues.push(`draft-rule-error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

// ──────────────────────────────── voice rules ───────────────────────────────

/**
 * Operator-configured voice rules (Report Profile `voice`), checked on top of
 * the send-safety guard. Structural so this module stays import-free.
 */
export interface VoiceRules {
  /** Reject em/en dashes (and their HTML entities) and hyphens used as dashes. */
  banDashes?: boolean | undefined;
  /** Phrases a draft must never contain. Case-insensitive, whole-word, exact phrase. */
  deniedPhrases?: readonly string[] | undefined;
  /** Free-text guidance; reaches the model via styleOverride, never checked here. */
  notes?: string | undefined;
}

/**
 * Dash forms the voice ban rejects, in report order. Hyphenated words
 * ("follow-up", "B2B-only") are untouched: a single hyphen with a non-space
 * character on both sides is a hyphen, not a dash.
 */
const DASH_RULES: readonly { label: string; re: RegExp }[] = [
  { label: "em dash", re: /—|&mdash;|&#8212;|&#x2014;/i },
  { label: "en dash", re: /–|&ndash;|&#8211;|&#x2013;/i },
  // " - " or " -- " between two non-space characters on the same line. Horizontal
  // whitespace only, so a markdown bullet at a line start ("\n- item") is not a dash.
  { label: "spaced hyphen used as a dash", re: /(?<=\S)[ \t ]+-{1,2}[ \t ]+(?=\S)/ },
  // The ASCII em dash: "word--word".
  { label: "double hyphen used as a dash", re: /(?<=[\p{L}\p{N}])--(?=[\p{L}\p{N}])/u },
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whole-word, case-insensitive matcher for one denied phrase. Exact-phrase
 * semantics: "delve" matches "Delve" and "delve," but NOT "delved" or "delves"
 * (list inflections explicitly). Internal whitespace matches any whitespace
 * run; curly apostrophes are normalized on both sides.
 */
function phraseMatcher(phrase: string): RegExp | undefined {
  const norm = normApostrophes(phrase).trim().replace(/\s+/g, " ");
  if (!norm) return undefined;
  const body = norm.split(" ").map(escapeRegExp).join("\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}_])${body}(?![\\p{L}\\p{N}_])`, "iu");
}

/**
 * Pure voice check. Returns one issue per (rule, field) hit, e.g.
 * `voice: em dash (body)` or `voice: banned phrase "delve" (subject)`.
 * No rules ⇒ always [].
 */
export function checkVoice(draft: DraftLike, voice: VoiceRules | undefined): string[] {
  if (!voice) return [];
  const issues: string[] = [];
  const fields: [string, string][] = [
    ["subject", draft.subject ?? ""],
    ["body", draft.body],
    ["cta", draft.cta],
  ];
  if (voice.banDashes) {
    for (const { label, re } of DASH_RULES) {
      for (const [field, text] of fields) {
        if (re.test(text)) issues.push(`voice: ${label} (${field})`);
      }
    }
  }
  for (const phrase of voice.deniedPhrases ?? []) {
    const re = phraseMatcher(phrase);
    if (!re) continue;
    for (const [field, text] of fields) {
      if (re.test(normApostrophes(text))) issues.push(`voice: banned phrase "${phrase.trim()}" (${field})`);
    }
  }
  return issues;
}

/** Max denied phrases listed in the draft prompt; the guard still enforces the full list. */
export const VOICE_PROMPT_PHRASE_CAP = 25;

/**
 * The one-line voice instruction for the draft prompt, or undefined when there
 * is nothing enforceable to say (no voice, or notes only: notes travel in the
 * styleOverride).
 */
export function voicePromptLine(voice: VoiceRules | undefined): string | undefined {
  if (!voice) return undefined;
  const parts: string[] = [];
  if (voice.banDashes) {
    parts.push('no em or en dashes and no hyphen used as a dash (" - "); use a period, comma, colon or parentheses');
  }
  const phrases = (voice.deniedPhrases ?? []).map((p) => p.trim()).filter(Boolean);
  if (phrases.length > 0) {
    const shown = phrases.slice(0, VOICE_PROMPT_PHRASE_CAP).map((p) => `"${p}"`);
    const more = phrases.length > shown.length ? ` (and ${phrases.length - shown.length} more)` : "";
    parts.push(`avoid these phrases: ${shown.join(", ")}${more}`);
  }
  return parts.length > 0 ? `Voice rules: ${parts.join("; ")}.` : undefined;
}

// ────────────────────────────── groundAngles ───────────────────────────────

export interface DroppedAngle {
  angle: string;
  reason: string;
}

const MONEY_RE =
  /(?:[$€£]\s?\d[\d,]*(?:\.\d+)?\s*(?:k|m|mm|b|bn|thousand|million|billion)?\b)|(?:\b\d[\d,]*(?:\.\d+)?\s*(?:million|billion|mm|bn)\b)/gi;
const PERCENT_RE = /\b\d+(?:\.\d+)?\s*(?:%|percent\b)/gi;
const ROUND_RE = /\b(?:pre-seed|seed|series\s+[a-h])\b\+?/gi;
const HEADCOUNT_RE =
  /\b(\d[\d,]*)\+?\s*(?:employees|people|staff|engineers|reps|salespeople|team members|headcount|hires)\b/gi;
const PROPER_RE = /\b[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)*(?:\s+[A-Z][a-z0-9]+)*\b/g;

/** Capitalized words that are not names (sentence starters, months, common nouns in angles). */
const PROPER_STOPWORDS = new Set(
  [
    "a an the this that these those it its they their there here we our you your i he she his her",
    "just recently recent new now likely probably possibly may might could would should will can",
    "raised raising hiring hired scaling growing launched launching announced expanding building",
    "series seed round funding company team teams sales marketing engineering product customers",
    "and or but so if when while with without for from to of in on at by as after before since",
    "january february march april may june july august september october november december",
    "monday tuesday wednesday thursday friday saturday sunday",
    "b2b b2c saas ceo cto cfo coo cro vp head director founder founders cofounder",
    "north south east west american european us uk eu",
  ]
    .join(" ")
    .split(/\s+/),
);

function moneyValue(raw: string): number | undefined {
  const m = raw.replace(/[$€£,\s]/g, "").toLowerCase().match(/^(\d+(?:\.\d+)?)(k|m|mm|b|bn|thousand|million|billion)?$/);
  if (!m) return undefined;
  const n = Number(m[1]);
  const mult: Record<string, number> = {
    k: 1e3,
    thousand: 1e3,
    m: 1e6,
    mm: 1e6,
    million: 1e6,
    b: 1e9,
    bn: 1e9,
    billion: 1e9,
  };
  return n * (m[2] ? mult[m[2]]! : 1);
}

function numbersIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.match(MONEY_RE) ?? []) {
    const v = moneyValue(m);
    if (v !== undefined) out.push(v);
  }
  for (const m of text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []) {
    const v = Number(m.replace(/,/g, ""));
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}

function approxPresent(value: number, pool: number[]): boolean {
  return pool.some((p) => p === value || (p > 0 && Math.abs(p - value) / p <= 0.1));
}

/**
 * Keep only angles whose specific facts all appear in the allowlisted inputs.
 * Checks money amounts, funding rounds, percentages, headcounts and proper
 * names (investors, customers) against `facts` (all allowlisted text, free text
 * included), and urls / emails / phones against `identifiers` (same rule as
 * GuardInputs.allowedText). Generic angles with no specific fact pass.
 */
export function groundAngles(
  angles: readonly string[],
  inputs: { facts: string[]; identifiers: string[] },
): { kept: string[]; dropped: DroppedAngle[] } {
  const corpus = inputs.facts.filter(Boolean).join("\n");
  const corpusLower = corpus.toLowerCase();
  const pool = numbersIn(corpus);
  const allow = buildAllowlist(inputs.identifiers);
  const quantities = quantityFactSet(inputs.facts);
  const kept: string[] = [];
  const dropped: DroppedAngle[] = [];

  for (const angle of angles) {
    // Angles feed the draft guard's fact text, so a distorted rate must not survive here either.
    const reason = ungroundedReason(angle, corpusLower, pool, allow) ?? quantityIssuesIn(angle, quantities)[0];
    if (reason) dropped.push({ angle, reason });
    else kept.push(angle);
  }
  return { kept, dropped };
}

function ungroundedReason(angle: string, corpusLower: string, pool: number[], allow: Allowlist): string | undefined {
  for (const m of angle.match(MONEY_RE) ?? []) {
    const v = moneyValue(m);
    if (v === undefined || !approxPresent(v, pool)) return `money amount not in inputs (${m.trim()})`;
  }
  for (const m of angle.match(PERCENT_RE) ?? []) {
    const n = Number(m.replace(/[^\d.]/g, ""));
    // Inputs may hold a fraction (0.28) for a percentage (28%).
    if (!approxPresent(n, pool) && !approxPresent(n / 100, pool)) return `percentage not in inputs (${m.trim()})`;
  }
  for (const m of angle.match(ROUND_RE) ?? []) {
    const flat = (x: string) => x.toLowerCase().replace(/[\s-]+/g, " ").replace(/\+$/, "");
    if (!flat(corpusLower).includes(flat(m))) return `funding round not in inputs (${m.trim()})`;
  }
  for (const m of angle.matchAll(HEADCOUNT_RE)) {
    const n = Number(m[1]!.replace(/,/g, ""));
    if (!pool.includes(n)) return `headcount not in inputs (${m[0].trim()})`;
  }
  for (const e of extractEmails(angle)) {
    if (!allow.emails.has(e)) return `email address not in inputs (${e})`;
  }
  for (const u of extractUrls(angle)) {
    if (!allow.urls.has(u) && !(u.indexOf("/") === -1 && allow.hosts.has(u))) return `url not in inputs (${u})`;
  }
  for (const p of extractPhones(angle)) {
    if (!allow.phones.has(p)) return "phone number not in inputs";
  }
  // Proper names: capitalized words not at the very start, not stopwords, not in the inputs.
  const words = angle.match(PROPER_RE) ?? [];
  const startsWith = angle.trimStart();
  for (const phrase of words) {
    for (const word of phrase.split(/\s+/)) {
      const lower = word.toLowerCase();
      if (PROPER_STOPWORDS.has(lower)) continue;
      if (startsWith.startsWith(word) && phrase === words[0]) continue; // sentence-initial
      if (word.length < 3) continue;
      if (/^[A-Z0-9]+$/.test(word)) continue; // acronyms (GTM, AI) carry no named fact
      if (!corpusLower.includes(lower)) return `name not in inputs (${word})`;
    }
  }
  return undefined;
}

// ──────────────────────────── quantity qualifiers ───────────────────────────
//
// A number the inputs state as a total ("40 acquisitions") must not come back
// as a rate ("40 acquisitions a year") or pinned to a period it never had
// ("40% since 2019"): the number and the noun both appear in the inputs, so
// the other grounding checks pass it, yet the claim is false. The rule:
//
//   when a draft attaches a RATE or TIME qualifier within 4 words after a
//   quantity, the inputs must state that same number with a compatible
//   qualifier (same unit class: "a year" = "per year" = "annually").
//
// Bare numbers are left alone (the other checks own those). The draft side is
// strict about what counts as attached (same clause, at most 4 words between,
// no other number between); the input side is lenient (either side of the
// number, up to 6 tokens, commas allowed, plus adjectives like "annual" and
// "ARR"), because a lenient input side can only miss a distortion, never
// reject an honest draft.

type TokKind = "num" | "word" | "stop" | "soft";
interface Tok {
  kind: TokKind;
  lower: string;
  start: number;
  end: number;
}

// number (grouping, decimals, attached % or k/m/mm/b/bn) | word | hard stop | soft stop
const TOKEN_RE =
  /([$€£]?\d+(?:,\d{3})*(?:\.\d+)?(?:\s?%|(?:k|mm|m|bn|b)(?![\p{L}\p{N}]))?)|(\p{L}+(?:['’-]\p{L}+)*)|([.;!?|\n])|([,:()])/giu;

function tokenize(text: string): Tok[] {
  const out: Tok[] = [];
  for (const m of text.matchAll(TOKEN_RE)) {
    const kind: TokKind = m[1] ? "num" : m[2] ? "word" : m[3] ? "stop" : "soft";
    out.push({ kind, lower: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length });
  }
  return out;
}

const SPELLED_ONES: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};
const SPELLED_TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};
const MULTIPLIER_WORDS: Record<string, number> = { percent: 1, thousand: 1e3, million: 1e6, billion: 1e9 };
const SUFFIX_MULT: Record<string, number> = { k: 1e3, m: 1e6, mm: 1e6, b: 1e9, bn: 1e9 };

/** "forty" → 40, "forty-two" → 42 (one through ninety-nine; "one hundred" is handled by the caller). */
function spelledValue(word: string): number | undefined {
  if (word in SPELLED_ONES) return SPELLED_ONES[word];
  if (word in SPELLED_TENS) return SPELLED_TENS[word];
  const [tens, ones, extra] = word.split("-");
  if (extra === undefined && tens && ones && tens in SPELLED_TENS && (SPELLED_ONES[ones] ?? 10) < 10) {
    return SPELLED_TENS[tens]! + SPELLED_ONES[ones]!;
  }
  return undefined;
}

interface Quantity {
  value: number;
  first: number;
  last: number;
}

/** Parse a quantity at token i: digits, or a spelled number one through one hundred, plus an optional multiplier word. */
function quantityAt(toks: Tok[], i: number): Quantity | undefined {
  const t = toks[i];
  if (!t) return undefined;
  const next = toks[i + 1];
  let value: number;
  let last = i;
  if (t.kind === "num") {
    const m = t.lower.replace(/[$€£,%\s]/g, "").match(/^(\d+(?:\.\d+)?)(k|mm|m|bn|b)?$/);
    if (!m) return undefined;
    value = Number(m[1]) * (m[2] ? SUFFIX_MULT[m[2]]! : 1);
  } else if (t.kind === "word") {
    if ((t.lower === "a" || t.lower === "one") && next?.kind === "word" && next.lower === "hundred") {
      value = 100;
      last = i + 1;
    } else {
      const v = spelledValue(t.lower);
      if (v === undefined) return undefined;
      value = v;
      // "forty two" (space-separated compound)
      if (v >= 20 && v % 10 === 0 && next?.kind === "word" && (SPELLED_ONES[next.lower] ?? 10) < 10) {
        value += SPELLED_ONES[next.lower]!;
        last = i + 1;
      }
    }
  } else {
    return undefined;
  }
  const mult = toks[last + 1];
  if (mult?.kind === "word" && mult.lower in MULTIPLIER_WORDS) {
    value *= MULTIPLIER_WORDS[mult.lower]!;
    last += 1;
  }
  return { value, first: i, last };
}

interface Qualifier {
  /** Compatibility key: "rate:year", "last:3:year", "since:2019". */
  key: string;
  kind: "rate" | "time period";
  first: number;
  last: number;
}

const RATE_UNITS: Record<string, string> = {
  year: "year",
  month: "month",
  week: "week",
  day: "day",
  quarter: "quarter",
};
const RATE_ADVERBS: Record<string, string> = {
  annually: "year",
  yearly: "year",
  monthly: "month",
  weekly: "week",
  daily: "day",
  quarterly: "quarter",
};
/** Input side only: words that state the same rate ("$40M annual revenue", "$40M ARR"). */
const INPUT_RATE_WORDS: Record<string, string> = {
  annual: "year",
  annualized: "year",
  annualised: "year",
  arr: "year",
  mrr: "month",
};
/** "a year ago" / "a day later" are time anchors, not rates. */
const ANCHOR_AFTER = new Set(["ago", "later", "earlier", "before", "after", "old", "older"]);
const PERIOD_UNITS: Record<string, string> = {
  year: "year",
  years: "year",
  month: "month",
  months: "month",
  week: "week",
  weeks: "week",
  day: "day",
  days: "day",
};

function qualifierAt(toks: Tok[], j: number, lenient: boolean): Qualifier | undefined {
  const w = (k: number): string | undefined => (toks[k]?.kind === "word" ? toks[k]!.lower : undefined);
  const a = w(j);
  if (a === undefined) return undefined;
  const b = w(j + 1);

  if (a in RATE_ADVERBS) return { key: `rate:${RATE_ADVERBS[a]}`, kind: "rate", first: j, last: j };
  if (lenient && a in INPUT_RATE_WORDS) return { key: `rate:${INPUT_RATE_WORDS[a]}`, kind: "rate", first: j, last: j };
  if ((a === "per" || a === "each" || a === "every") && b !== undefined && b in RATE_UNITS) {
    return { key: `rate:${RATE_UNITS[b]}`, kind: "rate", first: j, last: j + 1 };
  }
  if (a === "per" && b === "annum") return { key: "rate:year", kind: "rate", first: j, last: j + 1 };
  // "a year" — not "a quarter" ("a quarter of" is a fraction), not an anchor ("a year ago").
  if (a === "a" && b !== undefined && b in RATE_UNITS && b !== "quarter" && !ANCHOR_AFTER.has(w(j + 2) ?? "")) {
    return { key: `rate:${RATE_UNITS[b]}`, kind: "rate", first: j, last: j + 1 };
  }
  if (a === "since") {
    const y = toks[j + 1];
    if (y?.kind === "num" && /^(?:19|20)\d{2}$/.test(y.lower)) {
      return { key: `since:${y.lower}`, kind: "time period", first: j, last: j + 1 };
    }
  }
  // "(in|over|during|within) (the) (last|past) N years"
  let k = j;
  if (a === "in" || a === "over" || a === "during" || a === "within") k++;
  if (w(k) === "the") k++;
  if (w(k) === "last" || w(k) === "past") {
    const q = quantityAt(toks, k + 1);
    const unit = q ? w(q.last + 1) : undefined;
    if (q && unit !== undefined && unit in PERIOD_UNITS) {
      return { key: `last:${q.value}:${PERIOD_UNITS[unit]}`, kind: "time period", first: j, last: q.last + 1 };
    }
  }
  return undefined;
}

interface QuantityScan {
  toks: Tok[];
  quantities: Quantity[];
  qualifiers: Qualifier[];
}

/** Every qualifier, then every quantity outside one (the 2019 in "since 2019" is not a quantity). */
function scanQuantities(text: string, lenient: boolean): QuantityScan {
  const toks = tokenize(text);
  const qualifiers: Qualifier[] = [];
  const covered = new Set<number>();
  for (let j = 0; j < toks.length; j++) {
    const q = qualifierAt(toks, j, lenient);
    if (!q) continue;
    qualifiers.push(q);
    for (let k = q.first; k <= q.last; k++) covered.add(k);
    j = q.last;
  }
  const quantities: Quantity[] = [];
  for (let i = 0; i < toks.length; i++) {
    if (covered.has(i)) continue;
    const q = quantityAt(toks, i);
    if (!q) continue;
    quantities.push(q);
    i = q.last;
  }
  return { toks, quantities, qualifiers };
}

const valueKey = (v: number): string => String(Math.round(v * 1e6) / 1e6);

/** Input-side token window around a number in which a qualifier counts as stated. */
const INPUT_QUALIFIER_WINDOW = 6;

/** Every "number|qualifier" pairing the inputs state. Lenient by design (see the section comment). */
function quantityFactSet(facts: readonly string[]): Set<string> {
  const set = new Set<string>();
  for (const text of facts) {
    if (!text) continue;
    const { toks, quantities, qualifiers } = scanQuantities(text, true);
    const clear = (from: number, to: number): boolean => {
      for (let k = from; k <= to; k++) if (toks[k]!.kind === "stop") return false;
      return true;
    };
    for (const q of quantities) {
      for (const ql of qualifiers) {
        const after = ql.first > q.last && ql.first - q.last - 1 <= INPUT_QUALIFIER_WINDOW && clear(q.last + 1, ql.first - 1);
        const before = ql.last < q.first && q.first - ql.last - 1 <= INPUT_QUALIFIER_WINDOW && clear(ql.last + 1, q.first - 1);
        if (after || before) set.add(`${valueKey(q.value)}|${ql.key}`);
      }
    }
  }
  return set;
}

/** Max words between a draft's quantity and its qualifier ("40 new acquisitions closed a year" has 3). */
export const QUANTITY_QUALIFIER_WINDOW = 4;

function quantityIssuesIn(text: string, factSet: Set<string>): string[] {
  const issues: string[] = [];
  const { toks, quantities, qualifiers } = scanQuantities(text, false);
  const quantityStarts = new Set(quantities.map((q) => q.first));
  for (const q of quantities) {
    const ql = qualifiers.find((x) => x.first > q.last);
    if (!ql || ql.first - q.last - 1 > QUANTITY_QUALIFIER_WINDOW) continue;
    let attached = true;
    for (let k = q.last + 1; k < ql.first; k++) {
      // Same clause only, and no other number between ("40 deals and 12 hires a year" pins only the 12).
      if (toks[k]!.kind !== "word" || quantityStarts.has(k)) attached = false;
    }
    if (!attached || factSet.has(`${valueKey(q.value)}|${ql.key}`)) continue;
    const claim = text.slice(toks[q.first]!.start, toks[ql.last]!.end).replace(/\s+/g, " ");
    const label = text.slice(toks[ql.first]!.start, toks[ql.last]!.end).replace(/\s+/g, " ");
    issues.push(`claim: "${claim}" adds a ${ql.kind} ("${label}") the inputs do not state`);
  }
  return issues;
}

/**
 * Distorted-quantity check. For each text (a draft field, or an angle) returns
 * one issue per quantity carrying a rate or time qualifier that the inputs do
 * not state for that same number, e.g.
 * `claim: "40 acquisitions a year" adds a rate ("a year") the inputs do not state`.
 * `facts` is the full allowlisted fact text (lead description, web titles,
 * grounded angles, the user's own text) — never raw provider payloads.
 */
export function checkQuantities(texts: readonly string[], facts: readonly string[]): string[] {
  const factSet = quantityFactSet(facts);
  const issues: string[] = [];
  for (const t of texts) if (t) issues.push(...quantityIssuesIn(t, factSet));
  return [...new Set(issues)];
}

/** The draft-prompt line that states the rule checkQuantities enforces. */
export const QUANTITY_PROMPT_LINE = "Quote numbers exactly as the data states them; never add a rate or time period.";
