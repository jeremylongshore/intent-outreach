/**
 * pipeline_core/render/headers.ts — header-safety helpers for rendered email drafts.
 *
 * Email-draft headers are built from model output (the drafted subject) and
 * connector data (the contact key).  Neither is trusted, so every header value
 * passes through here before it is written to an .eml file:
 *
 *   - CR/LF (and every other C0 control / DEL) is removed, so a value can never
 *     terminate its header line and smuggle in a new header (`\r\nBcc: ...`).
 *     OWASP A03:2021 Injection — CRLF / email header injection (CWE-93).
 *   - Non-ASCII values are RFC 2047 B-encoded (`=?UTF-8?B?...?=`), split into
 *     encoded-words of at most 75 characters and folded per RFC 5322.
 *   - `To:` is written only for a syntactically valid addr-spec.
 *
 * Pure, zero imports.
 */

/** Max length of one RFC 2047 encoded-word (RFC 2047 §2). */
const ENCODED_WORD_MAX = 75;
const EW_PREFIX = "=?UTF-8?B?";
const EW_SUFFIX = "?=";
/** Raw UTF-8 bytes per encoded-word: base64 payload ≤ 63 chars → 45 bytes (multiple of 3). */
const EW_BYTES = Math.floor((ENCODED_WORD_MAX - EW_PREFIX.length - EW_SUFFIX.length) / 4) * 3;

/**
 * Remove CR, LF, TAB and all other control characters from a header value.
 * Line breaks and tabs become a single space so adjacent words don't fuse.
 */
export function stripHeaderControls(value: string): string {
  return value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim();
}

/**
 * Make an untrusted string safe to use as an email header value:
 * strip controls, then RFC 2047-encode it if it contains any non-ASCII.
 * Long encoded values are split into multiple encoded-words joined by folding
 * whitespace (`\n `), which decoders concatenate back together.
 */
export function encodeHeaderValue(value: string): string {
  const clean = stripHeaderControls(value);
  if (/^[\x20-\x7E]*$/.test(clean)) return clean;

  const words: string[] = [];
  let chunk = "";
  let chunkBytes = 0;
  // Iterate by code point so a multi-byte character is never split across words.
  for (const ch of clean) {
    const n = Buffer.byteLength(ch, "utf8");
    if (chunkBytes + n > EW_BYTES && chunk !== "") {
      words.push(chunk);
      chunk = "";
      chunkBytes = 0;
    }
    chunk += ch;
    chunkBytes += n;
  }
  if (chunk !== "") words.push(chunk);

  return words
    .map((w) => `${EW_PREFIX}${Buffer.from(w, "utf8").toString("base64")}${EW_SUFFIX}`)
    .join("\n ");
}

/**
 * Practical addr-spec check (dot-atom local part @ dotted hostname; no spaces,
 * no quoting, no display names).  Deliberately stricter than RFC 5322: a value
 * that fails is simply not written as a recipient.
 */
const EMAIL_RE =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function isValidEmailAddress(value: string | undefined | null): value is string {
  if (typeof value !== "string") return false;
  if (value.length > 254) return false;
  const at = value.lastIndexOf("@");
  if (at < 1 || at > 64) return false;
  return EMAIL_RE.test(value);
}

/** Note written (as an X- header) when the first contact key is not a usable address. */
export const INVALID_RECIPIENT_NOTE =
  "To omitted: first contact key is not a valid email address; add the recipient manually.";
