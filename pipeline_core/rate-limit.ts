/**
 * pipeline_core/rate-limit.ts — per-connector request rate limits.
 *
 * A vendor's published limits (e.g. 60 requests/minute and 5,000/day) are
 * enforced on our side before a request leaves, so a run slows down instead of
 * collecting 429s, and stops instead of burning a daily quota.
 *
 *   • perMinute: a token bucket (capacity = perMinute, refilled continuously).
 *     An empty bucket WAITS for the next token (honoring the caller's signal).
 *   • perDay: a rolling 24h count. Exhausted ⇒ RateLimitExceededError (waiting
 *     hours inside a run is never the right answer).
 *
 * Process-local state, keyed by the caller (normally the connector name).
 */

export interface RateLimit {
  perMinute?: number | undefined;
  perDay?: number | undefined;
}

export class RateLimitExceededError extends Error {
  constructor(public readonly key: string, public readonly perDay: number) {
    super(`${key}: daily request limit of ${perDay} reached`);
    this.name = "RateLimitExceededError";
  }
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

interface State {
  tokens: number;
  updatedAt: number;
  day: number[];
}

export class RateLimiter {
  private readonly states = new Map<string, State>();

  constructor(
    private readonly clock: () => number = Date.now,
    private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void> = defaultSleep,
  ) {}

  /** Take one request slot for `key`, waiting for a per-minute token if needed. */
  async acquire(key: string, limit: RateLimit, signal?: AbortSignal): Promise<void> {
    const perMinute = positive(limit.perMinute);
    const perDay = positive(limit.perDay);
    if (perMinute === undefined && perDay === undefined) return;
    let s = this.states.get(key);
    if (!s) {
      s = { tokens: perMinute !== undefined ? Math.max(perMinute, 1) : 0, updatedAt: this.clock(), day: [] };
      this.states.set(key, s);
    }
    for (;;) {
      const now = this.clock();
      if (perDay !== undefined) {
        while (s.day.length > 0 && s.day[0]! <= now - DAY) s.day.shift();
        if (s.day.length >= perDay) throw new RateLimitExceededError(key, perDay);
      }
      if (perMinute === undefined) break;
      // Capacity is at least one token, so a fractional rate (0.5/min = one per 2 min) still refills.
      s.tokens = Math.min(Math.max(perMinute, 1), s.tokens + ((now - s.updatedAt) * perMinute) / MINUTE);
      s.updatedAt = now;
      if (s.tokens >= 1) {
        s.tokens -= 1;
        break;
      }
      await this.sleep(Math.ceil(((1 - s.tokens) * MINUTE) / perMinute), signal);
    }
    if (perDay !== undefined) s.day.push(this.clock());
  }
}

function positive(n: number | undefined): number | undefined {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : undefined;
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error("aborted"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(signal.reason ?? new Error("aborted"));
      },
      { once: true },
    );
  });
}

/** The process-wide limiter httpJson uses. */
export const rateLimiter = new RateLimiter();
