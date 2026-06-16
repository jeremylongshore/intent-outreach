/**
 * pipeline_core/render/json.ts — JSON renderer for a CampaignRun.
 *
 * Emits the full validated run as pretty-printed JSON.  The `Validated<T>`
 * brand is a TypeScript-only phantom — it disappears at runtime, so we can
 * serialize the run directly without any stripping.
 *
 * No external dependencies.
 */

import type { Validated } from "../validator.js";
import type { CampaignRun } from "../models.js";

/**
 * Render a validated CampaignRun as a pretty-printed JSON string (2-space indent).
 */
export function renderJson(run: Validated<CampaignRun>): string {
  return JSON.stringify(run, null, 2);
}
