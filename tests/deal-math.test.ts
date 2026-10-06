/**
 * tests/deal-math.test.ts — @intent-outreach/deal-math.
 *
 *   • tradeUp matches coastal's Python trade_up.py on every case of a golden
 *     fixture generated from that calculator (the 017 worked example, its
 *     documented variants, half-even rounding edges and a 60-case grid).
 *   • levelPayment matches Python _monthly_payment.
 *   • NOI / cap rate / DSCR / cash-on-cash, seller financing and the 1031
 *     timeline, with exact integer-cent and basis-point arithmetic.
 *   • Every result carries inputs, assumptions and the version, frozen.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  capRate,
  cashOnCash,
  COASTAL_TRADE_UP_ASSUMPTIONS,
  DEAL_MATH_VERSION,
  divRoundHalfEven,
  dscr,
  exchange1031Timeline,
  levelPayment,
  monthlyPayment,
  noi,
  roundHalfEven,
  sellerFinance,
  tradeUp,
} from "@intent-outreach/deal-math";

interface PyInputs {
  condo_value: number;
  horton_price: number;
  mortgage_balance?: number;
  sell_cost_rate?: number;
  condo_hoa_monthly?: number;
  condo_insurance_monthly?: number;
  condo_tax_annual?: number;
  condo_assessment_monthly?: number;
  horton_incentive?: number;
  buy_closing_costs?: number;
  new_hoa_monthly?: number;
  new_insurance_monthly?: number;
  new_tax_annual?: number;
  new_loan_rate_annual?: number;
  new_loan_term_years?: number;
}

const golden = JSON.parse(readFileSync(resolve("tests/fixtures/deal-math/trade-up.golden.json"), "utf8")) as {
  cases: { name: string; inputs: PyInputs; result: Record<string, number | boolean | string> }[];
  monthlyPayment: { principal: number; rate: number; years: number; expected: number }[];
};

const c = (dollars: number | undefined) => Math.round((dollars ?? 0) * 100);
const bps = (rate: number) => Math.round(rate * 10_000);

describe("tradeUp: golden parity with coastal trade_up.py", () => {
  it("the fixture is non-trivial", () => {
    expect(golden.cases.length).toBeGreaterThanOrEqual(70);
  });

  it.each(golden.cases.map((k) => [k.name, k] as const))("%s", (_name, k) => {
    const p = k.inputs;
    const r = tradeUp(
      {
        condoValueCents: c(p.condo_value),
        newHomePriceCents: c(p.horton_price),
        mortgageBalanceCents: c(p.mortgage_balance),
        condoHoaMonthlyCents: c(p.condo_hoa_monthly),
        condoInsuranceMonthlyCents: c(p.condo_insurance_monthly),
        condoTaxAnnualCents: c(p.condo_tax_annual),
        condoAssessmentMonthlyCents: c(p.condo_assessment_monthly),
        builderIncentiveCents: c(p.horton_incentive),
        buyClosingCostsCents: c(p.buy_closing_costs),
        newHoaMonthlyCents: c(p.new_hoa_monthly),
        newInsuranceMonthlyCents: c(p.new_insurance_monthly),
        newTaxAnnualCents: c(p.new_tax_annual),
      },
      {
        sellCostBps: bps(p.sell_cost_rate ?? 0.075),
        loanRateBps: bps(p.new_loan_rate_annual ?? 0.0675),
        loanTermYears: p.new_loan_term_years ?? 30,
      },
    ).value;
    const py = k.result;
    expect({
      net_proceeds: r.netProceedsCents / 100,
      sell_costs: r.sellCostsCents / 100,
      condo_carry_monthly: r.condoCarryMonthlyCents / 100,
      horton_net_price: r.newHomeNetPriceCents / 100,
      cash_buy_feasible: r.cashBuyFeasible,
      new_loan_amount: r.newLoanAmountCents / 100,
      new_pi_monthly: r.newPiMonthlyCents / 100,
      new_carry_monthly: r.newCarryMonthlyCents / 100,
      cash_pocketed: r.cashPocketedCents / 100,
      monthly_savings: r.monthlySavingsCents / 100,
      annual_savings: r.annualSavingsCents / 100,
      assessment_risk_eliminated_monthly: r.assessmentRiskEliminatedMonthlyCents / 100,
      headline: r.headline,
    }).toEqual(py);
  });

  it("the 017 worked example: pocket $252,375 and save $881/mo after $5K of move costs", () => {
    const r = tradeUp(
      {
        condoValueCents: 635_000_00,
        newHomePriceCents: 330_000_00,
        condoHoaMonthlyCents: 750_00,
        condoInsuranceMonthlyCents: 290_00,
        condoTaxAnnualCents: 2_032_00,
        newHoaMonthlyCents: 75_00,
        newInsuranceMonthlyCents: 185_00,
        newTaxAnnualCents: 812_00,
        buyClosingCostsCents: 5_000_00,
      },
      COASTAL_TRADE_UP_ASSUMPTIONS,
    );
    expect(r.value.cashPocketedCents).toBe(252_375_00);
    expect(r.value.monthlySavingsCents).toBe(881_00);
    expect(r.assumptionsUsed).toEqual({ sellCostBps: 750, loanRateBps: 675, loanTermYears: 30 });
    expect(r.version).toBe(DEAL_MATH_VERSION);
  });
});

describe("rounding", () => {
  it.each([
    [0.5, 0],
    [1.5, 2],
    [2.5, 2],
    [3.5, 4],
    [-0.5, 0],
    [-1.5, -2],
    [2.4999, 2],
    [2.5001, 3],
  ])("roundHalfEven(%d) = %d", (x, want) => {
    expect(roundHalfEven(x)).toBe(want);
  });

  it("divRoundHalfEven is exact on integers and rejects a bad divisor", () => {
    expect(divRoundHalfEven(7501_5, 10)).toBe(7502); // 7501.5 -> 7502
    expect(divRoundHalfEven(7504_5, 10)).toBe(7504); // 7504.5 -> 7504
    expect(divRoundHalfEven(-15, 10)).toBe(-2);
    expect(() => divRoundHalfEven(1, 0)).toThrow();
    expect(() => divRoundHalfEven(1.5, 2)).toThrow();
  });

  it.each(golden.monthlyPayment.map((m) => [m.principal, m.rate, m.years, m.expected] as const))(
    "levelPayment($%d, %d, %dy) matches Python _monthly_payment (%d)",
    (principal, rate, years, expected) => {
      expect(levelPayment(principal * 100, bps(rate), years * 12, 100)).toBe(expected * 100);
    },
  );
});

describe("income metrics", () => {
  // $120,000 gross rent, 5% vacancy, $2,400 other income, $45,000 opex.
  const n = noi(
    { grossScheduledRentCents: 120_000_00, otherIncomeCents: 2_400_00, operatingExpensesCents: 45_000_00 },
    { vacancyBps: 500 },
  );

  it("noi", () => {
    expect(n.value).toEqual({ vacancyLossCents: 6_000_00, effectiveGrossIncomeCents: 116_400_00, noiCents: 71_400_00 });
    expect(n.assumptionsUsed).toEqual({ vacancyBps: 500 });
  });

  it("cap rate, DSCR and cash-on-cash in basis points", () => {
    expect(capRate({ noiCents: 71_400_00, priceCents: 1_100_000_00 }).value).toBe(649); // 6.4909% -> 649 bps
    expect(dscr({ noiCents: 71_400_00, annualDebtServiceCents: 57_120_00 }).value).toBe(12_500); // 1.25x
    expect(cashOnCash({ annualPreTaxCashFlowCents: 14_280_00, totalCashInvestedCents: 285_600_00 }).value).toBe(500);
  });

  it("rejects floats for money and a zero price", () => {
    expect(() => capRate({ noiCents: 1.5, priceCents: 100 })).toThrow(/capRate: invalid input/);
    expect(() => capRate({ noiCents: 100, priceCents: 0 })).toThrow(/priceCents/);
    expect(() => noi({ grossScheduledRentCents: 1, operatingExpensesCents: 0 }, { vacancyBps: 10_001 })).toThrow();
  });

  it("results are frozen and echo their inputs", () => {
    expect(Object.isFrozen(n)).toBe(true);
    expect(Object.isFrozen(n.value)).toBe(true);
    expect(n.inputs.grossScheduledRentCents).toBe(120_000_00);
  });
});

describe("amortization and seller financing", () => {
  it("monthlyPayment: $100,000 at 6% for 30 years is $599.55", () => {
    expect(monthlyPayment({ principalCents: 100_000_00, annualRateBps: 600, termMonths: 360 }).value).toBe(599_55);
    expect(monthlyPayment({ principalCents: 120_000_00, annualRateBps: 0, termMonths: 360 }).value).toBe(333_33);
    expect(monthlyPayment({ principalCents: 0, annualRateBps: 600, termMonths: 360 }).value).toBe(0);
  });

  it("a fully amortizing note pays off to exactly zero", () => {
    const r = sellerFinance(
      { priceCents: 300_000_00, downPaymentCents: 60_000_00, includeSchedule: true },
      { annualRateBps: 700, amortizationMonths: 360 },
    ).value;
    expect(r.loanAmountCents).toBe(240_000_00);
    expect(r.monthlyPaymentCents).toBe(levelPayment(240_000_00, 700, 360));
    expect(r.paymentsMade).toBe(360);
    expect(r.balloonCents).toBe(0);
    expect(r.schedule?.at(-1)?.balanceCents).toBe(0);
    const paid = r.schedule!.reduce((s, row) => s + row.paymentCents, 0);
    expect(paid - r.totalInterestCents).toBe(240_000_00); // principal repaid exactly
  });

  it("a 5-year balloon on a 30-year schedule leaves the remaining balance due", () => {
    const r = sellerFinance(
      { priceCents: 300_000_00, downPaymentCents: 60_000_00 },
      { annualRateBps: 700, amortizationMonths: 360, balloonMonth: 60 },
    ).value;
    expect(r.paymentsMade).toBe(60);
    expect(r.balloonCents).toBeGreaterThan(220_000_00);
    expect(r.balloonCents).toBeLessThan(240_000_00);
    expect(r.schedule).toBeUndefined();
  });

  it("rejects a down payment above the price and a balloon after the term", () => {
    expect(() => sellerFinance({ priceCents: 100, downPaymentCents: 200 }, { annualRateBps: 0, amortizationMonths: 12 })).toThrow();
    expect(() =>
      sellerFinance({ priceCents: 200, downPaymentCents: 0 }, { annualRateBps: 0, amortizationMonths: 12, balloonMonth: 13 }),
    ).toThrow(/balloon/);
  });
});

describe("1031 timeline (informational)", () => {
  it("45 and 180 calendar days after the transfer, across a year boundary", () => {
    const r = exchange1031Timeline({ relinquishedCloseDate: "2026-11-15", taxReturnDueDate: "2027-10-15" }).value;
    expect(r.identificationDeadline).toBe("2026-12-30");
    expect(r.exchangeDeadline).toBe("2027-05-14");
    expect(r.exchangeDeadlineBasis).toBe("180-days");
    expect(r.informationalOnly).toBe(true);
    expect(r.note).toMatch(/not tax advice/);
  });

  it("an earlier tax-return due date cuts the exchange period short", () => {
    const r = exchange1031Timeline({ relinquishedCloseDate: "2026-12-15", taxReturnDueDate: "2027-04-15" }).value;
    expect(r.exchangeDeadline).toBe("2027-04-15");
    expect(r.exchangeDeadlineBasis).toBe("tax-return-due-date");
  });

  it("without a return due date, a late-year close assumes the unextended April 15 (never overstates)", () => {
    const late = exchange1031Timeline({ relinquishedCloseDate: "2026-12-15" }).value;
    expect(late.exchangeDeadline).toBe("2027-04-15");
    expect(late.exchangeDeadlineBasis).toBe("assumed-unextended-return-due-date");
    expect(late.note).toMatch(/extension/);
    const early = exchange1031Timeline({ relinquishedCloseDate: "2026-03-01" }).value;
    expect(early.exchangeDeadline).toBe("2026-08-28");
    expect(early.exchangeDeadlineBasis).toBe("180-days");
  });

  it("rejects a malformed date and a return due date before the transfer", () => {
    expect(() => exchange1031Timeline({ relinquishedCloseDate: "11/15/2026" })).toThrow();
    expect(() => exchange1031Timeline({ relinquishedCloseDate: "2026-11-15", taxReturnDueDate: "2026-04-15" })).toThrow(
      /before the transfer/,
    );
  });

  it("a rate past 1,000% is a validation error, not a float overflow", () => {
    expect(() => monthlyPayment({ principalCents: 100_000_00, annualRateBps: 100_001, termMonths: 600 })).toThrow(
      /invalid input/,
    );
  });
});
