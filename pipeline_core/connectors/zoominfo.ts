/**
 * pipeline_core/connectors/zoominfo.ts — ZoomInfo connector.
 *
 * Enterprise contract required. ZoomInfo's real authentication is a multi-step
 * PKI/JWT handshake: the client generates a signed JWT assertion and exchanges it
 * for a short-lived bearer token at https://api.zoominfo.com/authenticate. For
 * simplicity (and because most enterprise integrations pre-obtain the token via
 * their own automation), this connector accepts a pre-obtained JWT bearer token
 * stored in ZOOMINFO_JWT. Set it to the bearer token returned by the handshake;
 * refresh before it expires (ZoomInfo tokens are typically valid for ~1 hour).
 *
 * Endpoints (ZoomInfo v1, auth via Authorization: Bearer <ZOOMINFO_JWT>):
 *   - Company search:  POST https://api.zoominfo.com/search/company
 *   - Contact search:  POST https://api.zoominfo.com/search/contact
 *   - Contact enrich:  POST https://api.zoominfo.com/enrich/contact
 *
 * Response envelopes use `data` (array of results) + `maxResults` (total count).
 * All parsing is defensive — envelopes are safeParsed against tolerant schemas and
 * missing envelope fields resolve to empty arrays.
 *
 * PII: mobilePhone is never kept (directPhone / phone only), and enrichment `data`
 * is reduced to a B2B allowlist unless INTENT_OUTREACH_KEEP_RAW=1.
 *
 * TODO(live-doc verification): the request bodies (companyWebsite, keywords,
 * maxResults, email match) have not been re-verified against current ZoomInfo docs.
 */

import { z } from "zod";
import { httpJson } from "../http.js";
import { hasSecret } from "../secrets.js";
import type { Contact, Enrichment, Lead } from "../models.js";
import { normalizeDomain } from "./_domain.js";
import { forEachContact } from "./_per-item.js";
import { keepRawOptIn, parseVendor, pickAllowed, useSecret } from "./_shared.js";
import type {
  Connector,
  EnrichInput,
  EnrichOutput,
  ResearchInput,
  ResearchOutput,
} from "./types.js";

const BASE = "https://api.zoominfo.com";
const KEY_ENV = "ZOOMINFO_JWT";

function headers(): Record<string, string> {
  return { Authorization: "Bearer " + useSecret(KEY_ENV) };
}

// ---- ZoomInfo API shapes (tolerant: all optional, passthrough) ----------------

const ZiCompanySchema = z
  .object({
    name: z.string().nullish(),
    website: z.string().nullish(),
    primaryIndustry: z.string().nullish(),
    employeeCount: z.union([z.number(), z.string()]).nullish(),
    description: z.string().nullish(),
  })
  .passthrough();
type ZiCompany = z.infer<typeof ZiCompanySchema>;

const ZiContactSchema = z
  .object({
    firstName: z.string().nullish(),
    lastName: z.string().nullish(),
    jobTitle: z.string().nullish(),
    email: z.string().nullish(),
    phone: z.string().nullish(),
    directPhone: z.string().nullish(),
    linkedInUrl: z.string().nullish(),
  })
  .passthrough();
type ZiContact = z.infer<typeof ZiContactSchema>;

const CompanyEnvelope = z
  .object({ data: z.array(ZiCompanySchema).nullish(), maxResults: z.number().nullish() })
  .passthrough();
const ContactEnvelope = z
  .object({ data: z.array(ZiContactSchema).nullish(), maxResults: z.number().nullish() })
  .passthrough();

/** B2B fields kept in enrichment `data` (no mobilePhone, no personal address). */
const ZI_CONTACT_ALLOW = [
  "id",
  "firstName",
  "lastName",
  "jobTitle",
  "jobFunction",
  "managementLevel",
  "email",
  "phone",
  "directPhone",
  "linkedInUrl",
  "companyId",
  "companyName",
  "companyWebsite",
] as const;

// ---- Mapping helpers ---------------------------------------------------------

function ziCompanyToLead(c: ZiCompany, fallbackDomain: string): Lead {
  return {
    domain: normalizeDomain(c.website) ?? fallbackDomain,
    companyName: typeof c.name === "string" && c.name.length > 0 ? c.name : fallbackDomain,
    industry: c.primaryIndustry ?? undefined,
    size:
      c.employeeCount !== undefined && c.employeeCount !== null ? String(c.employeeCount) : undefined,
    description: c.description ?? undefined,
    source: "zoominfo",
  };
}

function ziContactToContact(p: ZiContact, domain: string): Contact {
  const name = [p.firstName, p.lastName].filter(Boolean).join(" ") || "(unknown)";
  const email = typeof p.email === "string" && p.email.includes("@") ? p.email : undefined;
  const linkedin =
    typeof p.linkedInUrl === "string" && p.linkedInUrl.startsWith("http") ? p.linkedInUrl : undefined;
  return {
    name,
    leadDomain: domain,
    email,
    title: p.jobTitle ?? undefined,
    linkedin,
    source: "zoominfo",
  };
}

/** Business phone only — a mobile number is personal data and is never kept. */
function businessPhone(p: ZiContact): string | undefined {
  for (const v of [p.directPhone, p.phone]) if (typeof v === "string" && v.length > 0) return v;
  return undefined;
}

// ---- Connector ---------------------------------------------------------------

export const zoominfoConnector: Connector = {
  name: "zoominfo",
  displayName: "ZoomInfo",
  tier: "enterprise",
  keyEnvVar: KEY_ENV,
  phases: ["research", "enrich"],
  note: "Enterprise contract required. Set ZOOMINFO_JWT (a bearer token obtained via ZoomInfo PKI/JWT auth).",

  isConfigured() {
    return hasSecret(KEY_ENV);
  },

  async research({ domain, icp, signal }: ResearchInput): Promise<ResearchOutput> {
    // Company search — expect one result keyed by domain.
    const companyRes = parseVendor(
      CompanyEnvelope,
      await httpJson(`${BASE}/search/company`, {
        signal,
        method: "POST",
        headers: headers(),
        json: { companyWebsite: domain },
      }),
    );
    const company = (companyRes.data ?? [])[0];
    const lead: Lead = company
      ? ziCompanyToLead(company, domain)
      : { domain, companyName: domain, source: "zoominfo" };

    // Contact search — up to 10 contacts at that company, using the ICP as a
    // keyword hint if ZoomInfo supports it (best-effort; not all plans expose it).
    const contactRes = parseVendor(
      ContactEnvelope,
      await httpJson(`${BASE}/search/contact`, {
        signal,
        method: "POST",
        headers: headers(),
        json: { companyWebsite: domain, keywords: icp, maxResults: 10 },
      }),
    );
    const people = (contactRes.data ?? []).slice(0, 10);
    const contacts: Contact[] = people.map((p) => ziContactToContact(p, lead.domain));

    return {
      leads: [lead],
      contacts,
      // Company payload is firmographic; the contact payload (personal data) is
      // kept only with INTENT_OUTREACH_KEEP_RAW=1.
      raw: keepRawOptIn()
        ? { company: companyRes, contacts: contactRes }
        : { company: companyRes, contacts: people.length },
    };
  },

  async enrich({ contacts, signal }: EnrichInput): Promise<EnrichOutput> {
    // Enrich contacts that already have an email — ZoomInfo's enrich endpoint
    // matches on email, so the contact name does not gate the lookup.
    const now = new Date().toISOString();
    const { results, failures } = await forEachContact<Enrichment>(
      contacts,
      10,
      async (contact) => {
        const res = parseVendor(
          ContactEnvelope,
          await httpJson(`${BASE}/enrich/contact`, {
            signal,
            method: "POST",
            headers: headers(),
            json: { email: contact.email },
          }),
        );
        const match = (res.data ?? [])[0];
        if (!match) return null;
        return {
          subjectType: "contact",
          subjectKey: contact.email!,
          provider: "zoominfo",
          verifiedEmail: contact.email,
          contactName: contact.name,
          phone: businessPhone(match),
          data: pickAllowed(match as Record<string, unknown>, ZI_CONTACT_ALLOW),
          fetchedAt: now,
        };
      },
      { requireFullName: false, filter: (c) => Boolean(c.email) },
    );

    return { enrichments: results, failures, raw: { failures } };
  },
};
