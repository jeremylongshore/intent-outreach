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
 * All parsing is defensive — missing envelope fields resolve to empty arrays.
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

const BASE = "https://api.zoominfo.com";
const KEY_ENV = "ZOOMINFO_JWT";

function headers(): Record<string, string> {
  return { Authorization: `Bearer ${getSecret(KEY_ENV)}` };
}

// ---- ZoomInfo API shapes (defensive subset) ----------------------------------

interface ZiCompany {
  name?: string;
  website?: string;
  primaryIndustry?: string;
  employeeCount?: number | string;
  description?: string;
  [key: string]: unknown;
}

interface ZiContact {
  firstName?: string;
  lastName?: string;
  jobTitle?: string;
  email?: string;
  mobilePhone?: string;
  directPhone?: string;
  linkedInUrl?: string;
  [key: string]: unknown;
}

interface ZiEnvelope<T> {
  data?: T[];
  maxResults?: number;
  [key: string]: unknown;
}

// ---- Mapping helpers ---------------------------------------------------------

function ziCompanyToLead(c: ZiCompany, fallbackDomain: string): Lead {
  return {
    domain: typeof c.website === "string" && c.website.length > 0 ? c.website : fallbackDomain,
    companyName: typeof c.name === "string" && c.name.length > 0 ? c.name : fallbackDomain,
    industry: typeof c.primaryIndustry === "string" ? c.primaryIndustry : undefined,
    size: c.employeeCount !== undefined ? String(c.employeeCount) : undefined,
    description: typeof c.description === "string" ? c.description : undefined,
    source: "zoominfo",
  };
}

function ziContactToContact(p: ZiContact, domain: string): Contact {
  const name = [p.firstName, p.lastName].filter(Boolean).join(" ") || "(unknown)";
  const email =
    typeof p.email === "string" && p.email.includes("@") ? p.email : undefined;
  const linkedin =
    typeof p.linkedInUrl === "string" && p.linkedInUrl.startsWith("http")
      ? p.linkedInUrl
      : undefined;
  return {
    name,
    leadDomain: domain,
    email,
    title: typeof p.jobTitle === "string" ? p.jobTitle : undefined,
    linkedin,
    source: "zoominfo",
  };
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

  async research({ domain, icp }: ResearchInput): Promise<ResearchOutput> {
    // Company search — expect one result keyed by domain.
    const companyRes = await httpJson<ZiEnvelope<ZiCompany>>(`${BASE}/search/company`, {
      method: "POST",
      headers: headers(),
      json: { companyWebsite: domain },
    });
    const company = (companyRes.data ?? [])[0];
    const lead: Lead = company
      ? ziCompanyToLead(company, domain)
      : { domain, companyName: domain, source: "zoominfo" };

    // Contact search — up to 10 contacts at that company, using the ICP as a
    // keyword hint if ZoomInfo supports it (best-effort; not all plans expose it).
    const contactRes = await httpJson<ZiEnvelope<ZiContact>>(`${BASE}/search/contact`, {
      method: "POST",
      headers: headers(),
      json: { companyWebsite: domain, keywords: icp, maxResults: 10 },
    });
    const contacts: Contact[] = (contactRes.data ?? [])
      .slice(0, 10)
      .map((p) => ziContactToContact(p, lead.domain));

    return {
      leads: [lead],
      contacts,
      raw: { company: companyRes, contacts: contactRes },
    };
  },

  async enrich({ lead, contacts }: EnrichInput): Promise<EnrichOutput> {
    // Enrich contacts that already have an email — ZoomInfo's enrich endpoint
    // matches on email to return verified phone + additional fields.
    const withEmail = contacts.filter((c) => Boolean(c.email)).slice(0, 10);
    if (withEmail.length === 0) return { enrichments: [] };

    const now = new Date().toISOString();
    const enrichments: Enrichment[] = [];

    for (const contact of withEmail) {
      const res = await httpJson<ZiEnvelope<ZiContact>>(`${BASE}/enrich/contact`, {
        method: "POST",
        headers: headers(),
        json: { email: contact.email },
      });
      const match = (res.data ?? [])[0];
      if (!match) continue;

      const phone =
        typeof match.mobilePhone === "string" && match.mobilePhone.length > 0
          ? match.mobilePhone
          : typeof match.directPhone === "string" && match.directPhone.length > 0
          ? match.directPhone
          : undefined;

      enrichments.push({
        subjectType: "contact",
        subjectKey: contact.email!,
        provider: "zoominfo",
        verifiedEmail: contact.email,
        phone,
        data: match as Record<string, unknown>,
        fetchedAt: now,
      });
    }

    return { enrichments };
  },
};
