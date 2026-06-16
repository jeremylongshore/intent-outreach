/**
 * pipeline_core/connectors/apollo.ts — Apollo.io connector (the workhorse).
 *
 * Apollo is self-serve BYO-key (free 50 credits/mo) and covers company lookup,
 * people search, AND contact enrichment, so it serves both pipeline phases.
 *
 * CORRECTED endpoints/auth per the 2026 connector research (018-DR-LAND):
 *   - People search: POST https://api.apollo.io/api/v1/mixed_people/api_search
 *   - Org search:    POST https://api.apollo.io/api/v1/organizations/api_search
 *   - Org enrich:    POST https://api.apollo.io/api/v1/organizations/enrich
 *   - People enrich: POST https://api.apollo.io/api/v1/people/bulk_match
 *   - Auth header:   X-Api-Key: <key>           (NOT Authorization: Bearer)
 * The legacy `GET /v1/people/search` + Bearer body in the old code was wrong.
 */

import { httpJson } from "../http.js";
import { getSecret, hasSecret } from "../secrets.js";
import type { Contact, Enrichment, Lead } from "../models.js";
import type {
  Connector,
  EnrichInput,
  EnrichOutput,
  ResearchInput,
  ResearchOutput,
} from "./types.js";

const BASE = "https://api.apollo.io/api/v1";
const KEY_ENV = "APOLLO_API_KEY";

function headers(): Record<string, string> {
  return { "X-Api-Key": getSecret(KEY_ENV) };
}

interface ApolloOrg {
  name?: string;
  website_url?: string;
  primary_domain?: string;
  industry?: string;
  estimated_num_employees?: number;
  short_description?: string;
}
interface ApolloPerson {
  name?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  linkedin_url?: string;
  email?: string;
  phone_numbers?: { raw_number?: string }[];
  organization?: ApolloOrg;
}

function orgToLead(org: ApolloOrg, fallbackDomain: string): Lead {
  return {
    domain: org.primary_domain ?? fallbackDomain,
    companyName: org.name ?? fallbackDomain,
    industry: org.industry,
    size:
      org.estimated_num_employees !== undefined
        ? String(org.estimated_num_employees)
        : undefined,
    description: org.short_description,
    source: "apollo",
  };
}

function personToContact(p: ApolloPerson, domain: string): Contact {
  const name = p.name ?? [p.first_name, p.last_name].filter(Boolean).join(" ");
  return {
    name: name || "(unknown)",
    leadDomain: domain,
    email: p.email && p.email.includes("@") ? p.email : undefined,
    title: p.title,
    linkedin: p.linkedin_url,
    source: "apollo",
  };
}

export const apolloConnector: Connector = {
  name: "apollo",
  displayName: "Apollo.io",
  tier: "free",
  keyEnvVar: KEY_ENV,
  phases: ["research", "enrich"],
  note: "Self-serve key; 50 free credits/mo. Covers company, people, and enrichment.",

  isConfigured() {
    return hasSecret(KEY_ENV);
  },

  async research({ domain, icp }: ResearchInput): Promise<ResearchOutput> {
    // 1) Company lookup by domain.
    const orgRes = await httpJson<{ organizations?: ApolloOrg[]; organization?: ApolloOrg }>(
      `${BASE}/organizations/api_search`,
      { method: "POST", headers: headers(), json: { q_organization_domains: [domain], per_page: 1 } },
    );
    const org = orgRes.organization ?? orgRes.organizations?.[0] ?? { primary_domain: domain };
    const lead = orgToLead(org, domain);

    // 2) People at that company, biased by the ICP keywords.
    const peopleRes = await httpJson<{ people?: ApolloPerson[] }>(
      `${BASE}/mixed_people/api_search`,
      {
        method: "POST",
        headers: headers(),
        json: { q_organization_domains: [domain], q_keywords: icp, per_page: 10 },
      },
    );
    const contacts = (peopleRes.people ?? []).map((p) => personToContact(p, lead.domain));

    return { leads: [lead], contacts, raw: { org: orgRes, people: peopleRes } };
  },

  async enrich({ lead, contacts }: EnrichInput): Promise<EnrichOutput> {
    // Enrich contacts missing an email (verified email/phone consume credits).
    const needy = contacts.filter((c) => !c.email).slice(0, 10);
    if (needy.length === 0) return { enrichments: [] };

    const res = await httpJson<{ matches?: ApolloPerson[] }>(`${BASE}/people/bulk_match`, {
      method: "POST",
      headers: headers(),
      json: {
        details: needy.map((c) => ({ name: c.name, domain: lead.domain })),
        reveal_personal_emails: false,
      },
    });

    const now = new Date().toISOString();
    const enrichments: Enrichment[] = (res.matches ?? [])
      .filter((m): m is ApolloPerson => Boolean(m && m.email))
      .map((m) => ({
        subjectType: "contact" as const,
        subjectKey: m.email!,
        provider: "apollo",
        verifiedEmail: m.email,
        phone: m.phone_numbers?.[0]?.raw_number,
        data: m as Record<string, unknown>,
        fetchedAt: now,
      }));

    return { enrichments, raw: res };
  },
};
