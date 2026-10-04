/**
 * pipeline_core/connectors/peopledatalabs.ts — People Data Labs connector.
 *
 * Bring-your-own provider key. Covers both pipeline
 * phases: company enrich (research) and person enrich (enrich loop by email).
 *
 * Auth: X-Api-Key header. Base: https://api.peopledatalabs.com/v5.
 *
 * Endpoints used:
 *   research:  GET  /company/enrich?website=<domain>
 *              POST /person/search  (Elasticsearch query by company domain)
 *   enrich:    GET  /person/enrich?email=<email>
 *
 * PII: only work emails are used as contact/verified emails (never
 * personal_emails), PDL's unlabeled phone_numbers are not kept, and enrichment
 * `data` is reduced to a B2B allowlist unless INTENT_OUTREACH_KEEP_RAW=1.
 */

import { z } from "zod";
import { httpJson } from "../http.js";
import { hasSecret } from "../secrets.js";
import type { Contact, Enrichment, Lead } from "../models.js";
import { forEachContact, isAuthFailure, isNotFound, toFailure } from "./_per-item.js";
import { parseVendor, pickAllowed, useSecret } from "./_shared.js";
import type {
  ConnectorItemFailure,
  Connector,
  EnrichInput,
  EnrichOutput,
  ResearchInput,
  ResearchOutput,
} from "./types.js";

const BASE = "https://api.peopledatalabs.com/v5";
const KEY_ENV = "PDL_API_KEY";

function headers(): Record<string, string> {
  return { "X-Api-Key": useSecret(KEY_ENV) };
}

// ---- tolerant vendor schemas (all optional, passthrough) ---------------------

const PdlCompanySchema = z
  .object({
    name: z.string().nullish(),
    industry: z.string().nullish(),
    employee_count: z.number().nullish(),
    summary: z.string().nullish(),
    website: z.string().nullish(),
  })
  .passthrough();

/** PDL sometimes wraps company enrich in `data`, sometimes returns bare fields. */
const PdlCompanyResponseSchema = PdlCompanySchema.extend({
  status: z.number().nullish(),
  data: PdlCompanySchema.nullish(),
}).passthrough();

const PdlPersonSchema = z
  .object({
    full_name: z.string().nullish(),
    first_name: z.string().nullish(),
    last_name: z.string().nullish(),
    job_title: z.string().nullish(),
    linkedin_url: z.string().nullish(),
    work_email: z.string().nullish(),
  })
  .passthrough();
type PdlPerson = z.infer<typeof PdlPersonSchema>;

const PdlPersonSearchSchema = z
  .object({
    status: z.number().nullish(),
    data: z.array(PdlPersonSchema).nullish(),
    items: z.array(PdlPersonSchema).nullish(),
  })
  .passthrough();

const PdlPersonEnrichSchema = PdlPersonSchema.extend({
  status: z.number().nullish(),
  data: PdlPersonSchema.nullish(),
}).passthrough();

/** B2B fields kept in enrichment `data` (no personal emails/phones/address/birth). */
const PDL_PERSON_ALLOW = [
  "full_name",
  "first_name",
  "last_name",
  "job_title",
  "job_title_role",
  "job_title_sub_role",
  "job_title_levels",
  "job_company_name",
  "job_company_website",
  "job_company_industry",
  "job_company_size",
  "job_company_linkedin_url",
  "work_email",
  "linkedin_url",
  "industry",
] as const;

/** Work email only — personal_emails are never used for B2B outreach. */
function workEmail(p: PdlPerson): string | undefined {
  return p.work_email && p.work_email.includes("@") ? p.work_email : undefined;
}

export const peopledatalabsConnector: Connector = {
  name: "peopledatalabs",
  displayName: "People Data Labs",
  tier: "free",
  keyEnvVar: KEY_ENV,
  phases: ["research", "enrich"],
  note: "Credential required; check current provider access and quota terms. Structured person & company enrichment.",

  isConfigured() {
    return hasSecret(KEY_ENV);
  },

  async research({ domain, signal }: ResearchInput): Promise<ResearchOutput> {
    const failures: ConnectorItemFailure[] = [];

    // 1) Company enrichment by website domain. A 404/422 (PDL has no company
    // record) must NOT skip person search — people often exist without one.
    let companyRaw: unknown = undefined;
    let co: z.infer<typeof PdlCompanySchema> = {};
    try {
      companyRaw = await httpJson(`${BASE}/company/enrich`, {
        signal,
        query: { website: domain },
        headers: headers(),
      });
      const companyRes = parseVendor(PdlCompanyResponseSchema, companyRaw);
      co = companyRes.data ?? companyRes;
    } catch (err) {
      if (isAuthFailure(err)) throw err;
      if (!isNotFound(err)) failures.push(toFailure(-1, err));
    }

    const lead: Lead = {
      domain,
      companyName: co.name ?? domain,
      industry: co.industry ?? undefined,
      size: typeof co.employee_count === "number" ? String(co.employee_count) : undefined,
      description: co.summary ?? undefined,
      source: "peopledatalabs",
    };

    // 2) Person search: ES query filtering by company website domain, up to 10.
    // Best-effort, but only "no match" (404/422) is silent; anything else is
    // recorded, and a bad key still aborts.
    let contacts: Contact[] = [];
    try {
      const personRes = parseVendor(
        PdlPersonSearchSchema,
        await httpJson(`${BASE}/person/search`, {
          signal,
          method: "POST",
          headers: headers(),
          json: {
            query: { bool: { must: [{ term: { job_company_website: domain } }] } },
            size: 10,
          },
        }),
      );
      const people: PdlPerson[] = personRes.data ?? personRes.items ?? [];
      contacts = people.map((p) => {
        const name =
          p.full_name ?? ([p.first_name, p.last_name].filter(Boolean).join(" ") || "(unknown)");
        return {
          name,
          leadDomain: domain,
          email: workEmail(p),
          title: p.job_title ?? undefined,
          linkedin: p.linkedin_url ?? undefined,
          source: "peopledatalabs",
        };
      });
    } catch (err) {
      if (isAuthFailure(err)) throw err;
      if (!isNotFound(err)) failures.push(toFailure(-1, err));
    }

    return {
      leads: [lead],
      contacts,
      // Company payload is firmographic (no personal data), so it stays in raw.
      raw: { company: companyRaw, failures },
      failures,
    };
  },

  async enrich({ contacts, signal }: EnrichInput): Promise<EnrichOutput> {
    const now = new Date().toISOString();
    // PDL person/enrich is email-keyed, so the contact's name doesn't gate it.
    const { results, failures } = await forEachContact<Enrichment>(
      contacts,
      10,
      async (contact) => {
        const email = contact.email!;
        const res = parseVendor(
          PdlPersonEnrichSchema,
          await httpJson(`${BASE}/person/enrich`, { query: { email }, headers: headers(), signal }),
        );
        const p: PdlPerson = res.data ?? res;
        const verified = workEmail(p) ?? email;
        return {
          subjectType: "contact",
          subjectKey: email,
          provider: "peopledatalabs",
          verifiedEmail: verified.includes("@") ? verified : undefined,
          contactName: contact.name,
          data: pickAllowed(p as Record<string, unknown>, PDL_PERSON_ALLOW),
          fetchedAt: now,
        };
      },
      { requireFullName: false, filter: (c) => Boolean(c.email) },
    );

    return { enrichments: results, failures, raw: { failures } };
  },
};
