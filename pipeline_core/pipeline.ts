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
import type { Contact, Enrichment, Lead } from "./models.js";

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
      raw[connector.name] = { error: String(err) };
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
      raw[connector.name] = { error: String(err) };
      skipped.push(connector.name);
    }
  }

  return { enrichments, ran, skipped, raw };
}
