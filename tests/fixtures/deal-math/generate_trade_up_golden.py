#!/usr/bin/env python3
"""Regenerate tests/fixtures/deal-math/trade-up.golden.json from coastal's trade_up.py.

Usage (from the intent-outreach repo root):

    python3 tests/fixtures/deal-math/generate_trade_up_golden.py ~/000-projects/coastal-realty-ops \
        > tests/fixtures/deal-math/trade-up.golden.json

The fixture is ground truth for the TypeScript port, so it is only ever
regenerated from the Python, never edited by hand. Seeds are fixed, so the
output is deterministic for a given trade_up.py.
"""

import dataclasses
import json
import random
import sys

sys.path.insert(0, sys.argv[1] if len(sys.argv) > 1 else ".")
from src.calculators.trade_up import TradeUpInputs, _monthly_payment, compute_trade_up  # noqa: E402

BASE = dict(condo_value=635_000, horton_price=330_000, condo_hoa_monthly=750, condo_insurance_monthly=290,
            condo_tax_annual=2_032, new_hoa_monthly=75, new_insurance_monthly=185, new_tax_annual=812)
NAMED = [
    ("017 worked example", BASE),
    ("017 with move costs", {**BASE, "buy_closing_costs": 5_000}),
    ("017 with incentive", {**BASE, "horton_incentive": 10_000}),
    ("017 with assessment", {**BASE, "condo_assessment_monthly": 500}),
    ("017 with mortgage", {**BASE, "mortgage_balance": 100_000}),
    ("financed path", dict(condo_value=200_000, horton_price=330_000)),
    ("negative savings", dict(condo_value=635_000, horton_price=330_000, condo_hoa_monthly=100, new_hoa_monthly=900)),
    ("half-even tax 0.5", dict(condo_value=100_000, horton_price=50_000, condo_tax_annual=6, new_tax_annual=18)),
    ("half-even tax 2.5/3.5", dict(condo_value=100_000, horton_price=50_000, condo_tax_annual=30, new_tax_annual=42)),
    ("half-even sell cost", dict(condo_value=100_020, horton_price=50_000, sell_cost_rate=0.075)),
    ("half-even sell cost even", dict(condo_value=100_060, horton_price=50_000, sell_cost_rate=0.075)),
    # The float product 839000 * 0.0725 lands just below the 60827.5 tie, so Python rounds down.
    ("float tie below 0.0725", dict(condo_value=839_000, horton_price=330_000, sell_cost_rate=0.0725)),
    ("zero rate financed", dict(condo_value=100_000, horton_price=200_000, new_loan_rate_annual=0.0)),
    ("nothing", dict(condo_value=100_000, horton_price=92_500)),
]


def grid(rng, n):
    rates = [0.05, 0.06, 0.065, 0.0675, 0.07, 0.0725]
    for i in range(n):
        yield f"grid {i}", dict(
            condo_value=rng.randrange(150_000, 1_500_000, 5),
            horton_price=rng.randrange(200_000, 600_000, 5),
            mortgage_balance=rng.choice([0, 0, rng.randrange(0, 400_000)]),
            sell_cost_rate=rng.choice([0.06, 0.07, 0.075, 0.08]),
            condo_hoa_monthly=rng.randrange(0, 1500), condo_insurance_monthly=rng.randrange(0, 900),
            condo_tax_annual=rng.randrange(0, 12_000),
            condo_assessment_monthly=rng.choice([0, 0, rng.randrange(0, 1200)]),
            horton_incentive=rng.choice([0, 5_000, 10_000, 15_000]), buy_closing_costs=rng.choice([0, 3_000, 5_000]),
            new_hoa_monthly=rng.randrange(0, 400), new_insurance_monthly=rng.randrange(0, 600),
            new_tax_annual=rng.randrange(0, 6_000),
            new_loan_rate_annual=rng.choice(rates), new_loan_term_years=rng.choice([15, 20, 30]),
        )


def ties(rng, n):
    """Sell-cost products that sit exactly on (or a float hair off) a .5 tie."""
    rates = [0.0625, 0.0675, 0.0725, 0.075, 0.0775, 0.085]
    found = 0
    while found < n:
        rate = rng.choice(rates)
        value = rng.randrange(100_000, 2_000_000)
        bps = round(rate * 10_000)
        if (value * bps) % 10_000 == 5_000:  # exact x.5 in true arithmetic
            found += 1
            yield f"tie {found} ({value} x {rate})", dict(condo_value=value, horton_price=300_000, sell_cost_rate=rate)


def main():
    rng = random.Random(20261006)
    cases = list(NAMED) + list(grid(rng, 60)) + list(ties(random.Random(7), 80))
    out = [{"name": n, "inputs": kw, "result": dataclasses.asdict(compute_trade_up(TradeUpInputs(**kw)))}
           for n, kw in cases]
    pay = [dict(principal=p, rate=r, years=y, expected=_monthly_payment(p, r, y))
           for (p, r, y) in [(100_000, .06, 30), (0, .06, 30), (-500, .06, 30), (120_000, 0.0, 30),
                             (145_000, .0675, 30), (250_000, .07, 15), (333_333, .0525, 20), (1, .06, 30),
                             (500_000, .0725, 30)]]
    json.dump({"source": "coastal-realty-ops src/calculators/trade_up.py",
               "generatedBy": "tests/fixtures/deal-math/generate_trade_up_golden.py",
               "cases": out, "monthlyPayment": pay}, sys.stdout, indent=1)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
