/**
 * pipeline_core/packs/residential-re.ts — the residential listing-agent pack.
 *
 * For a licensed agent writing to owners of homes in the agent's market about
 * selling. It composes the engine's real estate gates; it adds no enforcement
 * of its own:
 *
 *   propertyGate   service area (the property's ZIP in the pack's area;
 *                  unknown address blocks), manual review for probate,
 *                  divorce and pre-foreclosure signals, and the listing check
 *                  (a known active listing or a running exclusive agreement
 *                  blocks). The engine's suppression check runs first.
 *   draftRules     fair housing (never the owner's age, family, marital status
 *                  or any protected class; never who a place is "for").
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
import { listingContactVerdict, manualReviewVerdict, type ListingState } from "../compliance/risk.js";
import { GULF_COAST_AL_FL } from "./service-areas.js";
import { noopCompliance, type ComplianceResult, type Pack, type PropertyGateContext } from "./types.js";

/** Read a property attribute Fact's value, if present. */
function attr(ctx: PropertyGateContext, key: string): unknown {
  return ctx.property.attributes[key]?.value;
}

export function residentialPropertyGate(ctx: PropertyGateContext): ComplianceResult {
  const zip = ctx.property.address?.zip?.slice(0, 5);
  if (!zip) return { status: "blocked", reason: "service-area:unknown-address" };
  if (!inServiceArea(zip, GULF_COAST_AL_FL)) return { status: "blocked", reason: "service-area:outside" };

  const distress = attr(ctx, "distressSignals");
  if (distress !== undefined) {
    if (!Array.isArray(distress) || !distress.every((s) => typeof s === "string")) {
      return { status: "blocked", reason: "manual-review:unreadable-signals" };
    }
    const review = manualReviewVerdict(distress);
    if (review.status !== "clean") return review;
  }

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
  draftRules: [fairHousingDraftRule],
  channels: { email: LICENSED, mail: LICENSED, sms: LICENSED, call_script: LICENSED, linkedin: LICENSED },
};
