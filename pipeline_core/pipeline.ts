/**
 * pipeline_core/pipeline.ts — DETERMINISTIC research → enrich orchestration.
 *
 * Karpathy's point made concrete: the LLM does NOT choose which connector runs.
 * This file iterates the configured connectors in fixed registration order and
 * aggregates their output. Same input + same configured connectors ⇒ identical
 * connector call sequence every run (017-AT-DECR acceptance #6).
 *
 * The LLM seam (score + draft) lives in ./seam.ts and is layered on top by
 * runCampaign() — the connectors stay deterministic glue.
 */

import {
  getConfiguredConnectors,
  getSkippedConnectors,
  registerBuiltinConnectors,
} from "./connectors/index.js";
import { HttpError } from "./http.js";
import { SCHEMA_VERSION } from "./models.js";
import type { CampaignRun, Contact, Enrichment, Lead, Message } from "./models.js";
import { assertCampaignRun, validateMessage, type Validated } from "./validator.js";
import { getProvider, type LLMProvider } from "./providers.js";
import { CostMeter } from "./cost.js";
import { draftMessage, scoreLead } from "./seam.js";

export interface ResearchResult {
  leads: Lead[];
  contacts: Contact[];
  /** Connectors that ran, in call order — the determinism witness. */
  ran: string[];
  /** Configured-but-failed or unconfigured connectors, for the audit trail. */
  skipped: string[];
  raw: Record<string, unknown>;
}

export interface EnrichResult {
  enrichments: Enrichment[];
  ran: string[];
  skipped: string[];
  raw: Record<string, unknown>;
}

/** Merge leads by domain (first non-empty field wins; sources concatenated). */
function dedupeLeads(leads: Lead[]): Lead[] {
  const byDomain = new Map<string, Lead>();
  for (const lead of leads) {
    const existing = byDomain.get(lead.domain);
    if (!existing) {
      byDomain.set(lead.domain, { ...lead });
    } else {
      byDomain.set(lead.domain, {
        ...existing,
        companyName: existing.companyName || lead.companyName,
        industry: existing.industry ?? lead.industry,
        size: existing.size ?? lead.size,
        description: existing.description ?? lead.description,
      });
    }
  }
  return [...byDomain.values()];
}

/** Dedupe contacts by email when known, else by name+domain. */
function dedupeContacts(contacts: Contact[]): Contact[] {
  const byKey = new Map<string, Contact>();
  for (const c of contacts) {
    const key = c.email ?? `${c.name.toLowerCase()}@${c.leadDomain}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...c });
    } else {
      byKey.set(key, {
        ...existing,
        email: existing.email ?? c.email,
        title: existing.title ?? c.title,
        linkedin: existing.linkedin ?? c.linkedin,
      });
    }
  }
  return [...byKey.values()];
}

/**
 * Research one domain across every configured research connector, in order.
 * A connector that throws is recorded as skipped and does not abort the run.
 */
export async function runResearch(domain: string, icp: string): Promise<ResearchResult> {
  registerBuiltinConnectors();
  const connectors = getConfiguredConnectors("research");
  const leads: Lead[] = [];
  const contacts: Contact[] = [];
  const raw: Record<string, unknown> = {};
  const ran: string[] = [];
  const skipped = getSkippedConnectors("research").map((c) => c.name);

  for (const connector of connectors) {
    if (!connector.research) continue;
    try {
      const out = await connector.research({ domain, icp });
      leads.push(...out.leads);
      contacts.push(...out.contacts);
      raw[connector.name] = out.raw;
      ran.push(connector.name);
    } catch (err) {
      // Store only a sanitized status — never String(err), which can carry a
      // secret-bearing URL (redacted at the HttpError seam, sanitized again here).
      raw[connector.name] = {
        failed: true,
        status: err instanceof HttpError ? err.status : "error",
      };
      skipped.push(connector.name);
    }
  }

  return { leads: dedupeLeads(leads), contacts: dedupeContacts(contacts), ran, skipped, raw };
}

/**
 * Enrich a lead + its contacts across every configured enrich connector, in order.
 */
export async function runEnrich(lead: Lead, contacts: Contact[]): Promise<EnrichResult> {
  registerBuiltinConnectors();
  const connectors = getConfiguredConnectors("enrich");
  const enrichments: Enrichment[] = [];
  const raw: Record<string, unknown> = {};
  const ran: string[] = [];
  const skipped = getSkippedConnectors("enrich").map((c) => c.name);

  for (const connector of connectors) {
    if (!connector.enrich) continue;
    try {
      const out = await connector.enrich({ lead, contacts });
      enrichments.push(...out.enrichments);
      raw[connector.name] = out.raw;
      ran.push(connector.name);
    } catch (err) {
      // Store only a sanitized status — never String(err), which can carry a
      // secret-bearing URL (redacted at the HttpError seam, sanitized again here).
      raw[connector.name] = {
        failed: true,
        status: err instanceof HttpError ? err.status : "error",
      };
      skipped.push(connector.name);
    }
  }

  return { enrichments, ran, skipped, raw };
}

// ──────────────────────────────────────────────────────────────────────────
// runCampaign — the full deterministic-control-flow pipeline with the LLM seam.
// research → enrich → SCORE (llm) → DRAFT (llm) → VALIDATE → CampaignRun.
// ──────────────────────────────────────────────────────────────────────────

export interface RunCampaignInput {
  /** Caller-supplied run id (no Date.now/random in core). */
  id: string;
  icp: string;
  domains: string[];
  channel?: "email" | "linkedin";
  /** Skip drafting for leads scoring below this (0–100). Default 0 = draft all. */
  minScore?: number;
  /** Contacts to draft per lead. Default 1. */
  maxContactsPerLead?: number;
  /** Injected provider (tests/evals). Default: getProvider() from env (eval-gated). */
  provider?: LLMProvider;
  /** Injected clock for determinism in tests. Default: real wall clock. */
  now?: () => string;
  /** Verbatim tone/length override from a Report Profile. */
  styleOverride?: string;
}

export interface RunCampaignResult {
  run: Validated<CampaignRun>;
  cost: ReturnType<CostMeter["summary"]>;
}

export async function runCampaign(input: RunCampaignInput): Promise<RunCampaignResult> {
  const { icp, domains } = input;
  const now = input.now ?? (() => new Date().toISOString());
  const channel = input.channel ?? "email";
  const minScore = input.minScore ?? 0;
  const maxContacts = input.maxContactsPerLead ?? 1;
  const provider = input.provider ?? (await getProvider());
  const meter = new CostMeter();
  const createdAt = now();

  const allLeads: Lead[] = [];
  const allContacts: Contact[] = [];
  const allEnrichments: Enrichment[] = [];
  const messages: Message[] = [];
  const skipped = new Set<string>();
  let anyResearchRan = false;

  for (const domain of domains) {
    const research = await runResearch(domain, icp);
    research.skipped.forEach((s) => skipped.add(s));
    if (research.ran.length > 0) anyResearchRan = true;

    for (const lead of research.leads) {
      const leadContacts = research.contacts.filter((c) => c.leadDomain === lead.domain);
      const enrich = await runEnrich(lead, leadContacts);
      enrich.skipped.forEach((s) => skipped.add(s));

      allLeads.push(lead);
      allContacts.push(...leadContacts);
      allEnrichments.push(...enrich.enrichments);

      // SCORE seam (LLM) — never trusted as a record, only as a routing signal.
      const scored = await scoreLead(provider, {
        icp,
        lead,
        contacts: leadContacts,
        enrichments: enrich.enrichments,
      });
      meter.record(provider.model, scored.usage.inputTokens, scored.usage.outputTokens);
      if (scored.object.fitScore < minScore) continue;

      // DRAFT seam (LLM) — output goes through the validator before it can persist.
      for (const contact of leadContacts.slice(0, maxContacts)) {
        const drafted = await draftMessage(provider, {
          icp,
          lead,
          contact,
          angles: scored.object.angles,
          channel,
          ...(input.styleOverride ? { styleOverride: input.styleOverride } : {}),
        });
        meter.record(provider.model, drafted.usage.inputTokens, drafted.usage.outputTokens);

        const candidate = {
          contactKey: contact.email ?? `${contact.name}@${lead.domain}`,
          channel,
          subject: drafted.object.subject,
          body: drafted.object.body,
          cta: drafted.object.cta,
          fitScore: scored.object.fitScore,
          model: provider.model,
          promptVersion: "outreach.v1",
          createdAt: now(),
        };
        const validated = validateMessage(candidate);
        if (validated.ok) messages.push(validated.value);
      }
    }
  }

  const status: CampaignRun["status"] = messages.length
    ? "complete"
    : allLeads.length
      ? "enriched"
      : anyResearchRan
        ? "researched" // research ran but surfaced no leads — an honest empty result
        : "failed"; // no research connector ran at all (none configured / all skipped)

  // Final gate: the whole record must pass the validator to become a record.
  const run = assertCampaignRun({
    id: input.id,
    schemaVersion: SCHEMA_VERSION,
    icp,
    domains,
    provider: provider.name,
    model: provider.model,
    status,
    leads: dedupeLeads(allLeads),
    contacts: dedupeContacts(allContacts),
    enrichments: allEnrichments,
    messages,
    costUsd: meter.summary().spentUsd,
    skippedConnectors: [...skipped],
    createdAt,
    finishedAt: now(),
  });

  return { run, cost: meter.summary() };
}
