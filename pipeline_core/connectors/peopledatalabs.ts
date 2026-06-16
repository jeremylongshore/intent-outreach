/**
 * pipeline_core/connectors/peopledatalabs.ts — People Data Labs connector.
 *
 * Self-serve key; 100 free API calls/mo on the free tier. Covers both pipeline
 * phases: company enrich (research) and person enrich (enrich loop by email).
 *
 * Auth: X-Api-Key header. Base: https://api.peopledatalabs.com/v5.
 *
 * Endpoints used:
 *   research:  GET  /company/enrich?website=<domain>
 *              POST /person/search  (Elasticsearch query by company domain)
 *   enrich:    GET  /person/enrich?email=<email>
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

const BASE = "https://api.peopledatalabs.com/v5";
const KEY_ENV = "PDL_API_KEY";

function headers(): Record<string, string> {
  return { "X-Api-Key": getSecret(KEY_ENV) };
}

/** Defensive shape for the PDL company enrich endpoint. */
interface PdlCompany {
  name?: string;
  industry?: string;
  employee_count?: number;
  summary?: string;
  website?: string;
}

/** PDL wraps company enrich in a top-level object; status 200 = found. */
interface PdlCompanyResponse {
  status?: number;
  data?: PdlCompany;
  // Some versions return fields directly at the top level (no `data` wrapper).
  name?: string;
  industry?: string;
  employee_count?: number;
  summary?: string;
}

/** Defensive shape for a person record from PDL person search or enrich. */
interface PdlPerson {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  job_title?: string;
  linkedin_url?: string;
  work_email?: string;
  personal_emails?: string[];
  phone_numbers?: string[];
}

/** PDL person search (POST /person/search) response envelope. */
interface PdlPersonSearchResponse {
  status?: number;
  data?: PdlPerson[];
  // Also common: top-level `items` in some versions.
  items?: PdlPerson[];
  error?: { message?: string };
}

/** PDL person enrich (GET /person/enrich) response envelope. */
interface PdlPersonEnrichResponse {
  status?: number;
  data?: PdlPerson;
  // Some versions return fields at the top level.
  full_name?: string;
  work_email?: string;
  personal_emails?: string[];
  phone_numbers?: string[];
}

/** Pick the first non-empty email from a PDL person record. */
function bestEmail(p: PdlPerson): string | undefined {
  if (p.work_email && p.work_email.includes("@")) return p.work_email;
  const personal = p.personal_emails?.find((e) => e.includes("@"));
  return personal;
}

export const peopledatalabsConnector: Connector = {
  name: "peopledatalabs",
  displayName: "People Data Labs",
  tier: "free",
  keyEnvVar: KEY_ENV,
  phases: ["research", "enrich"],
  note: "Self-serve key; 100 free/mo. Structured person & company enrichment.",

  isConfigured() {
    return hasSecret(KEY_ENV);
  },

  async research({ domain }: ResearchInput): Promise<ResearchOutput> {
    // 1) Company enrichment by website domain.
    const companyRes = await httpJson<PdlCompanyResponse>(
      `${BASE}/company/enrich`,
      { query: { website: domain }, headers: headers() },
    );

    // Flatten: PDL sometimes returns a `data` wrapper, sometimes bare fields.
    const co: PdlCompany =
      companyRes.data ??
      {
        name: companyRes.name,
        industry: companyRes.industry,
        employee_count: companyRes.employee_count,
        summary: companyRes.summary,
      };

    const lead: Lead = {
      domain,
      companyName: co.name ?? domain,
      industry: co.industry ?? undefined,
      size:
        typeof co.employee_count === "number"
          ? String(co.employee_count)
          : undefined,
      description: co.summary ?? undefined,
      source: "peopledatalabs",
    };

    // 2) Person search: ES query filtering by company website domain, up to 10.
    let contacts: Contact[] = [];
    try {
      const personRes = await httpJson<PdlPersonSearchResponse>(
        `${BASE}/person/search`,
        {
          method: "POST",
          headers: headers(),
          json: {
            query: {
              bool: {
                must: [{ term: { "job_company_website": domain } }],
              },
            },
            size: 10,
          },
        },
      );

      const people: PdlPerson[] =
        personRes.data ?? personRes.items ?? [];

      contacts = people.map((p) => {
        const name =
          p.full_name ??
          ([p.first_name, p.last_name].filter(Boolean).join(" ") || "(unknown)");
        const email = bestEmail(p);
        return {
          name,
          leadDomain: domain,
          email: email && email.includes("@") ? email : undefined,
          title: p.job_title ?? undefined,
          linkedin: p.linkedin_url ?? undefined,
          source: "peopledatalabs",
        };
      });
    } catch {
      // Person search is best-effort; swallow errors so company lead still returns.
      contacts = [];
    }

    return { leads: [lead], contacts, raw: { company: companyRes } };
  },

  async enrich({ contacts }: EnrichInput): Promise<EnrichOutput> {
    // Enrich contacts that already have an email — PDL person/enrich is email-keyed.
    const withEmail = contacts.filter((c) => c.email).slice(0, 10);
    if (withEmail.length === 0) return { enrichments: [] };

    const now = new Date().toISOString();
    const enrichments: Enrichment[] = [];

    for (const contact of withEmail) {
      const email = contact.email!;
      const res = await httpJson<PdlPersonEnrichResponse>(
        `${BASE}/person/enrich`,
        { query: { email }, headers: headers() },
      );

      // Flatten: same bare-vs-wrapped shape ambiguity as company enrich.
      const p: PdlPerson = res.data ?? {
        full_name: res.full_name,
        work_email: res.work_email,
        personal_emails: res.personal_emails,
        phone_numbers: res.phone_numbers,
      };

      const verifiedEmail = bestEmail(p) ?? email;
      const phone = p.phone_numbers?.[0] ?? undefined;

      enrichments.push({
        subjectType: "contact",
        subjectKey: email,
        provider: "peopledatalabs",
        verifiedEmail: verifiedEmail.includes("@") ? verifiedEmail : undefined,
        phone: typeof phone === "string" ? phone : undefined,
        data: (res.data ?? res) as Record<string, unknown>,
        fetchedAt: now,
      });
    }

    return { enrichments };
  },
};
