/**
 * pipeline_core/http.ts — a tiny fetch helper for connectors.
 *
 * Keeps adapters to ~one screen each. No dependency on any SDK; just fetch with
 * a timeout and JSON handling. Framework-free, no cloud imports.
 */

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    public readonly body: string,
  ) {
    super(`HTTP ${status} from ${url}: ${body.slice(0, 300)}`);
    this.name = "HttpError";
  }
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
    if (!res.ok) throw new HttpError(res.status, u.toString(), text);
    return (text ? JSON.parse(text) : {}) as T;
  } finally {
    clearTimeout(timer);
  }
}
