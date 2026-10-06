/**
 * packages/deal-math/src/income.ts — income-property metrics.
 *
 * NOI, cap rate, DSCR and cash-on-cash. All annual. Ratios come back in basis
 * points (cap rate 6.25% = 625; DSCR 1.25x = 12_500), rounded half-even.
 */

import { z } from "zod";
import { applyBps, Bps, Cents, divRoundHalfEven, NonNegCents, parseOrThrow, result, type DealMathResult } from "./core.js";

export const NoiInputs = z.object({
  /** Annual gross scheduled rent at full occupancy. */
  grossScheduledRentCents: NonNegCents,
  /** Annual other income (laundry, parking, fees). */
  otherIncomeCents: NonNegCents.default(0),
  /** Annual operating expenses (taxes, insurance, repairs, management, reserves). Excludes debt service. */
  operatingExpensesCents: NonNegCents,
});
export const NoiAssumptions = z.object({
  /** Vacancy and credit loss, applied to gross scheduled rent. */
  vacancyBps: Bps.max(10_000),
});
export type NoiInputs = z.input<typeof NoiInputs>;
export type NoiAssumptions = z.infer<typeof NoiAssumptions>;

export interface NoiValue {
  effectiveGrossIncomeCents: number;
  vacancyLossCents: number;
  noiCents: number;
}

/** Net operating income = gross rent − vacancy + other income − operating expenses. */
export function noi(inputs: NoiInputs, assumptions: NoiAssumptions): DealMathResult<NoiValue, NoiInputs, NoiAssumptions> {
  const i = parseOrThrow("noi", NoiInputs, inputs);
  const a = parseOrThrow("noi", NoiAssumptions, assumptions);
  const vacancyLossCents = applyBps(i.grossScheduledRentCents, a.vacancyBps);
  const effectiveGrossIncomeCents = i.grossScheduledRentCents - vacancyLossCents + i.otherIncomeCents;
  return result(
    { effectiveGrossIncomeCents, vacancyLossCents, noiCents: effectiveGrossIncomeCents - i.operatingExpensesCents },
    i,
    a,
  );
}

const PositiveCents = Cents.refine((n) => n > 0, "must be > 0 cents");

export const CapRateInputs = z.object({ noiCents: Cents, priceCents: PositiveCents });
export type CapRateInputs = z.infer<typeof CapRateInputs>;

/** Cap rate (bps) = NOI / price. */
export function capRate(inputs: CapRateInputs): DealMathResult<number, CapRateInputs, Record<string, never>> {
  const i = parseOrThrow("capRate", CapRateInputs, inputs);
  return result(divRoundHalfEven(i.noiCents * 10_000, i.priceCents), i, {});
}

export const DscrInputs = z.object({ noiCents: Cents, annualDebtServiceCents: PositiveCents });
export type DscrInputs = z.infer<typeof DscrInputs>;

/** Debt service coverage ratio, in bps of 1.0 (1.25x = 12_500) = NOI / annual debt service. */
export function dscr(inputs: DscrInputs): DealMathResult<number, DscrInputs, Record<string, never>> {
  const i = parseOrThrow("dscr", DscrInputs, inputs);
  return result(divRoundHalfEven(i.noiCents * 10_000, i.annualDebtServiceCents), i, {});
}

export const CashOnCashInputs = z.object({
  /** Annual pre-tax cash flow = NOI − annual debt service. */
  annualPreTaxCashFlowCents: Cents,
  /** Down payment + closing costs + initial repairs. */
  totalCashInvestedCents: PositiveCents,
});
export type CashOnCashInputs = z.infer<typeof CashOnCashInputs>;

/** Cash-on-cash return (bps) = annual pre-tax cash flow / total cash invested. */
export function cashOnCash(inputs: CashOnCashInputs): DealMathResult<number, CashOnCashInputs, Record<string, never>> {
  const i = parseOrThrow("cashOnCash", CashOnCashInputs, inputs);
  return result(divRoundHalfEven(i.annualPreTaxCashFlowCents * 10_000, i.totalCashInvestedCents), i, {});
}
