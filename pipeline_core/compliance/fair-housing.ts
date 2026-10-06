/**
 * pipeline_core/compliance/fair-housing.ts — fair-housing language rule (pure).
 *
 * Ported from comehomealabama `scripts/journal/lint-fair-housing.py` (HUD
 * advertising guidance + NAR Article 10 training wordlists) and extended for
 * OUTREACH drafts. The Fair Housing Act (42 U.S.C. 3604(c)) bars statements that
 * indicate a preference or limitation by race, color, religion, sex, handicap,
 * familial status or national origin. HUD's 2024 AI guidance was withdrawn in
 * September 2025; the Act itself still applies.
 *
 * Two lists:
 *   HARD — the draft is rejected (no overrides).
 *   WARN — returned for human review; does not reject.
 *
 * Outreach additions: a draft to a property owner must never reference the
 * owner's AGE or FAMILY (retirement, kids, empty nest, downsizing for age...):
 * those are inferences about protected status (familial status) or age, and a
 * message built on them is steering whatever the intent. Describe the PROPERTY
 * and the NUMBERS, never who belongs there.
 *
 * Matching is case-insensitive on word boundaries.
 */

import type { DraftLike, DraftRule } from "../draft-guard.js";

/** comehomealabama HARD list, verbatim. */
export const FAIR_HOUSING_HARD: readonly string[] = [
  // familial status
  "no children", "no kids", "adults only", "adult building", "couples only",
  "singles only", "perfect for families", "ideal for families",
  "perfect for a family", "ideal for young families", "empty nesters only",
  // steering / exclusion proxies
  "exclusive neighborhood", "exclusive community", "integrated neighborhood",
  "traditional neighborhood values", "safe neighborhood", "low crime", "crime-free",
  "desirable neighbors", "right kind of people",
  // religion / national origin / race
  "christian community", "ethnic neighborhood", "hispanic neighborhood",
  "white neighborhood", "black neighborhood",
  // disability
  "no wheelchairs", "able-bodied",
];

/** Outreach-only HARD additions: the recipient's age or family is never a pitch. */
export const OUTREACH_AGE_FAMILIAL_HARD: readonly string[] = [
  "retire", "retired", "retiree", "retirees", "retiring", "retirement",
  "seniors", "senior citizen", "senior citizens", "elderly", "your age", "at your stage of life",
  "golden years", "empty nest", "empty nester", "empty nesters", "kids", "children", "grandkids",
  "grandchildren", "growing family", "starting a family", "new baby", "pregnant",
  "widow", "widowed", "divorce", "divorced",
];

/** comehomealabama WARN list, verbatim. */
export const FAIR_HOUSING_WARN: readonly string[] = [
  "family-friendly", "family oriented", "family-oriented", "great schools",
  "good schools", "top schools", "school district",
  "walking distance to church", "near churches", "close to church",
  "quiet neighborhood", "safest", "bachelor", "mother-in-law suite",
  "master bedroom", "master suite", "exclusive", "private community",
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const compile = (terms: readonly string[]) =>
  terms.map((t) => ({ term: t, re: new RegExp(`(?<![a-z0-9])${escape(t).replace(/ /g, "\\s+")}(?![a-z0-9])`, "i") }));

const HARD_RES = compile([...FAIR_HOUSING_HARD, ...OUTREACH_AGE_FAMILIAL_HARD]);
const WARN_RES = compile(FAIR_HOUSING_WARN);

export interface FairHousingLint {
  hard: string[];
  warn: string[];
}

/** Lint any text. Pure. */
export function lintFairHousing(text: string): FairHousingLint {
  return {
    hard: HARD_RES.filter((h) => h.re.test(text)).map((h) => h.term),
    warn: WARN_RES.filter((w) => w.re.test(text)).map((w) => w.term),
  };
}

/** Pack draft rule: any HARD term in the subject, body or CTA rejects the draft. */
export const fairHousingDraftRule: DraftRule = (draft: Readonly<DraftLike>) => {
  const fields: [string, string][] = [
    ["subject", draft.subject ?? ""],
    ["body", draft.body],
    ["cta", draft.cta],
  ];
  return fields.flatMap(([field, text]) =>
    lintFairHousing(text).hard.map((term) => `fair-housing: "${term}" in ${field}`),
  );
};
