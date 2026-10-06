/**
 * pipeline_core/models.ts — framework-free value types for Intent Outreach.
 *
 * Hickey step zero: the data model exists BEFORE the pipeline. These are pure
 * zod value types. No http, no cloud, no provider, no I/O imports here — this
 * module is CI-guarded to stay framework-free (see .github/workflows/policy.yml).
 *
 * Five B2B value types: Lead, Contact, Enrichment, Message, CampaignRun. Schema
 * v6 adds the property/owner model for real estate packs: Property, Party,
 * Ownership, EntityLink and ContactPoint, every vendor value carried as a Fact
 * with provenance and license terms, plus the typed ResearchQuery.
 * CampaignRun is the system of record. The probabilistic system (the LLM) must
 * never write it directly — everything passes through validator.ts first.
 */

import { z } from "zod";

/**
 * Bump on any breaking change to a schema below. Persisted on every record.
 *
 * v2 added `vertical` + `blockedContacts` (both additive, both defaulted). The
 * schemaVersion field is a UNION of all live versions — NOT a single literal — so
 * old v1 JSONL still passes re-validation on read (store.ts re-validates every
 * line). New writes emit the latest version; never narrow this back to one literal.
 */
export const SCHEMA_VERSION = 6 as const;
/**
 * Every schema version a stored record may legitimately carry. The CampaignRun
 * `schemaVersion` union is DERIVED from this list (see SchemaVersionSchema), so
 * adding a version here is the one edit — the two can never drift.
 *
 * v3 added `errors`, `rejectedDrafts`, `failedConnectors` (all defaulted) and the
 * "partial" run status. Additive: every v1/v2 line still parses.
 *
 * v4 added `complianceWarnings` on CampaignRun and `needsSenderIdentity` on
 * Message (both defaulted) for the code-appended CAN-SPAM footer. Additive.
 *
 * v5 added `promptRefs` (score + draft prompt provenance, defaulted {}),
 * `droppedAngles` (defaulted []) and the optional `origin` ("pipeline" for
 * runCampaign, "agent" for the MCP save_run path). Additive: v1–v4 still parse.
 *
 * v6 added the property/owner model (`properties`, `parties`, `ownerships`,
 * `entityLinks`, `contactPoints`, all defaulted []), the optional `queries`
 * (the typed research queries a run executed), the optional `credits`
 * (vendor-credit accounting) and the `sms`, `mail` and `call_script` message
 * channels. Additive: v1–v5 still parse.
 */
export const SUPPORTED_SCHEMA_VERSIONS = [1, 2, 3, 4, 5, 6] as const;
export type SchemaVersion = (typeof SUPPORTED_SCHEMA_VERSIONS)[number];

/** z.union of one literal per supported version — never a single literal. */
const [V_FIRST, V_SECOND, ...V_REST] = SUPPORTED_SCHEMA_VERSIONS;
export const SchemaVersionSchema = z.union([
  z.literal(V_FIRST),
  z.literal(V_SECOND),
  ...V_REST.map((v) => z.literal(v)),
]) as unknown as z.ZodType<SchemaVersion>;

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
  // A LinkedIn handle OR full URL — providers return both shapes, so don't reject
  // an otherwise-valid contact (and thus the whole run) over a non-URL handle.
  linkedin: z.string().optional(),
  source: SourceSchema,
  /**
   * True when the provider withheld the surname (the last token is a lone
   * initial, e.g. "Kristina L"). The contact is kept, but the drafter addresses
   * them by first name only. Optional + additive: older lines simply omit it.
   */
  nameIncomplete: z.boolean().optional(),
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
  /**
   * Optional back-reference to the Contact's `name` when the enrichment found an
   * email for a contact that had none (so `subjectKey` is the NEW email). Lets the
   * pipeline fold the found email into the working contact list. Optional/additive.
   */
  contactName: z.string().min(1).optional(),
  phone: z.string().optional(),
  /** Raw provider payload, retained for audit; never trusted as schema. */
  data: z.record(z.string(), z.unknown()).default({}),
  fetchedAt: z.string().datetime(),
});
export type Enrichment = z.infer<typeof EnrichmentSchema>;

// ── Property / owner model (schema v6) ─────────────────────────────────────
//
// Real estate packs key their world by PARCEL and PERSON, not by company domain.
// These types are the shared shape every property connector maps onto, so a
// pack never inherits the B2B "company keyed by domain" assumption. The B2B
// Lead/Contact types above are untouched; b2b-sdr runs leave these arrays empty.

/** sha256 hex of a raw vendor response body (the evidence behind a Fact). */
const Sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/, "expected a sha256 hex digest");

/**
 * The license a fact was obtained under. `outreachRestricted: true` marks data
 * whose terms forbid using it to contact the person (a send-time gate refuses
 * outreach built on it). Absent fields mean the connector did not declare them,
 * never "unrestricted": a gate may treat an undeclared license as restricted.
 */
export const LicenseTermsSchema = z.object({
  /** Short identifier of the terms, e.g. "dealmachine-tos-2026" or "public-record". */
  id: z.string().min(1).optional(),
  outreachRestricted: z.boolean().optional(),
  /** Days the vendor allows this fact to be retained. */
  retentionDays: z.number().int().positive().optional(),
  /** Required attribution text, if the terms demand one. */
  attribution: z.string().min(1).optional(),
});
export type LicenseTerms = z.infer<typeof LicenseTermsSchema>;

/**
 * Fact — one vendor-supplied value plus where it came from. Every attribute a
 * property connector returns is a Fact, so any value a draft cites can be traced
 * to a source, a fetch time and the hash of the response that carried it.
 */
export function factSchema<T extends z.ZodType>(value: T) {
  return z.object({
    value,
    source: SourceSchema,
    fetchedAt: z.string().datetime(),
    responseHash: Sha256HexSchema.optional(),
    licenseTerms: LicenseTermsSchema.optional(),
  });
}
export const FactSchema = factSchema(z.unknown());
export type Fact<T = unknown> = {
  value: T;
  source: Source;
  fetchedAt: string;
  responseHash?: string;
  licenseTerms?: LicenseTerms;
};

const UsStateSchema = z.string().regex(/^[A-Z]{2}$/, "expected a 2-letter state code");
const CountyFipsSchema = z.string().regex(/^\d{5}$/, "expected a 5-digit county FIPS code");

/** A US postal address as a vendor reports it (not normalized; see suppression for keys). */
export const AddressSchema = z.object({
  line1: z.string().min(1),
  line2: z.string().min(1).optional(),
  city: z.string().min(1),
  state: UsStateSchema,
  zip: z.string().regex(/^\d{5}(?:-\d{4})?$/, "expected ZIP5 or ZIP+4"),
  county: z.string().min(1).optional(),
  countyFips: CountyFipsSchema.optional(),
});
export type Address = z.infer<typeof AddressSchema>;

/** Natural key of a parcel: `<countyFips>:<apn>`. APNs repeat across counties. */
export function propertyKey(countyFips: string, apn: string): string {
  return `${countyFips}:${apn.trim().toUpperCase()}`;
}

/**
 * Property — one parcel. Keyed by county FIPS + APN (assessor parcel number),
 * the only identifier stable across county GIS, data vendors and ERPNext.
 * `attributes` is an open map of Facts (beds, year built, assessed value in
 * cents, flood zone, ...) so a new attribute never needs a schema bump.
 */
export const PropertySchema = z
  .object({
    key: z.string().min(1),
    apn: z.string().min(1),
    countyFips: CountyFipsSchema,
    address: AddressSchema.optional(),
    /** A point on the parcel (centroid or label point), WGS84. Used for flood and other spatial lookups. */
    location: z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }).optional(),
    attributes: z.record(z.string().min(1), FactSchema).default({}),
    source: SourceSchema,
  })
  .refine((p) => p.key === propertyKey(p.countyFips, p.apn), {
    message: "key must equal propertyKey(countyFips, apn)",
    path: ["key"],
  })
  .refine((p) => p.apn === p.apn.trim(), { message: "apn must not carry surrounding whitespace", path: ["apn"] });
export type Property = z.infer<typeof PropertySchema>;

/** Party — an owner or a person behind one: a natural person or a legal entity. */
export const PartySchema = z.object({
  /** Stable id within the run, e.g. "person:<connector-id>" or "entity:AL:000123456". */
  key: z.string().min(1),
  kind: z.enum(["person", "entity"]),
  name: z.string().min(1),
  /** For entities only. */
  entityType: z.enum(["llc", "corporation", "trust", "estate", "partnership", "government", "other"]).optional(),
  mailingAddress: AddressSchema.optional(),
  source: SourceSchema,
  /**
   * Terms of the record this party (and its mailing address) came from. A
   * property pack may write to a party only when `outreachRestricted` is
   * explicitly false; absent or undeclared is treated as restricted.
   */
  licenseTerms: LicenseTermsSchema.optional(),
});
export type Party = z.infer<typeof PartySchema>;

/** Ownership — a party holds (a share of) a property. Many-to-many. */
export const OwnershipSchema = z.object({
  propertyKey: z.string().min(1),
  partyKey: z.string().min(1),
  /** Fraction held, 0 < share <= 1, when the record states it. */
  share: z.number().gt(0).lte(1).optional(),
  role: z.enum(["owner", "co-owner", "trustee", "life-tenant"]).default("owner"),
  /** Recording or deed date (ISO date), when known. */
  asOf: z.string().date().optional(),
  source: SourceSchema,
  fetchedAt: z.string().datetime(),
});
export type Ownership = z.infer<typeof OwnershipSchema>;

/**
 * EntityLink — resolves an entity owner (an LLC) to a person behind it, from a
 * registry such as a Secretary of State filing. Confidence is explicit because
 * name matches are probabilistic; a pack decides the threshold to act on.
 */
export const EntityLinkSchema = z.object({
  entityKey: z.string().min(1),
  personKey: z.string().min(1),
  role: z.enum(["member", "manager", "officer", "registered-agent", "organizer", "other"]),
  confidence: z.number().min(0).max(1),
  source: SourceSchema,
  fetchedAt: z.string().datetime(),
});
export type EntityLink = z.infer<typeof EntityLinkSchema>;

/**
 * DNC status of a phone contact point. Defaults to "unknown", which every gate
 * must treat as do-not-contact (fail closed); only a scrub sets "clean".
 */
export const DncStatusSchema = z.enum(["clean", "listed", "unknown"]);

/**
 * ContactPoint — one way to reach a party: a phone, an email or a mailing
 * address. Channel-level facts the send-time check needs (line type, DNC
 * status, when it was verified) live here, not on the party.
 */
export const ContactPointSchema = z
  .object({
    partyKey: z.string().min(1),
    kind: z.enum(["phone", "email", "mail"]),
    /** E.164 phone, email address, or a one-line mailing address. */
    value: z.string().min(1),
    /** Phones only. "unknown" means the line type was not established. */
    lineType: z.enum(["mobile", "landline", "voip", "unknown"]).optional(),
    /** Phones only; defaults to "unknown" (fail closed). */
    dnc: DncStatusSchema.default("unknown"),
    source: SourceSchema,
    fetchedAt: z.string().datetime(),
    verifiedAt: z.string().datetime().optional(),
    licenseTerms: LicenseTermsSchema.optional(),
  })
  .refine((c) => c.kind !== "phone" || /^\+[1-9]\d{9,14}$/.test(c.value), {
    message: "a phone contact point must be E.164",
    path: ["value"],
  })
  .refine((c) => c.kind !== "email" || z.string().email().safeParse(c.value).success, {
    message: "an email contact point must be a valid email",
    path: ["value"],
  });
export type ContactPoint = z.infer<typeof ContactPointSchema>;

/**
 * ResearchQuery — what a research call is asked. B2B runs ask by company
 * domain; property packs ask by area (geography + buy-box filters compiled
 * from the pack) or by one parcel. Connectors declare which kinds they accept,
 * so a domain connector is never handed a parcel query.
 */
export const ResearchQuerySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("domain"), domain: z.string().min(1) }),
  z.object({
    kind: z.literal("area"),
    geography: z
      .object({
        state: UsStateSchema.optional(),
        countyFips: z.array(CountyFipsSchema).optional(),
        zips: z.array(z.string().regex(/^\d{5}$/)).optional(),
      })
      .refine((g) => Boolean(g.state || g.countyFips?.length || g.zips?.length), {
        message: "an area query needs a state, county FIPS codes or ZIPs",
      }),
    /** Pack buy-box filters, already compiled to plain values. */
    filters: z.record(z.string().min(1), z.unknown()).default({}),
  }),
  z
    .object({
      kind: z.literal("parcel"),
      countyFips: CountyFipsSchema.optional(),
      apn: z.string().min(1).optional(),
      address: AddressSchema.optional(),
    })
    .refine((q) => Boolean((q.countyFips && q.apn) || q.address), {
      message: "a parcel query needs countyFips + apn, or an address",
    }),
]);
export type ResearchQuery = z.infer<typeof ResearchQuerySchema>;
export type ResearchQueryKind = ResearchQuery["kind"];

/**
 * Outreach channels. `email` and `linkedin` are the B2B channels; `sms`, `mail`
 * and `call_script` (a script a human caller reads; the engine never dials) are
 * the property-pack channels, each with its own footer and send-time rules.
 */
export const CHANNELS = ["email", "linkedin", "sms", "mail", "call_script"] as const;
export const ChannelSchema = z.enum(CHANNELS);
export type Channel = z.infer<typeof ChannelSchema>;

/**
 * Message — drafted outreach. This is MODEL OUTPUT and is the most dangerous
 * thing in the system: it goes out under the customer's domain. It must pass
 * the validator (and, in production, the eval gate) before it is recorded.
 */
export const MessageSchema = z.object({
  /** FK to the Contact this message is for (email if known, else name@domain). */
  contactKey: z.string().min(1),
  channel: ChannelSchema,
  subject: z.string().optional(),
  body: z.string().min(1),
  cta: z.string().min(1),
  /** 0-100 fit score the model assigned at the score() seam. */
  fitScore: z.number().min(0).max(100).optional(),
  /** Provenance: which model + prompt version produced this. */
  model: z.string().min(1),
  promptVersion: z.string().min(1),
  createdAt: z.string().datetime(),
  /**
   * True when the channel's required sender identity was not configured, so its
   * footer could NOT be appended: name + company + postal address for email and
   * mail, name + company for sms and call_script. Such a draft must not be sent
   * as-is. Additive (v4); defaults false.
   */
  needsSenderIdentity: z.boolean().default(false),
  /** Property campaigns (v6, optional): the parcel this letter is about. */
  propertyKey: z.string().min(1).optional(),
});
export type Message = z.infer<typeof MessageSchema>;

// Every value here is actually produced by runCampaign (no dead states):
// researched (research ran, no leads/enrichment beyond), enriched (leads+enrichment,
// no drafts), complete (drafts produced, nothing errored), partial (≥1 draft, but
// some lead/contact errored or a draft was rejected — v3, additive), failed (no
// connector ran at all, or every LLM/gate step errored and nothing drafted).
// Extending this enum is additive: every older value still parses.
export const RunStatusSchema = z.enum(["researched", "enriched", "complete", "partial", "failed"]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

/**
 * Statuses that pre-dd46601b v1 records may carry. That commit pruned them from
 * the enum WITHOUT bumping schemaVersion, so old v1 lines with "pending" or
 * "drafted" stopped parsing (invariant 6 violation). They are READ-only: the
 * stored value is kept verbatim (we never rewrite an audit record's status),
 * and the writer never produces them — deriveRunStatus returns RunStatus only.
 */
export const LEGACY_RUN_STATUSES = ["pending", "drafted"] as const;
export const LegacyRunStatusSchema = z.enum(LEGACY_RUN_STATUSES);
/** What a stored record's `status` may be: a live status or a legacy v1 one. */
export const StoredRunStatusSchema = z.union([RunStatusSchema, LegacyRunStatusSchema]);
export type StoredRunStatus = z.infer<typeof StoredRunStatusSchema>;

/** Pipeline stage a per-lead failure happened in. */
export const RunErrorStageSchema = z.enum(["score", "gate", "draft"]);

export const RunErrorSchema = z
  .object({
    /** The lead's domain (company campaigns). */
    domain: z.string().min(1).optional(),
    /** The parcel's `<countyFips>:<apn>` (property campaigns, v6). */
    propertyKey: z.string().min(1).optional(),
    contactKey: z.string().min(1).optional(),
    stage: RunErrorStageSchema,
    /** Sanitized, truncated error message (secrets redacted). */
    message: z.string(),
    /** AI SDK finish reason when the error carried one (e.g. "length"). */
    finishReason: z.string().optional(),
  })
  .refine((e) => e.domain !== undefined || e.propertyKey !== undefined, {
    message: "a run error needs a domain or a propertyKey",
  });
export type RunError = z.infer<typeof RunErrorSchema>;

export const FailedConnectorSchema = z.object({
  name: z.string().min(1),
  phase: z.enum(["research", "enrich"]),
  /** HTTP status, "timeout", or "error". */
  status: z.union([z.number().int(), z.string().min(1)]),
});
export type FailedConnector = z.infer<typeof FailedConnectorSchema>;

/**
 * CampaignRun — THE system of record. One run of research → enrich → outreach
 * for one ICP across a domain list. Everything that becomes durable lives here.
 */
export const CampaignRunSchema = z.object({
  /** Caller-supplied or generated run id (no Date.now/random inside core). */
  id: z.string().min(1),
  // UNION, not z.literal(SCHEMA_VERSION): a re-literal would silently REJECT every
  // existing v1 line on read (store.ts re-validates each line). New writes emit
  // SCHEMA_VERSION; old lines still parse. This is the "old JSONL survives" guarantee.
  schemaVersion: SchemaVersionSchema,
  icp: z.string().min(1),
  domains: z.array(z.string().min(1)),
  /** Which pack produced this run. Defaults so v1 lines (no field) still parse. */
  vertical: z.string().min(1).default("b2b-sdr"),
  /** Model + provider that ran the LLM seams. */
  provider: z.string().min(1),
  model: z.string().min(1),
  status: StoredRunStatusSchema,
  leads: z.array(LeadSchema).default([]),
  contacts: z.array(ContactSchema).default([]),
  enrichments: z.array(EnrichmentSchema).default([]),
  messages: z.array(MessageSchema).default([]),
  /** Cumulative spend across LLM seams, if metered. */
  costUsd: z.number().nonnegative().optional(),
  /** Names of connectors that were skipped (no key / unsupported) this run. */
  skippedConnectors: z.array(z.string()).default([]),
  /**
   * Contacts the pack's compliance gate blocked before drafting — the audit trail
   * for "did not contact, and why". Always empty for b2b-sdr (no-op gate); the
   * append-only RunStore IS the compliance record for verticals that do block.
   */
  blockedContacts: z
    .array(
      z.object({
        contactKey: z.string().min(1),
        reason: z.string().min(1),
        /** Property campaigns (v6): the parcel the block was about. */
        propertyKey: z.string().min(1).optional(),
      }),
    )
    .default([]),
  /**
   * Per-lead/contact failures that were ISOLATED instead of aborting the run (v3).
   * A provider error on domain 2 no longer loses domain 1's drafts.
   */
  errors: z.array(RunErrorSchema).default([]),
  /** Drafts the model produced that FAILED validation — kept for audit, never sent (v3). */
  rejectedDrafts: z
    .array(
      z.object({
        contactKey: z.string().min(1),
        issues: z.array(z.string()),
        /** Property campaigns (v6): the parcel the draft was about. */
        propertyKey: z.string().min(1).optional(),
      }),
    )
    .default([]),
  /**
   * Configured connectors that threw (sanitized status only — never the error
   * text, which can carry a secret-bearing URL). `skippedConnectors` is now
   * "not configured" only (v3).
   */
  failedConnectors: z.array(FailedConnectorSchema).default([]),
  /**
   * Run-level compliance warnings that did not block a contact but must be seen
   * before anything is sent — e.g. email drafts produced without a configured
   * sender identity, so no CAN-SPAM footer could be appended (v4, additive).
   */
  complianceWarnings: z.array(z.string()).default([]),
  /**
   * Prompt provenance for the run's LLM seams (v5, additive): each entry is
   * "<prompt-file>@<sha8>". `score` lists the joined score-seam files; `draft` is
   * the draft-seam file. Empty for agent-saved runs (the agent drafted, not a seam).
   */
  promptRefs: z
    .object({
      score: z.array(z.string().min(1)).optional(),
      draft: z.string().min(1).optional(),
    })
    .default({}),
  /**
   * Score-seam angles removed because they cited a fact absent from the inputs
   * (groundAngles) — kept so an operator can see what the model tried (v5).
   */
  droppedAngles: z
    .array(
      z
        .object({
          domain: z.string().min(1).optional(),
          /** Property campaigns (v6). */
          propertyKey: z.string().min(1).optional(),
          angle: z.string(),
          reason: z.string(),
        })
        .refine((d) => d.domain !== undefined || d.propertyKey !== undefined, {
          message: "a dropped angle needs a domain or a propertyKey",
        }),
    )
    .default([]),
  /**
   * Who assembled the record (v5, optional so older lines stay unlabeled rather
   * than mislabeled): "pipeline" = runCampaign; "agent" = the MCP save_run path,
   * where the drafts and the `model` field are caller-claimed.
   */
  origin: z.enum(["pipeline", "agent"]).optional(),
  /** The typed research queries this run executed (v6, optional). */
  queries: z.array(ResearchQuerySchema).optional(),
  /** Vendor-credit accounting when the run had a budget (v6, optional). */
  credits: z
    .object({
      limit: z.number().nonnegative(),
      spent: z.number().nonnegative(),
      exhausted: z.boolean(),
      byConnector: z.record(z.string(), z.number().nonnegative()),
    })
    .optional(),
  /** Property/owner model (v6, additive, defaulted). Empty for b2b-sdr runs. */
  properties: z.array(PropertySchema).default([]),
  parties: z.array(PartySchema).default([]),
  ownerships: z.array(OwnershipSchema).default([]),
  entityLinks: z.array(EntityLinkSchema).default([]),
  contactPoints: z.array(ContactPointSchema).default([]),
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
  Property: PropertySchema,
  Party: PartySchema,
  Ownership: OwnershipSchema,
  EntityLink: EntityLinkSchema,
  ContactPoint: ContactPointSchema,
  ResearchQuery: ResearchQuerySchema,
} as const;
