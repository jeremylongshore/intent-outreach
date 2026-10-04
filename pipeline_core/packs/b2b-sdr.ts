/**
 * pipeline_core/packs/b2b-sdr.ts — the built-in B2B SDR pack.
 *
 * This IS today's behavior, expressed as a pack: no pack-specific compliance
 * gate (B2B cold outreach has no DNC/TCPA/geofence stop) and the prompt files
 * the seams already load.
 *
 * b2b-sdr drafts ARE suppression-gated: runCampaign composes the opt-out gate
 * (compliance/suppression.ts, list from suppressions.jsonl) IN FRONT OF every
 * pack's gate, this one included — an unsubscribe must survive a pack swap, so
 * it is enforced by the engine rather than re-declared per pack. An empty or
 * missing suppression list blocks nothing (backwards-compatible). It lives in-engine (not a separate package) precisely because it
 * is the default behavior; separate pack packages arrive when residential-re
 * lands (deferred Phase 2). Running with this pack is byte-identical to the
 * pre-pack engine.
 */

import { noopCompliance, type Pack } from "./types.js";

export const b2bSdrPack: Pack = {
  id: "b2b-sdr",
  displayName: "B2B SDR",
  // Pack-specific checks only; the engine-wide suppression gate runs first.
  compliance: noopCompliance,
  // Exactly the files seam.ts loaded before packs existed — keeps output identical.
  prompts: {
    score: ["research.v1.md", "enrich.v1.md"],
    draft: "outreach.v1.md",
  },
};
