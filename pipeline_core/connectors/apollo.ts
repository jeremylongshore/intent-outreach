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
 *
 * Resilience: responses are safeParsed against tolerant schemas; a 404/422 on
 * bulk_match is "no matches"; contacts with "(unknown)"/single-token names are
 * never sent to bulk_match (they cannot match and burn credits).
 * PII: enrichment `data` keeps a B2B allowlist; mobile/home phones are dropped.
 *
 * TODO(live-doc verification): the people-search request shape
 * (q_organization_domains + q_keywords on mixed_people/api_search) has not been
 * re-verified against current Apollo docs.
 */

import { z } from "zod";
import { httpJson } from "../http.js";
import { hasSecret } from "../secrets.js";
import type { Contact, Enrichment, Lead } from "../models.js";
import { normalizeDomain } from "./_domain.js";
import { eligibleContacts, isAuthFailure, isNotFound } from "./_per-item.js";
import { keepRawOptIn, parseVendor, pickAllowed, useSecret } from "./_shared.js";
import type {
  Connector,
  ConnectorItemFailure,
  EnrichInput,
  EnrichOutput,
  ResearchInput,
  ResearchOutput,
} from "./types.js";

const BASE = "https://api.apollo.io/api/v1";
const KEY_ENV = "APOLLO_API_KEY";

function headers(): Record<string, string> {
  return { "X-Api-Key": useSecret(KEY_ENV) };
}

// ---- tolerant vendor schemas -------------------------------------------------

const ApolloOrgSchema = z
  .object({
    name: z.string().nullish(),
    website_url: z.string().nullish(),
    primary_domain: z.string().nullish(),
    industry: z.string().nullish(),
    estimated_num_employees: z.number().nullish(),
    short_description: z.string().nullish(),
  })
  .passthrough();
type ApolloOrg = z.infer<typeof ApolloOrgSchema>;

const ApolloPhoneSchema = z
  .object({ raw_number: z.string().nullish(), type: z.string().nullish() })
  .passthrough();

const ApolloPersonSchema = z
  .object({
    name: z.string().nullish(),
    first_name: z.string().nullish(),
    last_name: z.string().nullish(),
    title: z.string().nullish(),
    linkedin_url: z.string().nullish(),
    email: z.string().nullish(),
    phone_numbers: z.array(ApolloPhoneSchema).nullish(),
    organization: ApolloOrgSchema.nullish(),
  })
  .passthrough();
type ApolloPerson = z.infer<typeof ApolloPersonSchema>;

const OrgSearchSchema = z
  .object({
    organizations: z.array(ApolloOrgSchema).nullish(),
    organization: ApolloOrgSchema.nullish(),
  })
  .passthrough();
const PeopleSearchSchema = z
  .object({ people: z.array(ApolloPersonSchema).nullish() })
  .passthrough();
const BulkMatchSchema = z
  .object({ matches: z.array(ApolloPersonSchema.nullable()).nullish() })
  .passthrough();

/** B2B fields kept in enrichment `data`. */
const APOLLO_PERSON_ALLOW = [
  "name",
  "first_name",
  "last_name",
  "title",
  "headline",
  "seniority",
  "departments",
  "email",
  "email_status",
  "linkedin_url",
  "organization_id",
  "organization_name",
] as const;
const APOLLO_ORG_ALLOW = [
  "name",
  "primary_domain",
  "website_url",
  "industry",
  "estimated_num_employees",
  "linkedin_url",
  "total_funding",
  "latest_funding_stage",
  "latest_funding_round_date",
] as const;

/** Phone types that are personal — never kept. */
const PERSONAL_PHONE = /mobile|home|personal/i;

/** The contact name an Apollo match belongs to: the requested name, else the vendor's. */
function contactNameOf(requested: string | undefined, p: ApolloPerson): string | undefined {
  const vendor = p.name?.trim() || [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return requested?.trim() || vendor || undefined;
}

function workPhone(p: ApolloPerson): string | undefined {
  const hit = (p.phone_numbers ?? []).find(
    (n) => n.raw_number && !(n.type && PERSONAL_PHONE.test(n.type)),
  );
  return hit?.raw_number ?? undefined;
}

function minimizePerson(p: ApolloPerson): Record<string, unknown> {
  if (keepRawOptIn()) return { ...p };
  const out = pickAllowed(p as Record<string, unknown>, APOLLO_PERSON_ALLOW);
  if (p.organization) out.organization = pickAllowed(p.organization as Record<string, unknown>, APOLLO_ORG_ALLOW);
  const phone = workPhone(p);
  if (phone) out.phone = phone;
  return out;
}

function orgToLead(org: ApolloOrg, fallbackDomain: string): Lead {
  return {
    domain:
      normalizeDomain(org.primary_domain) ?? normalizeDomain(org.website_url) ?? fallbackDomain,
    companyName: org.name ?? fallbackDomain,
    industry: org.industry ?? undefined,
    size:
      org.estimated_num_employees !== undefined && org.estimated_num_employees !== null
        ? String(org.estimated_num_employees)
        : undefined,
    description: org.short_description ?? undefined,
    source: "apollo",
  };
}

function personToContact(p: ApolloPerson, domain: string): Contact {
  const name = p.name ?? [p.first_name, p.last_name].filter(Boolean).join(" ");
  return {
    name: name || "(unknown)",
    leadDomain: domain,
    email: p.email && p.email.includes("@") ? p.email : undefined,
    title: p.title ?? undefined,
    linkedin: p.linkedin_url ?? undefined,
    source: "apollo",
  };
}

export const apolloConnector: Connector = {
  name: "apollo",
  displayName: "Apollo.io",
  tier: "free",
  keyEnvVar: KEY_ENV,
  phases: ["research", "enrich"],
  note: "Credential required; check current provider access and quota terms. Covers company, people, and enrichment.",

  isConfigured() {
    return hasSecret(KEY_ENV);
  },

  async research({ domain, icp, signal }: ResearchInput): Promise<ResearchOutput> {
    // 1) Company lookup by domain.
    const orgRes = parseVendor(
      OrgSearchSchema,
      await httpJson(`${BASE}/organizations/api_search`, {
        signal,
        method: "POST",
        headers: headers(),
        json: { q_organization_domains: [domain], per_page: 1 },
      }),
    );
    const org: ApolloOrg = orgRes.organization ?? orgRes.organizations?.[0] ?? { primary_domain: domain };
    const lead = orgToLead(org, domain);

    // 2) People at that company, biased by the ICP keywords.
    const peopleRes = parseVendor(
      PeopleSearchSchema,
      await httpJson(`${BASE}/mixed_people/api_search`, {
        signal,
        method: "POST",
        headers: headers(),
        json: { q_organization_domains: [domain], q_keywords: icp, per_page: 10 },
      }),
    );
    const people = peopleRes.people ?? [];
    const contacts = people.map((p) => personToContact(p, lead.domain));

    return {
      leads: [lead],
      contacts,
      raw: keepRawOptIn()
        ? { org: orgRes, people: peopleRes }
        : { org: pickAllowed(org as Record<string, unknown>, APOLLO_ORG_ALLOW), people: people.length },
    };
  },

  async enrich({ lead, contacts, signal }: EnrichInput): Promise<EnrichOutput> {
    // Enrich contacts missing an email (verified email/phone consume credits).
    // bulk_match is name-keyed: unmatched-able names are filtered out first.
    const needy = eligibleContacts(contacts, 10, { filter: (c) => !c.email });
    if (needy.length === 0) return { enrichments: [] };

    const failures: ConnectorItemFailure[] = [];
    let matches: (ApolloPerson | null)[] = [];
    try {
      const res = parseVendor(
        BulkMatchSchema,
        await httpJson(`${BASE}/people/bulk_match`, {
          signal,
          method: "POST",
          headers: headers(),
          json: {
            details: needy.map((c) => ({ name: c.name, domain: lead.domain })),
            reveal_personal_emails: false,
          },
        }),
      );
      matches = res.matches ?? [];
    } catch (err) {
      if (isAuthFailure(err) || !isNotFound(err)) throw err;
      // 404/422 → no matches.
    }

    const now = new Date().toISOString();
    // bulk_match returns `matches` index-aligned with `details` (null = no match),
    // so the requested contact's name is the back-reference; fall back to the
    // vendor's own name only if the arrays are not aligned.
    const aligned = matches.length === needy.length;
    const enrichments: Enrichment[] = matches
      .map((m, i) => ({ m, requested: aligned ? needy[i]?.name : undefined }))
      .filter((x): x is { m: ApolloPerson; requested: string | undefined } =>
        Boolean(x.m && x.m.email && x.m.email.includes("@")),
      )
      .map(({ m, requested }) => {
        const contactName = contactNameOf(requested, m);
        return {
          subjectType: "contact" as const,
          subjectKey: m.email!,
          provider: "apollo",
          verifiedEmail: m.email!,
          ...(contactName ? { contactName } : {}),
          phone: workPhone(m),
          data: minimizePerson(m),
          fetchedAt: now,
        };
      });

    return {
      enrichments,
      failures,
      raw: keepRawOptIn() ? { matches } : { matched: enrichments.length, failures },
    };
  },
};
