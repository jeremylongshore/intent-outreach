/**
 * pipeline_core/profiles.ts — Report Profile schema, loader, and helpers.
 *
 * A Report Profile is a declarative, version-controlled JSON file that owns
 * the DETERMINISTIC knobs for a campaign run: which connectors to call, which
 * contacts to filter, which outreach channel and tone, which report sections to
 * emit, and where to deliver the output.
 *
 * Design rule: the profile FILE is the source of truth. The LLM owns the
 * creative parts (handled elsewhere via styleOverride). This module never
 * touches network or cloud — all I/O is local.
 *
 * Three entry points for callers:
 *   loadProfile(path)                            — read + validate a profile file.
 *   applyProfileToCampaignInput(profile, base)   — map profile knobs → RunCampaignInput fields.
 *   mergeProfileOverrides(profile, overrides)    — deep-merge a partial profile (NL patch path).
 */

import { readFileSync } from "node:fs";
import { z } from "zod";
import type { RunCampaignInput } from "./pipeline.js";
import { SenderIdentitySchema } from "./footer.js";

// ── Schema ─────────────────────────────────────────────────────────────────

export const IntakeSchema = z.object({
  /** Connector names to include for this run (subset of KNOWN_SOURCES). */
  connectors: z.array(z.string().min(1)).optional(),
  /** Extra lead/contact fields to surface in the rendered report. */
  extraFields: z.array(z.string().min(1)).optional(),
});
export type Intake = z.infer<typeof IntakeSchema>;

export const FilteringSchema = z.object({
  /** Minimum fit score (0–100) to include a lead in outreach drafting. */
  minScore: z.number().min(0).max(100).optional(),
  /** Plain-English company-type filters, e.g. ["Series A", "bootstrapped"]. */
  companyFilters: z.array(z.string()).optional(),
  /**
   * Buyer titles, e.g. ["CTO", "COO", "VP Operations"]. Contacts are ranked by
   * match before drafting (and Apollo reveals are aimed at them); see
   * pipeline_core/targeting.ts. The CLI's --buyer-titles overrides this list.
   */
  contactTitles: z.array(z.string()).optional(),
});
export type Filtering = z.infer<typeof FilteringSchema>;

export const OutreachSchema = z.object({
  /** Outreach channel for drafted messages. */
  channel: z.enum(["email", "linkedin"]).optional(),
  /** Tone descriptor, injected into the styleOverride for the draft seam. */
  tone: z.string().optional(),
  /** Approximate maximum character length for the message body. */
  maxLength: z.number().positive().optional(),
  /** Maximum contacts to draft per lead. */
  maxContactsPerLead: z.number().int().positive().optional(),
  /** Free-text template notes injected into the styleOverride. */
  templateNotes: z.string().optional(),
});
export type Outreach = z.infer<typeof OutreachSchema>;

export const StructureSchema = z.object({
  /**
   * Ordered list of sections to include in the rendered report.
   * Recognised values: "summary" | "leads" | "contacts" | "messages" | "cost".
   * Unknown values are silently passed through to custom renderers.
   */
  sections: z
    .array(z.string().min(1))
    .default(["summary", "leads", "contacts", "messages", "cost"]),
});
export type Structure = z.infer<typeof StructureSchema>;

export const OUTPUT_FORMATS = [
  "markdown",
  "csv",
  "json",
  "html",
  "slack",
  "email-draft",
  "pdf",
] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

export const OutputSchema = z.object({
  formats: z.array(z.enum(OUTPUT_FORMATS)).min(1),
});
export type Output = z.infer<typeof OutputSchema>;

export const DELIVERY_TARGETS = ["console", "file", "email-draft", "slack"] as const;
export type DeliveryTarget = (typeof DELIVERY_TARGETS)[number];

export const DeliverySchema = z.object({
  targets: z.array(z.enum(DELIVERY_TARGETS)).min(1),
  /**
   * Local directory for "file" target. Required when "file" is in targets.
   * Defaults to process.cwd() at deliver-time when omitted.
   */
  dir: z.string().optional(),
});
export type Delivery = z.infer<typeof DeliverySchema>;

/**
 * Operator voice rules. Deterministic: `banDashes` and `deniedPhrases` are
 * enforced by the draft guard (pipeline_core/draft-guard.ts::checkVoice) on both
 * the runCampaign seam path and the MCP save_run path; a violating draft lands
 * in `rejectedDrafts`. `notes` is free-text guidance appended to styleOverride.
 */
export const VoiceSchema = z.object({
  /** Reject em/en dashes, their HTML entities, and hyphens used as dashes (" - "). */
  banDashes: z.boolean().optional(),
  /** Phrases drafts must never contain: case-insensitive, whole-word, exact phrase. */
  deniedPhrases: z.array(z.string().trim().min(1)).optional(),
  /** Free-text voice guidance, appended to the draft styleOverride like `tone`. */
  notes: z.string().optional(),
});
export type Voice = z.infer<typeof VoiceSchema>;

export const ReportProfileSchema = z.object({
  /** Human-readable profile name, used in report headers. */
  name: z.string().min(1),
  /** Short description of the profile's purpose. */
  description: z.string().min(1),
  intake: IntakeSchema.optional(),
  filtering: FilteringSchema.optional(),
  outreach: OutreachSchema.optional(),
  structure: StructureSchema.optional(),
  output: OutputSchema,
  delivery: DeliverySchema,
  /**
   * Sender identity for the CAN-SPAM footer the CODE appends to email drafts:
   * { name, company, postalAddress, replyToEmail?, optOutText?, optOutOnLinkedin? }.
   * Optional — when absent, email drafts are flagged `needsSenderIdentity` and the
   * run records a compliance warning; nothing is ever fabricated.
   */
  sender: SenderIdentitySchema.optional(),
  /** Operator voice rules (see VoiceSchema). Optional; absent ⇒ no voice checks. */
  voice: VoiceSchema.optional(),
});
export type ReportProfile = z.infer<typeof ReportProfileSchema>;

// ── Loader ──────────────────────────────────────────────────────────────────

/**
 * Read a JSON profile file from `path`, parse it, and validate against
 * ReportProfileSchema.  Throws a descriptive error on missing file or
 * validation failure — the profile file is load-bearing for the pipeline.
 */
export function loadProfile(path: string): ReportProfile {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`loadProfile: cannot read "${path}": ${String(err)}`);
  }
  const result = ReportProfileSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(`loadProfile: invalid profile at "${path}": ${issues}`);
  }
  return result.data;
}

// ── Campaign input mapper ────────────────────────────────────────────────────

/**
 * The subset of RunCampaignInput that a profile can set deterministically.
 * Returned by applyProfileToCampaignInput; the caller spreads it into the
 * full RunCampaignInput alongside the id / icp / domains it owns.
 */
export interface ProfileCampaignOverrides
  extends Pick<
    RunCampaignInput,
    "channel" | "minScore" | "maxContactsPerLead" | "styleOverride" | "sender" | "voice"
  > {}

/**
 * Map the profile's deterministic knobs onto the fields that runCampaign()
 * accepts.  The caller spreads the result: `{ id, icp, domains, ...overrides }`.
 *
 * styleOverride is synthesised from outreach.tone / maxLength / templateNotes
 * so the LLM draft seam picks up voice + length constraints without exposing
 * structured fields to the probabilistic layer.
 */
export function applyProfileToCampaignInput(
  profile: ReportProfile,
  _base: { id: string; icp: string; domains: string[] },
): ProfileCampaignOverrides {
  const { outreach, filtering } = profile;

  const styleParts: string[] = [];
  if (outreach?.tone) styleParts.push(`Tone: ${outreach.tone}.`);
  if (outreach?.maxLength) styleParts.push(`Keep the body under ${outreach.maxLength} characters.`);
  if (outreach?.templateNotes) styleParts.push(outreach.templateNotes);
  if (profile.voice?.notes) styleParts.push(profile.voice.notes);
  const styleOverride = styleParts.length > 0 ? styleParts.join(" ") : undefined;

  return {
    channel: outreach?.channel,
    minScore: filtering?.minScore,
    maxContactsPerLead: outreach?.maxContactsPerLead,
    ...(styleOverride !== undefined ? { styleOverride } : {}),
    // Deterministic, operator-owned: passed straight through to the footer, never
    // to the LLM (it must not be paraphrased or invented by the model).
    ...(profile.sender !== undefined ? { sender: profile.sender } : {}),
    // Deterministic, operator-owned: enforced by the draft guard (the model also
    // gets a one-line hint, but the guard is what decides).
    ...(profile.voice !== undefined ? { voice: profile.voice } : {}),
  };
}

// ── NL-patch merge ───────────────────────────────────────────────────────────

/**
 * Merge a partial profile (produced by the NL-generate/patch path) onto a
 * validated base profile.  The profile FILE remains the source of truth — the
 * NL layer only produces overrides that get merged here.
 *
 * Deep-merges each top-level section (intake, filtering, outreach, structure,
 * output, delivery) so the NL layer can change a single field without knowing
 * the full profile shape.  Throws on the resulting merge being invalid.
 */
export function mergeProfileOverrides(
  profile: ReportProfile,
  overrides: Partial<ReportProfile>,
): ReportProfile {
  const merged: unknown = {
    ...profile,
    ...overrides,
    // Deep-merge section objects so a one-field override doesn't wipe siblings.
    intake:
      overrides.intake !== undefined
        ? { ...profile.intake, ...overrides.intake }
        : profile.intake,
    filtering:
      overrides.filtering !== undefined
        ? { ...profile.filtering, ...overrides.filtering }
        : profile.filtering,
    outreach:
      overrides.outreach !== undefined
        ? { ...profile.outreach, ...overrides.outreach }
        : profile.outreach,
    structure:
      overrides.structure !== undefined
        ? { ...profile.structure, ...overrides.structure }
        : profile.structure,
    output:
      overrides.output !== undefined
        ? { ...profile.output, ...overrides.output }
        : profile.output,
    delivery:
      overrides.delivery !== undefined
        ? { ...profile.delivery, ...overrides.delivery }
        : profile.delivery,
    sender:
      overrides.sender !== undefined
        ? { ...profile.sender, ...overrides.sender }
        : profile.sender,
    voice:
      overrides.voice !== undefined
        ? { ...profile.voice, ...overrides.voice }
        : profile.voice,
  };

  const result = ReportProfileSchema.safeParse(merged);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(`mergeProfileOverrides: merged profile is invalid: ${issues}`);
  }
  return result.data;
}
