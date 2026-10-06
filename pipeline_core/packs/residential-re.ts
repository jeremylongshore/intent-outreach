/**
 * pipeline_core/packs/residential-re.ts — the residential listing-agent pack.
 *
 * For a licensed agent writing to owners of homes in the agent's market about
 * selling. It composes the engine's real estate gates; it adds no enforcement
 * of its own:
 *
 *   propertyGate   the owner record's license terms (outreach must be
 *                  explicitly allowed; undeclared blocks), service area (the property's ZIP in the pack's area;
 *                  unknown address blocks), manual review for probate,
 *                  divorce and pre-foreclosure signals (from the parcel's
 *                  `distressSignals` AND from the ownership itself: an estate
 *                  owner, "Estate of …" / heirs in the name, a life estate),
 *                  and the listing check (a known active listing or a running
 *                  exclusive agreement blocks). The engine's suppression
 *                  check runs first.
 *   draftRules     fair housing (never the owner's age, family, marital status
 *                  or any protected class; never who a place is "for"), and
 *                  no distress language (foreclosure, liens, taxes owed...).
 *   channels       every channel requires the license disclosure in its
 *                  footer, on top of the default per-channel send-time rules.
 *   prompts        residential score + draft prompts (property and numbers only).
 *
 * KNOWN LIMIT: free public records carry no MLS status. A property with NO
 * listing data passes the listing check (blocking every property would leave
 * the free tier unusable); the agent confirms listing status before mailing,
 * and a listing-status connector (MLS feed or a paid source) closes the gap by
 * supplying `listingStatus`.
 */

import { inServiceArea } from "../compliance/index.js";
import { fairHousingDraftRule } from "../compliance/fair-housing.js";
import type { DraftLike, DraftRule } from "../draft-guard.js";
import { listingContactVerdict, manualReviewVerdict, type ListingState } from "../compliance/risk.js";
import { GULF_COAST_AL_FL } from "./service-areas.js";
import { noopCompliance, type ComplianceResult, type Pack, type PropertyGateContext } from "./types.js";

/** Read a property attribute Fact's value, if present. */
function attr(ctx: PropertyGateContext, key: string): unknown {
  return ctx.property.attributes[key]?.value;
}

/** Probate-type signals the OWNERSHIP itself carries, whether or not a connector tagged the parcel. */
export function ownershipSignals(ctx: PropertyGateContext): string[] {
  const out: string[] = [];
  const parties = ctx.parties.length > 0 ? ctx.parties : [ctx.owner];
  if (ctx.owner.kind === "entity" && ctx.owner.entityType === "estate") out.push("estate");
  for (const p of parties) out.push(p.name); // "Estate of Jane Doe", "Heirs of ..." match the probate patterns
  if (ctx.ownerships.some((o) => o.role === "life-tenant")) out.push("life estate");
  return out;
}

const DISTRESS_TERMS =
  /\b(foreclos\w*|pre-?foreclosure|probate|liens?|lis pendens|back taxes|taxes owed|delinquen\w*|behind on|late on (?:your )?(?:mortgage|payments?|taxes)|bankrupt\w*|estate sale|tax sale|auction)\b/i;

/** Draft rule: a letter never raises distress (the data may know; the letter never says). */
export const distressLanguageDraftRule: DraftRule = (draft: Readonly<DraftLike>) =>
  ([["subject", draft.subject ?? ""], ["body", draft.body], ["cta", draft.cta]] as const).flatMap(([field, text]) => {
    const m = DISTRESS_TERMS.exec(text.replace(/[\u2010-\u2015]/g, "-"));
    return m ? [`distress-language: "${m[0].toLowerCase()}" in ${field}`] : [];
  });

export function residentialPropertyGate(ctx: PropertyGateContext): ComplianceResult {
  // The owner record (and the mailing address on it) must come from a source whose terms are
  // known to allow outreach. Undeclared is treated as restricted (000-docs/035 §5).
  const terms = ctx.owner.licenseTerms;
  if (terms?.outreachRestricted === true) return { status: "blocked", reason: "license:outreach-restricted" };
  if (terms?.outreachRestricted !== false) return { status: "blocked", reason: "license:undeclared" };

  // Public bodies (county, city, school board, ...) are not prospects.
  if (ctx.owner.entityType === "government") return { status: "blocked", reason: "owner:government" };

  const zip = ctx.property.address?.zip?.slice(0, 5);
  if (!zip) return { status: "blocked", reason: "service-area:unknown-address" };
  if (!inServiceArea(zip, GULF_COAST_AL_FL)) return { status: "blocked", reason: "service-area:outside" };

  const distress = attr(ctx, "distressSignals");
  if (distress !== undefined && (!Array.isArray(distress) || !distress.every((s) => typeof s === "string"))) {
    return { status: "blocked", reason: "manual-review:unreadable-signals" };
  }
  const review = manualReviewVerdict([...((distress as string[] | undefined) ?? []), ...ownershipSignals(ctx)]);
  if (review.status !== "clean") return review;

  const listing = attr(ctx, "listingStatus");
  if (listing !== undefined) {
    if (!listing || typeof listing !== "object" || typeof (listing as ListingState).status !== "string") {
      return { status: "blocked", reason: "listing:unreadable" };
    }
    const verdict = listingContactVerdict(listing as ListingState, ctx.now);
    if (verdict.status !== "clean") return verdict;
  }
  return { status: "clean" };
}

const LICENSED = { requireLicenseDisclosure: true } as const;

export const residentialRePack: Pack = {
  id: "residential-re",
  displayName: "Residential real estate (listing agent)",
  // The B2B loop's gate is unused by property campaigns; propertyGate is the gate.
  compliance: noopCompliance,
  prompts: { score: ["residential-score.v1.md"], draft: "residential-draft.v1.md" },
  serviceArea: GULF_COAST_AL_FL,
  propertyGate: residentialPropertyGate,
  draftRules: [fairHousingDraftRule, distressLanguageDraftRule],
  channels: { email: LICENSED, mail: LICENSED, sms: LICENSED, call_script: LICENSED, linkedin: LICENSED },
};
