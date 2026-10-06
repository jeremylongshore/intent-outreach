/**
 * @intent-outreach/deal-math — pure real estate deal math.
 *
 * Integer cents, basis points, an explicit assumptions object on every call that
 * takes one, and a `{value, inputs, assumptionsUsed, version}` result. zod is the
 * only dependency: no I/O, no clock, no model. Packs run it after scoring and hand
 * the results to the draft step as computed facts, so the LLM never does arithmetic.
 */

export * from "./core.js";
export * from "./income.js";
export * from "./amortize.js";
export * from "./exchange.js";
export * from "./trade-up.js";
