/**
 * pipeline_core/connectors/types.ts — the connector contract.
 *
 * "Wire it for anything and everything": a connector is one adapter implementing
 * this interface. The deterministic pipeline iterates configured connectors in a
 * fixed order (registry insertion order) and calls them — the LLM never chooses
 * which connector runs. A connector with no key self-skips (isConfigured() ===
 * false), so absent keys are silent skips, never errors.
 *
 * Adding a provider = write an adapter here + register it in ./index.ts. Users
 * can register their own at runtime via registerConnector() — no core edits.
 */

import type {
  Contact,
  ContactPoint,
  Enrichment,
  EntityLink,
  Lead,
  Ownership,
  Party,
  Property,
  ResearchQuery,
  ResearchQueryKind,
} from "../models.js";
import type { RateLimit } from "../rate-limit.js";
import type { Capability } from "../routing.js";

/** Pricing/access reality of a connector, surfaced to the user. */
export type ConnectorTier = "free" | "paid" | "enterprise" | "legacy";

/** Which pipeline phase(s) a connector participates in. */
export type ConnectorPhase = "research" | "enrich";

export interface ResearchInput {
  /**
   * Company domain to research. Set for a `domain` query; empty ("") for an
   * area or parcel query, which a domain-only connector never receives.
   */
  domain: string;
  /**
   * The typed query (schema v6). Always set by the pipeline; a connector that
   * declares only the `domain` kind may keep reading `domain` and ignore it.
   */
  query?: ResearchQuery;
  /** The campaign ICP, for connectors that can filter people by role/seniority. */
  icp: string;
  /**
   * Buyer titles the operator wants reached (profile `filtering.contactTitles` or
   * `--buyer-titles`). Connectors that search people by title should filter/rank
   * by them so paid reveals go to buyers. Absent = no title targeting.
   */
  buyerTitles?: string[];
  /** Per-invocation deadline from the pipeline. Optional; adapters may ignore it
   *  (the pipeline still enforces the deadline by racing the call). */
  signal?: AbortSignal;
}

/**
 * A non-fatal, per-item failure inside one connector call (one contact's lookup
 * failed, or a vendor response failed schema validation). Sanitized: carries an
 * item index + status/reason only — never a URL, key, or PII.
 */
export interface ConnectorItemFailure {
  /** Index into the eligible item list (or -1 for a whole-call response). */
  item: number;
  /** HTTP status when the failure was an HttpError. */
  status?: number;
  /** "http" | "schema" | "error". */
  reason: "http" | "schema" | "error";
  /** Short, secret-free detail (e.g. the zod issue path). */
  detail?: string;
}

export interface ResearchOutput {
  leads: Lead[];
  contacts: Contact[];
  /** Property/owner model (schema v6); property connectors fill these. */
  properties?: Property[];
  parties?: Party[];
  ownerships?: Ownership[];
  entityLinks?: EntityLink[];
  contactPoints?: ContactPoint[];
  /** Raw provider payload, retained for the audit trail. */
  raw?: unknown;
  /** Per-item / schema failures that did not abort the call. */
  failures?: ConnectorItemFailure[];
}

export interface EnrichInput {
  lead: Lead;
  contacts: Contact[];
  /** Buyer titles (see ResearchInput.buyerTitles). Absent = no title targeting. */
  buyerTitles?: string[];
  /** Per-invocation deadline from the pipeline (see ResearchInput.signal). */
  signal?: AbortSignal;
}

export interface EnrichOutput {
  enrichments: Enrichment[];
  raw?: unknown;
  /** Per-item / schema failures that did not abort the call. */
  failures?: ConnectorItemFailure[];
}

export interface Connector {
  /** Unique, stable source name (also stamped on records as `source`). */
  readonly name: string;
  readonly displayName: string;
  readonly tier: ConnectorTier;
  /** Env var holding this connector's key; null = needs no key. */
  readonly keyEnvVar: string | null;
  readonly phases: readonly ConnectorPhase[];
  /** One-line operational note shown to users; avoid time-sensitive pricing claims. */
  readonly note?: string;
  /**
   * True for push-only connectors (e.g. Clay) that hand data off asynchronously
   * and return no records. Such a connector "running" is not evidence that
   * research produced anything; the pipeline may exclude it from "research ran".
   */
  readonly pushOnly?: boolean;
  /**
   * Research query kinds this connector answers. Absent = `["domain"]`, so
   * every existing B2B connector keeps its behavior and is never handed an
   * area or parcel query. The pipeline routes by this list, never the LLM.
   */
  readonly queryKinds?: readonly ResearchQueryKind[];
  /** What this connector can answer (routing vocabulary for Pack v2 `dataSources`). */
  readonly capabilities?: readonly Capability[];
  /**
   * Vendor credits one research or enrich CALL costs, charged against the run's
   * credit budget BEFORE the call. Absent or 0 = free.
   */
  readonly creditsPerCall?: number;
  /** Cache this connector's research output for this long (ms). Absent = never cached. */
  readonly cacheTtlMs?: number;
  /** The vendor's published request limits; pass to httpJson as `rateLimit`. */
  readonly rateLimit?: RateLimit;

  /** True when the connector has what it needs to run (its key, or none needed). */
  isConfigured(): boolean;

  /** Research a domain → partial leads + contacts. Only if phases includes 'research'. */
  research?(input: ResearchInput): Promise<ResearchOutput>;

  /** Enrich a lead + its contacts → enrichments. Only if phases includes 'enrich'. */
  enrich?(input: EnrichInput): Promise<EnrichOutput>;
}
