/**
 * packages/deal-math/src/trade-up.ts — the condo → new-construction trade-up model.
 *
 * A port of coastal-realty-ops `src/calculators/trade_up.py` (model:
 * coastal 000-docs/015; ground truth: the 017 worked example). SELL → BUY →
 * DELTA. Inputs are cents; like the Python model, sell costs, the monthly tax
 * share and the financed P&I are rounded to WHOLE DOLLARS (half-even), because
 * the client one-pager never shows cents. A golden fixture generated from the
 * Python calculator pins every figure (tests/fixtures/deal-math/).
 */

import { z } from "zod";
import { levelPayment } from "./amortize.js";
import { Bps, divRoundHalfEven, NonNegCents, parseOrThrow, result, type DealMathResult } from "./core.js";

export const TradeUpInputs = z.object({
  condoValueCents: NonNegCents,
  newHomePriceCents: NonNegCents,
  // SELL side (the condo being exited)
  mortgageBalanceCents: NonNegCents.default(0),
  condoHoaMonthlyCents: NonNegCents.default(0),
  condoInsuranceMonthlyCents: NonNegCents.default(0),
  condoTaxAnnualCents: NonNegCents.default(0),
  /** Amortized active or looming special assessment, monthly. */
  condoAssessmentMonthlyCents: NonNegCents.default(0),
  // BUY side (the new home)
  builderIncentiveCents: NonNegCents.default(0),
  /** Move + buy-side closing, taken off the cash pocketed. */
  buyClosingCostsCents: NonNegCents.default(0),
  newHoaMonthlyCents: NonNegCents.default(0),
  newInsuranceMonthlyCents: NonNegCents.default(0),
  newTaxAnnualCents: NonNegCents.default(0),
});
export const TradeUpAssumptions = z.object({
  /** Commission + seller closing as a share of the condo value (coastal default 750 = 7.5%). */
  sellCostBps: Bps.max(10_000),
  /** Used only when the proceeds do not cover the new home. */
  loanRateBps: Bps,
  loanTermYears: z.number().int().min(1).max(50),
});
export type TradeUpInputs = z.input<typeof TradeUpInputs>;
export type TradeUpAssumptions = z.infer<typeof TradeUpAssumptions>;

/** The coastal model's standard terms, to pass explicitly: 7.5% sell cost, 6.75% / 30 years. */
export const COASTAL_TRADE_UP_ASSUMPTIONS: TradeUpAssumptions = Object.freeze({
  sellCostBps: 750,
  loanRateBps: 675,
  loanTermYears: 30,
});

export interface TradeUpValue {
  netProceedsCents: number;
  sellCostsCents: number;
  condoCarryMonthlyCents: number;
  newHomeNetPriceCents: number;
  cashBuyFeasible: boolean;
  newLoanAmountCents: number;
  newPiMonthlyCents: number;
  newCarryMonthlyCents: number;
  cashPocketedCents: number;
  monthlySavingsCents: number;
  annualSavingsCents: number;
  assessmentRiskEliminatedMonthlyCents: number;
  headline: string;
}

const DOLLAR = 100;
const monthlyTax = (annualCents: number) => divRoundHalfEven(annualCents, 12 * DOLLAR) * DOLLAR;

function money(cents: number): string {
  return `$${(cents / DOLLAR).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function headline(cash: number, monthly: number, annual: number, assessment: number, cashBuy: boolean): string {
  const parts: string[] = [];
  if (cash > 0) parts.push(`${cashBuy ? "Buy your next home for cash and pocket" : "Pocket"} ~${money(cash)}`);
  if (monthly > 0) parts.push(`cut your monthly carry by ~${money(monthly)} (~${money(annual)}/yr)`);
  else if (monthly < 0) parts.push(`add ~${money(-monthly)}/mo in carry`);
  if (assessment > 0) parts.push("eliminate special-assessment risk");
  if (parts.length === 0) return "No material trade-up benefit at these inputs.";
  const text = parts.join(", ");
  return `${text[0]!.toUpperCase()}${text.slice(1)}.`;
}

/** Run SELL → BUY → DELTA and return every figure the one-pager needs. */
export function tradeUp(
  inputs: TradeUpInputs,
  assumptions: TradeUpAssumptions,
): DealMathResult<TradeUpValue, TradeUpInputs, TradeUpAssumptions> {
  const i = parseOrThrow("tradeUp", TradeUpInputs, inputs);
  const a = parseOrThrow("tradeUp", TradeUpAssumptions, assumptions);

  // SELL
  const sellCosts = divRoundHalfEven(i.condoValueCents * a.sellCostBps, 10_000 * DOLLAR) * DOLLAR;
  const netProceeds = i.condoValueCents - i.mortgageBalanceCents - sellCosts;
  const condoCarry =
    i.condoHoaMonthlyCents + i.condoInsuranceMonthlyCents + monthlyTax(i.condoTaxAnnualCents) + i.condoAssessmentMonthlyCents;

  // BUY
  const newHomeNet = i.newHomePriceCents - i.builderIncentiveCents;
  const cashBuy = netProceeds >= newHomeNet;
  const newLoan = cashBuy ? 0 : newHomeNet - netProceeds;
  const newPi = cashBuy ? 0 : levelPayment(newLoan, a.loanRateBps, a.loanTermYears * 12, DOLLAR);
  const cashPocketed = cashBuy ? Math.max(netProceeds - newHomeNet - i.buyClosingCostsCents, 0) : 0;
  const newCarry = i.newHoaMonthlyCents + i.newInsuranceMonthlyCents + monthlyTax(i.newTaxAnnualCents) + newPi;

  // DELTA
  const monthlySavings = condoCarry - newCarry;
  const annualSavings = monthlySavings * 12;

  return result(
    {
      netProceedsCents: netProceeds,
      sellCostsCents: sellCosts,
      condoCarryMonthlyCents: condoCarry,
      newHomeNetPriceCents: newHomeNet,
      cashBuyFeasible: cashBuy,
      newLoanAmountCents: newLoan,
      newPiMonthlyCents: newPi,
      newCarryMonthlyCents: newCarry,
      cashPocketedCents: cashPocketed,
      monthlySavingsCents: monthlySavings,
      annualSavingsCents: annualSavings,
      assessmentRiskEliminatedMonthlyCents: i.condoAssessmentMonthlyCents,
      headline: headline(cashPocketed, monthlySavings, annualSavings, i.condoAssessmentMonthlyCents, cashBuy),
    },
    i,
    a,
  );
}
