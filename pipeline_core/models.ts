/**
 * pipeline_core/models.ts — framework-free value types for Intent Outreach.
 *
 * Hickey step zero: the data model exists BEFORE the pipeline. These are pure
 * zod value types. No http, no cloud, no provider, no I/O imports here — this
 * module is CI-guarded to stay framework-free (see .github/workflows/policy.yml).
 *
 * Five value types: Lead, Contact, Enrichment, Message, CampaignRun.
 * CampaignRun is the system of record. The probabilistic system (the LLM) must
 * never write it directly — everything passes through validator.ts first.
 */

import { z } from "zod";

/** Bump on any breaking change to a schema below. Persisted on every record. */
export const SCHEMA_VERSION = 1 as const;

/**
 * Where a piece of data came from. OPEN-ENDED by design: `source` is any
 * non-empty string so a user can register a custom connector and stamp its own
 * source name without editing core ("wire it for anything and everything").
 * KNOWN_SOURCES is a convenience list of the adapters this repo ships.
 */
export const KNOWN_SOURCES = [
  "apollo",
  "crunchbase",
  "clearbit",
  "clay",
  "hunter",
  "peopledatalabs",
  "exa",
  "leadmagic",
  "zoominfo",
  "model",
  "manual",
  "fixture",
] as const;
export type KnownSource = (typeof KNOWN_SOURCES)[number];
export const SourceSchema = z.string().min(1);
export type Source = string;

/**
 * Lead — a company / account to pursue. Keyed by domain (the natural key the
 * connectors all accept). Deterministic connector output, never model output.
 */
export const LeadSchema = z.object({
  domain: z.string().min(1),
  companyName: z.string().min(1),
  industry: z.string().optional(),
  /** Free-text headcount band, e.g. "11-50". Connectors disagree on format. */
  size: z.string().optional(),
  description: z.string().optional(),
  source: SourceSchema,
});
export type Lead = z.infer<typeof LeadSchema>;

/**
 * Contact — a person at a Lead. `leadDomain` is the foreign key back to a Lead.
 * Email is optional because people-search often precedes enrichment.
 */
export const ContactSchema = z.object({
  name: z.string().min(1),
  leadDomain: z.string().min(1),
  email: z.string().email().optional(),
  title: z.string().optional(),
  linkedin: z.string().url().optional(),
  source: SourceSchema,
});
export type Contact = z.infer<typeof ContactSchema>;

/**
 * Enrichment — additional structured data attached to a Lead or Contact by a
 * connector. `data` is an open bag (each provider returns a different shape);
 * the typed fields below are the normalized subset the pipeline relies on.
 */
export const EnrichmentSchema = z.object({
  /** What this enrichment is attached to. */
  subjectType: z.enum(["lead", "contact"]),
  /** Natural key of the subject: a domain (lead) or an email (contact). */
  subjectKey: z.string().min(1),
  provider: SourceSchema,
  /** Normalized highlights the scorer/draft seam reads. */
  funding: z
    .object({
      lastRound: z.string().optional(),
      totalRaisedUsd: z.number().nonnegative().optional(),
      lastRoundDate: z.string().optional(),
      investors: z.array(z.string()).optional(),
    })
    .optional(),
  verifiedEmail: z.string().email().optional(),
  phone: z.string().optional(),
  /** Raw provider payload, retained for audit; never trusted as schema. */
  data: z.record(z.string(), z.unknown()).default({}),
  fetchedAt: z.string().datetime(),
});
export type Enrichment = z.infer<typeof EnrichmentSchema>;

/**
 * Message — drafted outreach. This is MODEL OUTPUT and is the most dangerous
 * thing in the system: it goes out under the customer's domain. It must pass
 * the validator (and, in production, the eval gate) before it is recorded.
 */
export const MessageSchema = z.object({
  /** FK to the Contact this message is for (email if known, else name@domain). */
  contactKey: z.string().min(1),
  channel: z.enum(["email", "linkedin"]),
  subject: z.string().optional(),
  body: z.string().min(1),
  cta: z.string().min(1),
  /** 0-100 fit score the model assigned at the score() seam. */
  fitScore: z.number().min(0).max(100).optional(),
  /** Provenance: which model + prompt version produced this. */
  model: z.string().min(1),
  promptVersion: z.string().min(1),
  createdAt: z.string().datetime(),
});
export type Message = z.infer<typeof MessageSchema>;

export const RunStatusSchema = z.enum([
  "pending",
  "researched",
  "enriched",
  "drafted",
  "complete",
  "failed",
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

/**
 * CampaignRun — THE system of record. One run of research → enrich → outreach
 * for one ICP across a domain list. Everything that becomes durable lives here.
 */
export const CampaignRunSchema = z.object({
  /** Caller-supplied or generated run id (no Date.now/random inside core). */
  id: z.string().min(1),
  schemaVersion: z.literal(SCHEMA_VERSION),
  icp: z.string().min(1),
  domains: z.array(z.string().min(1)),
  /** Model + provider that ran the LLM seams. */
  provider: z.string().min(1),
  model: z.string().min(1),
  status: RunStatusSchema,
  leads: z.array(LeadSchema).default([]),
  contacts: z.array(ContactSchema).default([]),
  enrichments: z.array(EnrichmentSchema).default([]),
  messages: z.array(MessageSchema).default([]),
  /** Cumulative spend across LLM seams, if metered. */
  costUsd: z.number().nonnegative().optional(),
  /** Names of connectors that were skipped (no key / unsupported) this run. */
  skippedConnectors: z.array(z.string()).default([]),
  createdAt: z.string().datetime(),
  finishedAt: z.string().datetime().optional(),
});
export type CampaignRun = z.infer<typeof CampaignRunSchema>;

/** Convenience map of every schema, for the validator and eval scorers. */
export const SCHEMAS = {
  Lead: LeadSchema,
  Contact: ContactSchema,
  Enrichment: EnrichmentSchema,
  Message: MessageSchema,
  CampaignRun: CampaignRunSchema,
} as const;
