/**
 * packages/deal-math/src/amortize.ts — fixed-rate amortization and seller financing.
 */

import { z } from "zod";
import { Bps, divRoundHalfEven, NonNegCents, parseOrThrow, result, roundHalfEven, type DealMathResult } from "./core.js";

export const PaymentInputs = z.object({
  principalCents: NonNegCents,
  annualRateBps: Bps,
  termMonths: z.number().int().min(1).max(600),
});
export type PaymentInputs = z.infer<typeof PaymentInputs>;

/** Closed-form level payment in cents for a principal in `unitCents` units (1 = cent, 100 = dollar). */
export function levelPayment(principalCents: number, annualRateBps: number, termMonths: number, unitCents = 1): number {
  if (principalCents <= 0) return 0;
  const principal = principalCents / unitCents;
  if (annualRateBps <= 0) return roundHalfEven(principal / termMonths) * unitCents;
  const monthlyRate = annualRateBps / 10_000 / 12;
  const growth = (1 + monthlyRate) ** termMonths;
  return roundHalfEven((principal * monthlyRate * growth) / (growth - 1)) * unitCents;
}

/** Monthly principal + interest payment for a fixed-rate, fully amortizing loan, in cents. */
export function monthlyPayment(inputs: PaymentInputs): DealMathResult<number, PaymentInputs, Record<string, never>> {
  const i = parseOrThrow("monthlyPayment", PaymentInputs, inputs);
  return result(levelPayment(i.principalCents, i.annualRateBps, i.termMonths), i, {});
}

export const SellerFinanceInputs = z
  .object({
    priceCents: NonNegCents,
    downPaymentCents: NonNegCents,
    /** Return the month-by-month schedule too (it can be hundreds of rows). */
    includeSchedule: z.boolean().default(false),
  })
  .refine((i) => i.downPaymentCents <= i.priceCents, { message: "down payment exceeds price", path: ["downPaymentCents"] });
export const SellerFinanceAssumptions = z
  .object({
    annualRateBps: Bps,
    /** Months the payment is computed over (e.g. 360 for a 30-year schedule). */
    amortizationMonths: z.number().int().min(1).max(600),
    /** Month the remaining balance comes due as a balloon; absent = fully amortizing. */
    balloonMonth: z.number().int().min(1).max(600).optional(),
  })
  .refine((a) => a.balloonMonth === undefined || a.balloonMonth <= a.amortizationMonths, {
    message: "balloon month is after the amortization term",
    path: ["balloonMonth"],
  });
export type SellerFinanceInputs = z.input<typeof SellerFinanceInputs>;
export type SellerFinanceAssumptions = z.infer<typeof SellerFinanceAssumptions>;

export interface ScheduleRow {
  month: number;
  paymentCents: number;
  interestCents: number;
  principalCents: number;
  balanceCents: number;
}

export interface SellerFinanceValue {
  loanAmountCents: number;
  monthlyPaymentCents: number;
  /** Regular payments made before payoff or the balloon. */
  paymentsMade: number;
  totalInterestCents: number;
  /** Balance due at the balloon month; 0 when fully amortizing. */
  balloonCents: number;
  schedule?: ScheduleRow[];
}

/**
 * Seller-financed note: loan = price − down payment, a level payment over the
 * amortization term, interest accrued monthly on the running balance (rounded
 * half-even to the cent each month), the last regular payment trimmed so the
 * balance lands on exactly 0, and an optional balloon.
 */
export function sellerFinance(
  inputs: SellerFinanceInputs,
  assumptions: SellerFinanceAssumptions,
): DealMathResult<SellerFinanceValue, SellerFinanceInputs, SellerFinanceAssumptions> {
  const i = parseOrThrow("sellerFinance", SellerFinanceInputs, inputs);
  const a = parseOrThrow("sellerFinance", SellerFinanceAssumptions, assumptions);
  const loan = i.priceCents - i.downPaymentCents;
  const payment = levelPayment(loan, a.annualRateBps, a.amortizationMonths);
  const lastMonth = a.balloonMonth ?? a.amortizationMonths;
  const schedule: ScheduleRow[] = [];
  let balance = loan;
  let totalInterest = 0;
  let month = 0;
  while (balance > 0 && month < lastMonth) {
    month += 1;
    const interest = divRoundHalfEven(balance * a.annualRateBps, 120_000);
    // The final scheduled payment absorbs the rounding drift so the note pays off exactly.
    const due = month === a.amortizationMonths ? balance + interest : Math.min(payment, balance + interest);
    const principal = due - interest;
    balance -= principal;
    totalInterest += interest;
    if (i.includeSchedule) {
      schedule.push({ month, paymentCents: due, interestCents: interest, principalCents: principal, balanceCents: balance });
    }
  }
  return result(
    {
      loanAmountCents: loan,
      monthlyPaymentCents: payment,
      paymentsMade: month,
      totalInterestCents: totalInterest,
      balloonCents: a.balloonMonth !== undefined ? balance : 0,
      ...(i.includeSchedule ? { schedule } : {}),
    },
    i,
    a,
  );
}
