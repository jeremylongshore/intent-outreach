/**
 * tests/risk-gates.test.ts — Phase 3b: fair housing, manual review, active
 * listings, FCRA, and pack draft rules on every drafting path.
 *
 * Paired tests: two drafts that differ only in a protected-class reference
 * must not both pass; a draft about the property and the numbers passes.
 */

import { describe, expect, it } from "vitest";
import {
  fairHousingDraftRule,
  FAIR_HOUSING_HARD,
  lintFairHousing,
} from "../pipeline_core/compliance/fair-housing.js";
import {
  listingContactVerdict,
  manualReviewVerdict,
  stripFcraSensitive,
} from "../pipeline_core/compliance/risk.js";
import { guardDraft, type DraftRule } from "../pipeline_core/draft-guard.js";
import { applyMessageCompliance } from "../pipeline_core/pipeline.js";
import { noopCompliance } from "../pipeline_core/packs/types.js";

const NOW = new Date("2026-10-06T12:00:00Z");
const draft = (body: string, subject: string | null = "Your Gulf Shores lot", cta = "Worth a call?") => ({ subject, body, cta });

describe("fair-housing lint", () => {
  it("keeps every comehomealabama HARD term", () => {
    for (const term of FAIR_HOUSING_HARD) expect(lintFairHousing(`... ${term} ...`).hard).toContain(term);
  });

  it("matches on word boundaries, case-insensitively, across line breaks", () => {
    expect(lintFairHousing("Great for KIDS.").hard).toContain("kids");
    expect(lintFairHousing("adults\nonly").hard).toContain("adults only");
    expect(lintFairHousing("Skids and kidskin").hard).toEqual([]); // no substring hits
    expect(lintFairHousing("the retirement of the old loan").hard).toContain("retirement"); // conservative by design
  });

  it("WARN terms are reported but do not reject", () => {
    const r = lintFairHousing("Near good schools, primary suite.");
    expect(r.hard).toEqual([]);
    expect(r.warn).toContain("good schools");
    expect(fairHousingDraftRule(draft("Near good schools."))).toEqual([]);
  });

  it.each([
    ["age", "With retirement coming up, downsizing could free up cash.", "retirement"],
    ["familial status", "Now that the kids are grown, the extra bedrooms may be more than you need.", "kids"],
    ["empty nest", "Many empty nesters on your street have sold this year.", "empty nesters"],
    ["steering", "It sits in a safe neighborhood with low crime.", "safe neighborhood"],
    ["marital status as a signal", "After a divorce, a quick sale can simplify things.", "divorce"],
  ])("paired: the %s version is rejected, the property-and-numbers version passes", (_why, biased, term) => {
    const neutral = "The lot at 12 Main St assessed at $412,000 last year; three nearby lots sold above that.";
    expect(fairHousingDraftRule(draft(biased))).toContain(`fair-housing: "${term}" in body`);
    expect(fairHousingDraftRule(draft(neutral))).toEqual([]);
  });

  it("checks the subject and CTA too", () => {
    expect(fairHousingDraftRule(draft("About your lot.", "Perfect for families"))).toEqual([
      'fair-housing: "perfect for families" in subject',
    ]);
    expect(fairHousingDraftRule(draft("About your lot.", null, "Ask about adults only units"))).toEqual([
      'fair-housing: "adults only" in cta',
    ]);
  });
});

describe("pack draft rules run in the guard, fail closed", () => {
  it("a failing rule rejects the draft alongside the built-in checks", () => {
    const r = guardDraft(draft("Now that the kids are grown, let's talk."), { allowedText: [], rules: [fairHousingDraftRule] });
    expect(r).toEqual({ ok: false, issues: ['fair-housing: "kids" in body'] });
  });

  it("a rule that throws rejects the draft", () => {
    const boom: DraftRule = () => {
      throw new Error("rule bug");
    };
    expect(guardDraft(draft("fine"), { allowedText: [], rules: [boom] })).toEqual({
      ok: false,
      issues: ["draft-rule-error: rule bug"],
    });
  });

  it("MCP save_run path (applyMessageCompliance) applies the pack's rules", async () => {
    const out = await applyMessageCompliance({
      icp: "owners of Gulf Shores lots",
      leads: [{ domain: "acme.com", companyName: "Acme", source: "fixture" }],
      contacts: [{ name: "Pat Owner", leadDomain: "acme.com", email: "pat@acme.com", source: "fixture" }],
      enrichments: [],
      drafts: [
        { contactKey: "pat@acme.com", channel: "email", subject: "Your lot", body: "With retirement near, sell now?", cta: "Call?" },
      ],
      gate: noopCompliance,
      sender: undefined,
      model: "fixture",
      now: () => NOW.toISOString(),
      draftRules: [fairHousingDraftRule],
    });
    expect(out.messages).toEqual([]);
    expect(out.rejectedDrafts).toEqual([{ contactKey: "pat@acme.com", issues: ['fair-housing: "retirement" in body'] }]);
  });
});

describe("manual review", () => {
  it.each([
    [["probate"], "manual-review:probate"],
    [["Lis Pendens", "divorce"], "manual-review:divorce,pre-foreclosure"],
    [["notice_of_default"], "manual-review:pre-foreclosure"],
  ])("%j → %s", (signals, reason) => {
    expect(manualReviewVerdict(signals)).toEqual({ status: "blocked", reason });
  });

  it("no distress signal is clean", () => {
    expect(manualReviewVerdict(["absentee-owner", "high-equity"])).toEqual({ status: "clean" });
    expect(manualReviewVerdict([])).toEqual({ status: "clean" });
  });
});

describe("active listing", () => {
  it.each([
    [{ status: "active" }, "listing:active"],
    [{ status: "pending" }, "listing:pending"],
    [{ status: "withdrawn" }, "listing:withdrawn-under-agreement"],
    [{ status: "withdrawn", agreementEndsAt: "2026-12-01T00:00:00Z" }, "listing:withdrawn-under-agreement"],
    [{ status: "expired", agreementEndsAt: "2026-12-01T00:00:00Z" }, "listing:agreement-still-in-effect"],
    [{ status: "unknown" }, "listing:status-unknown"],
    [{ status: "expired", agreementEndsAt: "not a date" }, "listing:agreement-date-invalid"],
  ] as const)("%j blocks (%s)", (listing, reason) => {
    expect(listingContactVerdict(listing, NOW)).toEqual({ status: "blocked", reason });
  });

  it.each([
    [{ status: "expired" }],
    [{ status: "cancelled", agreementEndsAt: "2026-09-01T00:00:00Z" }],
    [{ status: "withdrawn", agreementEndsAt: "2026-09-01T00:00:00Z" }],
    [{ status: "sold" }],
    [{ status: "off-market" }],
  ] as const)("%j is clean", (listing) => {
    expect(listingContactVerdict(listing, NOW)).toEqual({ status: "clean" });
  });
});

describe("FCRA", () => {
  it("strips consumer credit and personal-financial keys, keeps property facts", () => {
    const attrs = {
      yearBuilt: 1998,
      assessedValueCents: 41_200_000,
      floodZone: "VE",
      creditScoreBand: "700-749",
      ownerFicoEstimate: 720,
      estimatedHouseholdIncome: 90_000,
      totalDebt: 12_000,
      bankruptcyFlag: true,
      netWorth: 1,
    };
    expect(stripFcraSensitive(attrs)).toEqual({ yearBuilt: 1998, assessedValueCents: 41_200_000, floodZone: "VE" });
    expect(attrs.creditScoreBand).toBe("700-749"); // the input is untouched
  });
});

describe("review regressions", () => {
  it.each([
    ["low-crime area", "low crime"],
    ["crime free community", "crime-free"],
    ["an able bodied buyer", "able-bodied"],
    ["adults-only building", "adults only"],
    ["one of the safe neighborhoods", "safe neighborhood"],
    ["a safe neighbourhood", "safe neighborhood"],
    ["no kid policy", "no kids"],
    ["Perfect for your family.", "perfect for your family"],
    ["Recently widowed owners", "widowed"],
    ["the widower next door", "widower"],
    ["two divorces on the street", "divorce"],
    ["low–crime streets", "low crime"],
  ])("normalization catches %j", (text, term) => {
    expect(lintFairHousing(text).hard).toContain(term);
  });

  it.each([
    ["Probate Court filing"],
    ["divorced"],
    ["Divorce Filed"],
    ["foreclosures"],
    ["pre–foreclosure."],
    ["NOD"],
    ["notice of default"],
    ["Tax Deed"],
  ])("manual review catches the tag %j", (tag) => {
    expect(manualReviewVerdict([tag]).status).toBe("blocked");
  });

  it("prototype keys and look-alikes are not signals", () => {
    expect(manualReviewVerdict(["constructor", "toString", "real-estate", "estate planning"])).toEqual({ status: "clean" });
    expect(manualReviewVerdict(["estate"])).toEqual({ status: "blocked", reason: "manual-review:probate" });
  });

  it("a date-only agreement end runs through that whole day everywhere", () => {
    const lastDayNoonCentral = new Date("2026-10-06T17:00:00Z");
    expect(listingContactVerdict({ status: "expired", agreementEndsAt: "2026-10-06" }, lastDayNoonCentral)).toEqual({
      status: "blocked",
      reason: "listing:agreement-still-in-effect",
    });
    expect(listingContactVerdict({ status: "expired", agreementEndsAt: "2026-10-06" }, new Date("2026-10-08T00:00:00Z"))).toEqual({
      status: "clean",
    });
  });

  it("non-ISO or impossible dates are invalid; status is case-insensitive", () => {
    for (const bad of ["5", "Oct 6 2026", "2026-02-30", "2026-10-06T10:00"]) {
      expect(listingContactVerdict({ status: "expired", agreementEndsAt: bad }, NOW)).toEqual({
        status: "blocked",
        reason: "listing:agreement-date-invalid",
      });
    }
    expect(listingContactVerdict({ status: "Active" }, NOW)).toEqual({ status: "blocked", reason: "listing:active" });
    expect(listingContactVerdict({ status: "Coming Soon" }, NOW)).toEqual({ status: "blocked", reason: "listing:coming-soon" });
  });

  it("FCRA keeps parcel facts, strips person facts, recursively", () => {
    const kept = stripFcraSensitive({
      rentalIncome: 1,
      annualRentalIncome: 1,
      grossIncome: 1,
      incomeProducing: true,
      taxDelinquent: true,
      taxDelinquentYears: 2,
      mortgageBalance: 1,
      ltv: 0.5,
      estimatedEquity: 1,
      creditUnion: "ABC CU",
      owner: { name: "Pat", wealthScore: 9, ownerAge: 71, maritalStatus: "married", judgments: 1 },
      wealth: 1,
      financialScore: 1,
      paymentHistory: [],
      evictions: 1,
      repossession: 1,
      liquidAssets: 1,
      ssn: "x",
      dob: "x",
    });
    expect(Object.keys(kept).sort()).toEqual(
      [
        "annualRentalIncome",
        "creditUnion",
        "estimatedEquity",
        "grossIncome",
        "incomeProducing",
        "ltv",
        "mortgageBalance",
        "owner",
        "rentalIncome",
        "taxDelinquent",
        "taxDelinquentYears",
      ].sort(),
    );
    expect(kept.owner).toEqual({ name: "Pat" });
  });
});
