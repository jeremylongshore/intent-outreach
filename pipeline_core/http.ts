/**
 * pipeline_core/http.ts — a tiny, hardened fetch helper for connectors.
 *
 * Keeps adapters to ~one screen each. No dependency on any SDK; just fetch with
 * a timeout and JSON handling. Framework-free, no cloud imports.
 *
 * Resilience + safety contract (every connector inherits it):
 *   - Retries transient failures (408/429/500/502/503/504 + network errors) with
 *     jittered exponential backoff, honoring Retry-After (capped at 10s). Never
 *     retries 401/403/404/422 (or any other 4xx).
 *   - Redirects are followed manually and only when same-origin (max 3).
 *   - Response bodies are capped at 5 MB (streamed; the request is aborted past it).
 *   - Only https URLs, except loopback (http://localhost / 127.0.0.1 / [::1]).
 *   - Error messages are scrubbed of secret query params (redactUrl) AND of any
 *     literal secret value registered via registerSecretForRedaction() or passed
 *     in the per-call `redact` option.
 */

/** Max bytes read from any response body. */
export const MAX_BODY_BYTES = 5 * 1024 * 1024;
/** Upper bound on any single backoff wait, including a server's Retry-After. */
export const MAX_RETRY_WAIT_MS = 10_000;
const DEFAULT_RETRIES = 2;
const BASE_BACKOFF_MS = 250;
const MAX_REDIRECTS = 3;
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);
/** Values shorter than this are not scrubbed (would mangle ordinary text). */
const MIN_REDACT_LEN = 4;

// ---- secret redaction --------------------------------------------------------

const registeredSecrets = new Set<string>();

/**
 * Register a literal secret value (an API key, a webhook URL) so it is scrubbed
 * from every subsequent HttpError message/body/url. Connectors call this on each
 * value they read via getSecret(). Idempotent; short values are ignored.
 */
export function registerSecretForRedaction(value: string | undefined | null): void {
  if (typeof value === "string" && value.length >= MIN_REDACT_LEN) registeredSecrets.add(value);
}

/** Tests only. */
export function _clearRedactionRegistry(): void {
  registeredSecrets.clear();
}

/** Replace every registered (and extra) secret value in `text` with REDACTED. */
export function scrubSecrets(text: string, extra: readonly string[] = []): string {
  const values = [...registeredSecrets, ...extra.filter((v) => v && v.length >= MIN_REDACT_LEN)]
    // Longest first so a secret that contains another is fully replaced.
    .sort((a, b) => b.length - a.length);
  let out = text;
  for (const v of values) out = out.split(v).join("REDACTED");
  return out;
}

// ---- errors ------------------------------------------------------------------

export class HttpError extends Error {
  /** Server-requested wait before retrying (from Retry-After), when present. */
  public readonly retryAfterMs?: number;

  constructor(
    public readonly status: number,
    /** Pre-REDACTED url (see redactUrl) — never carries a secret. */
    public readonly url: string,
    public readonly body: string,
    opts: { retryAfterMs?: number; redact?: readonly string[] } = {},
  ) {
    const safeUrl = scrubSecrets(url, opts.redact);
    const safeBody = scrubSecrets(body, opts.redact);
    super(`HTTP ${status} from ${safeUrl}: ${safeBody.slice(0, 300)}`);
    this.name = "HttpError";
    this.url = safeUrl;
    this.body = safeBody;
    if (opts.retryAfterMs !== undefined) this.retryAfterMs = opts.retryAfterMs;
  }
}

/** Thrown when a response body exceeds MAX_BODY_BYTES. Not retried. */
export class ResponseTooLargeError extends Error {
  constructor(public readonly url: string, public readonly limit: number) {
    super(`response from ${url} exceeded ${limit} bytes`);
    this.name = "ResponseTooLargeError";
  }
}

/**
 * Query params that carry a BYO key/token. Connectors like Hunter pass the key
 * in the query string; this keeps it out of any error message / stored payload.
 */
const SECRET_PARAMS = new Set([
  "api_key",
  "apikey",
  "key",
  "token",
  "access_token",
  "user_key",
  "auth",
]);

/** A URL safe to put in an error message: secret query params are masked. */
export function redactUrl(raw: string | URL): string {
  let u: URL;
  try {
    u = new URL(raw.toString());
  } catch {
    return "[unparseable url]";
  }
  for (const k of [...u.searchParams.keys()]) {
    if (SECRET_PARAMS.has(k.toLowerCase())) u.searchParams.set(k, "REDACTED");
  }
  return scrubSecrets(`${u.origin}${u.pathname}${u.search}`);
}

// ---- options -----------------------------------------------------------------

export interface HttpOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  /** JSON body (POST). */
  json?: unknown;
  /** Query params appended to the URL. */
  query?: Record<string, string | number | undefined>;
  /** Per-attempt timeout. */
  timeoutMs?: number;
  /**
   * Caller-supplied cancellation (e.g. a per-connector deadline). Combined with
   * the per-attempt timeout; an abort from this signal is never retried.
   */
  signal?: AbortSignal;
  /** Retries on transient failure (default 2 → at most 3 attempts). */
  retries?: number;
  /** Extra literal values to scrub from error messages for this call. */
  redact?: readonly string[];
}

// ---- helpers -----------------------------------------------------------------

function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

function assertAllowedUrl(u: URL): void {
  if (u.protocol === "https:") return;
  if (u.protocol === "http:" && isLoopback(u.hostname)) return;
  throw new Error(
    `refusing non-https URL ${redactUrl(u)} (only https, or http to localhost/127.0.0.1)`,
  );
}

/** Parse a Retry-After header (delta-seconds or HTTP date) → ms, or undefined. */
export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Math.max(0, Math.round(Number(trimmed) * 1000));
  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return undefined;
  return Math.max(0, at - now);
}

function headerOf(res: Response, name: string): string | null {
  const h = (res as { headers?: { get?: (n: string) => string | null } }).headers;
  return typeof h?.get === "function" ? h.get(name) : null;
}

/** Jittered exponential backoff: [0.5, 1.0) × base × 2^attempt. */
function backoffMs(attempt: number): number {
  const ceiling = BASE_BACKOFF_MS * 2 ** attempt;
  return Math.min(MAX_RETRY_WAIT_MS, Math.round(ceiling * (0.5 + Math.random() * 0.5)));
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error("aborted"));
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal?.reason ?? new Error("aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Read the body as text, aborting once it exceeds MAX_BODY_BYTES. */
async function readCapped(res: Response, controller: AbortController, url: string): Promise<string> {
  const declared = Number(headerOf(res, "content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    controller.abort();
    throw new ResponseTooLargeError(url, MAX_BODY_BYTES);
  }
  const body = (res as { body?: ReadableStream<Uint8Array> | null }).body;
  if (!body || typeof body.getReader !== "function") {
    // Minimal Response stand-ins (tests) expose only text(); cap after the fact.
    const text = await res.text();
    if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) throw new ResponseTooLargeError(url, MAX_BODY_BYTES);
    return text;
  }
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      controller.abort();
      await reader.cancel().catch(() => undefined);
      throw new ResponseTooLargeError(url, MAX_BODY_BYTES);
    }
    out += decoder.decode(value, { stream: true });
  }
  return out + decoder.decode();
}

class RetryableNetworkError extends Error {}

// ---- main entry --------------------------------------------------------------

/** Perform an HTTP request and parse JSON. Throws HttpError on non-2xx. */
export async function httpJson<T = unknown>(url: string, opts: HttpOptions = {}): Promise<T> {
  const { query, retries = DEFAULT_RETRIES, signal } = opts;

  const u = new URL(url);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) u.searchParams.set(k, String(v));
    }
  }
  assertAllowedUrl(u);

  for (let attempt = 0; ; attempt++) {
    try {
      return await attemptOnce<T>(u, opts);
    } catch (err) {
      if (signal?.aborted) throw err;
      const retryable =
        (err instanceof HttpError && RETRYABLE_STATUS.has(err.status)) ||
        err instanceof RetryableNetworkError;
      if (!retryable || attempt >= retries) {
        throw err instanceof RetryableNetworkError && err.cause instanceof Error ? err.cause : err;
      }
      const serverWait = err instanceof HttpError ? err.retryAfterMs : undefined;
      const wait = Math.min(MAX_RETRY_WAIT_MS, serverWait ?? backoffMs(attempt));
      await sleep(wait, signal);
    }
  }
}

async function attemptOnce<T>(start: URL, opts: HttpOptions): Promise<T> {
  const { headers = {}, json, timeoutMs = 20_000, signal, redact } = opts;
  let method = opts.method ?? "GET";
  let sendBody = json !== undefined;
  let current = start;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);
  const onOuterAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener("abort", onOuterAbort, { once: true });
  }

  try {
    for (let hop = 0; ; hop++) {
      let res: Response;
      try {
        res = await fetch(current, {
          method,
          headers: {
            Accept: "application/json",
            ...(sendBody ? { "Content-Type": "application/json" } : {}),
            ...headers,
          },
          body: sendBody ? JSON.stringify(json) : undefined,
          redirect: "manual",
          signal: controller.signal,
        });
      } catch (e) {
        // Caller cancellation propagates as-is; timeouts and network faults retry.
        if (signal?.aborted) throw e;
        throw new RetryableNetworkError(`network error calling ${redactUrl(current)}`, { cause: e });
      }

      if (REDIRECT_STATUS.has(res.status)) {
        // Release the redirect's (unused) body so the connection can be reused.
        await (res as { body?: ReadableStream | null }).body?.cancel?.().catch(() => undefined);
        const location = headerOf(res, "location");
        const next = location ? new URL(location, current) : null;
        if (!next || next.origin !== current.origin || hop >= MAX_REDIRECTS) {
          const why = !next
            ? "redirect without Location"
            : next.origin !== current.origin
              ? `cross-origin redirect to ${redactUrl(next)} refused`
              : `more than ${MAX_REDIRECTS} redirects`;
          throw new HttpError(res.status, redactUrl(current), why, { redact });
        }
        if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === "POST")) {
          method = "GET";
          sendBody = false;
        }
        current = next;
        continue;
      }

      const text = await readCapped(res, controller, redactUrl(current));
      if (!res.ok) {
        throw new HttpError(res.status, redactUrl(current), text, {
          retryAfterMs: parseRetryAfter(headerOf(res, "retry-after")),
          redact,
        });
      }
      return (text ? JSON.parse(text) : {}) as T;
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onOuterAbort);
  }
}
