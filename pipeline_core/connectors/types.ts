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

import type { Contact, Enrichment, Lead } from "../models.js";

/** Pricing/access reality of a connector, surfaced to the user. */
export type ConnectorTier = "free" | "paid" | "enterprise" | "legacy";

/** Which pipeline phase(s) a connector participates in. */
export type ConnectorPhase = "research" | "enrich";

export interface ResearchInput {
  /** Company domain to research. */
  domain: string;
  /** The campaign ICP, for connectors that can filter people by role/seniority. */
  icp: string;
}

export interface ResearchOutput {
  leads: Lead[];
  contacts: Contact[];
  /** Raw provider payload, retained for the audit trail. */
  raw?: unknown;
}

export interface EnrichInput {
  lead: Lead;
  contacts: Contact[];
}

export interface EnrichOutput {
  enrichments: Enrichment[];
  raw?: unknown;
}

export interface Connector {
  /** Unique, stable source name (also stamped on records as `source`). */
  readonly name: string;
  readonly displayName: string;
  readonly tier: ConnectorTier;
  /** Env var holding this connector's key; null = needs no key. */
  readonly keyEnvVar: string | null;
  readonly phases: readonly ConnectorPhase[];
  /** One-line note shown to users (e.g. "requires a pre-2024 key"). */
  readonly note?: string;

  /** True when the connector has what it needs to run (its key, or none needed). */
  isConfigured(): boolean;

  /** Research a domain → partial leads + contacts. Only if phases includes 'research'. */
  research?(input: ResearchInput): Promise<ResearchOutput>;

  /** Enrich a lead + its contacts → enrichments. Only if phases includes 'enrich'. */
  enrich?(input: EnrichInput): Promise<EnrichOutput>;
}
