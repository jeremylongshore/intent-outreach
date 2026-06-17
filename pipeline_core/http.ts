/**
 * pipeline_core/http.ts — a tiny fetch helper for connectors.
 *
 * Keeps adapters to ~one screen each. No dependency on any SDK; just fetch with
 * a timeout and JSON handling. Framework-free, no cloud imports.
 */

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    /** Pre-REDACTED url (see redactUrl) — never carries a secret. */
    public readonly url: string,
    public readonly body: string,
  ) {
    super(`HTTP ${status} from ${url}: ${body.slice(0, 300)}`);
    this.name = "HttpError";
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
  return `${u.origin}${u.pathname}${u.search}`;
}

export interface HttpOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  /** JSON body (POST). */
  json?: unknown;
  /** Query params appended to the URL. */
  query?: Record<string, string | number | undefined>;
  timeoutMs?: number;
}

/** Perform an HTTP request and parse JSON. Throws HttpError on non-2xx. */
export async function httpJson<T = unknown>(url: string, opts: HttpOptions = {}): Promise<T> {
  const { method = "GET", headers = {}, json, query, timeoutMs = 20_000 } = opts;

  const u = new URL(url);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) u.searchParams.set(k, String(v));
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(u, {
      method,
      headers: {
        Accept: "application/json",
        ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new HttpError(res.status, redactUrl(u), text);
    return (text ? JSON.parse(text) : {}) as T;
  } finally {
    clearTimeout(timer);
  }
}
