/**
 * pipeline_core/connectors/_domain.ts — normalize vendor-supplied domains.
 *
 * Vendors return a company's site in many shapes ("https://www.Acme.com/about",
 * "acme.com:443", "WWW.ACME.COM"). Lead.domain is a natural key (dedupe, enrich
 * subjectKey), so every connector that takes a domain from a vendor field runs it
 * through normalizeDomain first. Pure; no imports.
 */

/**
 * Lowercase, strip scheme, credentials, leading "www.", path/query/fragment, port,
 * and a trailing dot. Returns undefined for empty / unusable input.
 */
export function normalizeDomain(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  let s = input.trim().toLowerCase();
  if (!s) return undefined;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // scheme
  s = s.split(/[/?#]/, 1)[0] ?? ""; // path, query, fragment
  s = s.replace(/^[^@]*@/, ""); // userinfo
  s = s.replace(/:\d*$/, ""); // port
  s = s.replace(/\.$/, ""); // trailing dot
  s = s.replace(/^www\./, "");
  if (!s || !s.includes(".") || /\s/.test(s)) return undefined;
  return s;
}
