/**
 * packages/deal-math/src/core.ts — units, rounding and the result envelope.
 *
 * Money is INTEGER CENTS. Rates are INTEGER BASIS POINTS (1% = 100 bps). Ratios
 * such as DSCR are basis points of 1.0 (1.25x = 12_500). Nothing here uses a
 * float for money except the closed-form amortization payment, which is
 * rounded to the cent (or the documented unit) immediately.
 *
 * Every public function returns a `DealMathResult`: the value plus the exact
 * inputs and assumptions it used and the library version, so a computed figure
 * a draft cites can be traced and reproduced. The model never does arithmetic;
 * it is handed these results as facts.
 */

import { z } from "zod";

export const DEAL_MATH_VERSION = "1.0.0";

export interface DealMathResult<V, I, A> {
  value: V;
  inputs: Readonly<I>;
  assumptionsUsed: Readonly<A>;
  version: string;
}

export function result<V, I, A>(value: V, inputs: I, assumptionsUsed: A): DealMathResult<V, I, A> {
  return Object.freeze({
    value: Object.isFrozen(value) || typeof value !== "object" || value === null ? value : Object.freeze(value),
    inputs: Object.freeze({ ...inputs }),
    assumptionsUsed: Object.freeze({ ...assumptionsUsed }),
    version: DEAL_MATH_VERSION,
  });
}

/** Integer cents (may be negative where a value can be, e.g. cash flow). */
export const Cents = z.number().int().refine(Number.isSafeInteger, "cents must be a safe integer");
export const NonNegCents = Cents.refine((n) => n >= 0, "must be >= 0 cents");
/** Integer basis points, 0..100_000 (0%..1,000%): far past any real rate, short of float overflow. */
export const Bps = z.number().int().min(0).max(100_000);

/**
 * Round `x` to the nearest integer, ties to even (banker's rounding). This is
 * Python's `round()`, which the coastal calculators use, so ported figures
 * match to the cent.
 */
export function roundHalfEven(x: number): number {
  if (!Number.isFinite(x)) throw new Error(`cannot round ${x}`);
  const floor = Math.floor(x);
  const diff = x - floor;
  if (diff > 0.5) return floor + 1;
  if (diff < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

/**
 * Exact integer division rounded half-to-even: round(num / den) with no float
 * error. `den` must be positive. Both operands must be safe integers.
 */
export function divRoundHalfEven(num: number, den: number): number {
  if (!Number.isSafeInteger(num) || !Number.isSafeInteger(den) || den <= 0) {
    throw new Error(`divRoundHalfEven needs safe integers and a positive divisor (got ${num}/${den})`);
  }
  const q = Math.floor(num / den);
  const r = num - q * den; // 0 <= r < den
  if (r * 2 > den) return q + 1;
  if (r * 2 < den) return q;
  return q % 2 === 0 ? q : q + 1;
}

/** Apply a rate in basis points to cents, rounded half-even to the cent. */
export function applyBps(cents: number, bps: number): number {
  return divRoundHalfEven(cents * bps, 10_000);
}

/** Parse with a zod schema and throw a readable error naming the function. */
export function parseOrThrow<T>(fn: string, schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) {
    const issues = r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    throw new Error(`${fn}: invalid input: ${issues}`);
  }
  return r.data;
}
