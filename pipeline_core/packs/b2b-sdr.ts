/**
 * pipeline_core/packs/b2b-sdr.ts — the built-in B2B SDR pack.
 *
 * This IS today's behavior, expressed as a pack: a no-op compliance gate (B2B
 * cold outreach has no DNC/TCPA/geofence stop) and the prompt files the seams
 * already load. It lives in-engine (not a separate package) precisely because it
 * is the default behavior; separate pack packages arrive when residential-re
 * lands (deferred Phase 2). Running with this pack is byte-identical to the
 * pre-pack engine.
 */

import { noopCompliance, type Pack } from "./types.js";

export const b2bSdrPack: Pack = {
  id: "b2b-sdr",
  displayName: "B2B SDR",
  compliance: noopCompliance,
  // Exactly the files seam.ts loaded before packs existed — keeps output identical.
  prompts: {
    score: ["research.v1.md", "enrich.v1.md"],
    draft: "outreach.v1.md",
  },
};
