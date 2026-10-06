/**
 * pipeline_core/packs/types.ts — the Pack abstraction.
 *
 * A pack is a DECLARATIVE composition over seams the engine already has — it adds
 * no new orchestration path. `runCampaign()` stays the one loop; a pack only
 * supplies (a) a compliance gate run before drafting and (b) the prompt files the
 * LLM seams load. This mirrors the connector registry: register a pack, the engine
 * uses it, no core edits to add one.
 *
 * Built-in `b2b-sdr` is today's behavior (no-op compliance + today's prompts).
 * Verticals like residential-re (deferred) swap in a real compliance gate +
 * vertical prompts WITHOUT touching this engine.
 */

import type { ServiceArea } from "../compliance/index.js";
import type { Contact, Enrichment, Lead } from "../models.js";

/** A compliance verdict for a single contact. Fail-closed: ambiguity → blocked. */
export type ComplianceStatus = "clean" | "blocked";

export interface ComplianceResult {
  status: ComplianceStatus;
  /** Short machine reason for the audit trail, e.g. "dnc", "quiet-hours". */
  reason?: string;
}

export interface ComplianceContext {
  lead: Lead;
  contact: Contact;
  /** Injected instant — the same clock `runCampaign` threads through, so the
   *  gate stays pure and deterministic (no `Date.now()` inside a gate). */
  now: Date;
  /**
   * Enrichments attached to THIS lead (subjectKey = domain) or THIS contact
   * (subjectKey / verifiedEmail = the contact's email). Carries the phone /
   * address data a DNC, TCPA or service-area gate needs.
   */
  enrichments: Enrichment[];
}

/**
 * The per-pack compliance gate. Returns "clean" to allow drafting a contact,
 * "blocked" to skip it (recorded, never drafted/delivered).
 *
 * The ENGINE enforces fail-closed regardless of what a gate returns: anything
 * other than exactly `{ status: "clean" }` (a typo like "BLOCKED", `undefined`,
 * a missing object) blocks the contact with reason `verdict.reason ??
 * "non-clean-verdict"`, and a gate that THROWS blocks it with reason
 * `"gate-error: <message>"` (also recorded in `run.errors`). A gate cannot
 * accidentally let a contact through. `b2b-sdr` returns
 * "clean" for everything; residential-re composes the real DNC/TCPA/geofence
 * checks from `../compliance`.
 */
export interface ComplianceGate {
  check(ctx: ComplianceContext): ComplianceResult;
}

/**
 * Prompt files a pack supplies for the two LLM seams. Names are resolved via
 * `loadPrompt` (prompts-as-code, eval-gated) — packs swap prompts without core
 * edits. `score` is an array because the score seam joins multiple prompt files.
 */
export interface PackPrompts {
  score: string[];
  draft: string;
}

export interface Pack {
  /** Stable id, stamped onto every CampaignRun as `vertical`. */
  id: string;
  displayName: string;
  compliance: ComplianceGate;
  prompts: PackPrompts;
  /**
   * The ZIPs this pack's agent works, when the vertical is geographic. Pack
   * DATA read by the pack's own gate via `inServiceArea(zip, serviceArea)`;
   * the engine never consults it. `b2b-sdr` has none.
   */
  serviceArea?: ServiceArea;
}

/** The pack resolved when a caller names none. */
export const DEFAULT_PACK_ID = "b2b-sdr";

/** A reusable no-op gate: every contact is "clean". Used by `b2b-sdr`. */
export const noopCompliance: ComplianceGate = {
  check: () => ({ status: "clean" }),
};
