/**
 * pipeline_core/draft-guard.ts — deterministic post-checks on LLM output.
 *
 * The schema (zod) only proves a draft has the right SHAPE. These checks prove
 * it is safe to send under the user's name:
 *
 *   guardDraft()   — no url / email / phone the inputs did not contain (the
 *                    signature of a prompt injection riding in from connector
 *                    data), length caps, single-line subject, banned openers,
 *                    and the operator's optional voice rules (checkVoice).
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

  issues.push(...checkVoice(draft, inputs.voice));

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
  const kept: string[] = [];
  const dropped: DroppedAngle[] = [];

  for (const angle of angles) {
    const reason = ungroundedReason(angle, corpusLower, pool, allow);
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
