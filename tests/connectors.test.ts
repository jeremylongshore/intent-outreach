/**
 * tests/connectors.test.ts — unit tests for each connector's response mapper.
 *
 * Strategy: stub the global `fetch` to return a recorded provider payload.
 * Each connector is imported directly and called with its real implementation —
 * only the HTTP boundary is faked. We verify that the mapper produces the
 * correct Lead / Contact / Enrichment shapes, including all edge-case branches
 * called out in the task brief.
 *
 * Env vars are set in beforeEach and cleared in afterEach. _resetSecretCache()
 * is called to flush the file-cache so env changes are visible.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetSecretCache } from "../pipeline_core/secrets.js";
import { MAX_REVEAL_PER_DOMAIN, apolloConnector } from "../pipeline_core/connectors/apollo.js";
import { hunterConnector } from "../pipeline_core/connectors/hunter.js";
import { crunchbaseConnector } from "../pipeline_core/connectors/crunchbase.js";
import { peopledatalabsConnector } from "../pipeline_core/connectors/peopledatalabs.js";
import { zoominfoConnector } from "../pipeline_core/connectors/zoominfo.js";
import { _setExaClock, exaConnector } from "../pipeline_core/connectors/exa.js";
import { leadmagicConnector } from "../pipeline_core/connectors/leadmagic.js";
import { clearbitConnector } from "../pipeline_core/connectors/clearbit.js";
import { clayConnector } from "../pipeline_core/connectors/clay.js";
import {
  HttpError,
  MAX_BODY_BYTES,
  ResponseTooLargeError,
  _clearRedactionRegistry,
  httpJson,
  parseRetryAfter,
  registerSecretForRedaction,
} from "../pipeline_core/http.js";
import { forEachContact } from "../pipeline_core/connectors/_per-item.js";
import { normalizeDomain } from "../pipeline_core/connectors/_domain.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal `fetch` stub that returns one JSON payload on every call. */
function mockFetchWith(body: unknown): typeof fetch {
  const text = JSON.stringify(body);
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => text,
  } as unknown as Response);
}

/**
 * Build a `fetch` stub that returns different payloads on successive calls.
 * Each element of `bodies` is returned on the nth call (cycling if exhausted).
 */
function mockFetchSequence(bodies: unknown[]): typeof fetch {
  let i = 0;
  return vi.fn().mockImplementation(async () => {
    const body = bodies[i % bodies.length];
    i++;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(body),
    } as unknown as Response;
  });
}

/** Minimal Lead reference (only the fields under test). */
const DOMAIN = "acme.com";

// ---------------------------------------------------------------------------
// beforeEach / afterEach shared env management
// ---------------------------------------------------------------------------

const ORIGINAL_ENV = { ...process.env };

function clearKeys() {
  for (const k of [
    "APOLLO_API_KEY",
    "HUNTER_API_KEY",
    "CRUNCHBASE_API_KEY",
    "PDL_API_KEY",
    "ZOOMINFO_JWT",
    "EXA_API_KEY",
    "LEADMAGIC_API_KEY",
    "CLEARBIT_API_KEY",
    "CLAY_API_KEY",
    "CLAY_WEBHOOK_URL",
  ]) {
    delete process.env[k];
  }
  _resetSecretCache();
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

// ===========================================================================
// Apollo
// ===========================================================================

describe("apolloConnector", () => {
  beforeEach(() => {
    clearKeys();
    process.env.APOLLO_API_KEY = "test-apollo-key";
    _resetSecretCache();
  });

  it("isConfigured returns true when APOLLO_API_KEY is set", () => {
    expect(apolloConnector.isConfigured()).toBe(true);
  });

  it("isConfigured returns false when key is absent", () => {
    delete process.env.APOLLO_API_KEY;
    _resetSecretCache();
    expect(apolloConnector.isConfigured()).toBe(false);
  });

  describe("research – orgToLead: primary_domain fallback", () => {
    it("uses primary_domain from the org object when present", async () => {
      const orgPayload = {
        organization: {
          name: "Acme Corp",
          primary_domain: "acmecorp.com",
          industry: "SaaS",
          estimated_num_employees: 250,
          short_description: "B2B sales tooling",
        },
      };
      const peoplePayload = { people: [] };
      vi.stubGlobal("fetch", mockFetchSequence([orgPayload, peoplePayload]));

      const { leads } = await apolloConnector.research!({ domain: DOMAIN, icp: "VP Sales" });

      expect(leads).toHaveLength(1);
      // primary_domain from payload, NOT the input domain
      expect(leads[0]?.domain).toBe("acmecorp.com");
      expect(leads[0]?.companyName).toBe("Acme Corp");
      expect(leads[0]?.industry).toBe("SaaS");
      expect(leads[0]?.size).toBe("250");
      expect(leads[0]?.description).toBe("B2B sales tooling");
      expect(leads[0]?.source).toBe("apollo");
    });

    it("falls back to input domain when primary_domain is absent", async () => {
      const orgPayload = { organization: { name: "NoDomain Corp" } };
      const peoplePayload = { people: [] };
      vi.stubGlobal("fetch", mockFetchSequence([orgPayload, peoplePayload]));

      const { leads } = await apolloConnector.research!({ domain: DOMAIN, icp: "" });

      expect(leads[0]?.domain).toBe(DOMAIN);
    });

    it("falls back to input domain when org array is empty", async () => {
      const orgPayload = { organizations: [] };
      const peoplePayload = { people: [] };
      vi.stubGlobal("fetch", mockFetchSequence([orgPayload, peoplePayload]));

      const { leads } = await apolloConnector.research!({ domain: DOMAIN, icp: "" });

      expect(leads[0]?.domain).toBe(DOMAIN);
    });
  });

  describe("research – live API shape (verified 2026-10-05)", () => {
    const ORG = { organization: { name: "Acme", primary_domain: DOMAIN } };
    // People search returns ids + first names + obfuscated last names, no emails.
    const SEARCH = {
      people: [
        { id: "p1", first_name: "Jane", last_name_obfuscated: "D***e", title: "VP Sales", has_email: true },
        { id: "p2", first_name: "Bob", last_name_obfuscated: "S***h", title: "CTO", has_email: false },
        { id: "p3", first_name: "Cara", last_name_obfuscated: "L***e", title: "COO", has_email: true },
      ],
    };
    const REVEAL = {
      matches: [
        { id: "p1", name: "Jane Doe", first_name: "Jane", last_name: "Doe", title: "VP Sales", email: "jane@acme.com" },
        { id: "p3", name: "Cara Lowe", first_name: "Cara", last_name: "Lowe", title: "COO", email: "cara@acme.com" },
      ],
    };

    it("looks up the org, searches decision-makers by domain list, and reveals only people with an email", async () => {
      const fetchSpy = mockFetchSequence([ORG, SEARCH, REVEAL]);
      vi.stubGlobal("fetch", fetchSpy);

      const { leads, contacts } = await apolloConnector.research!({ domain: DOMAIN, icp: "a long ICP sentence" });

      const calls = (fetchSpy as unknown as { mock: { calls: [URL | string, RequestInit][] } }).mock.calls;
      expect(String(calls[0]![0])).toBe(`https://api.apollo.io/api/v1/organizations/enrich?domain=${DOMAIN}`);
      expect(String(calls[1]![0])).toBe("https://api.apollo.io/api/v1/mixed_people/api_search");
      const search = JSON.parse(String(calls[1]![1].body));
      expect(search.q_organization_domains_list).toEqual([DOMAIN]);
      expect(search).not.toHaveProperty("q_organization_domains");
      expect(search).not.toHaveProperty("q_keywords"); // the ICP is not a keyword query
      expect(search.person_seniorities).toContain("c_suite");
      expect(String(calls[2]![0])).toContain("/people/bulk_match");
      expect(JSON.parse(String(calls[2]![1].body))).toEqual({ details: [{ id: "p1" }, { id: "p3" }] });

      expect(leads[0]?.companyName).toBe("Acme");
      expect(contacts.map((c) => [c.name, c.email, c.title])).toEqual([
        ["Jane Doe", "jane@acme.com", "VP Sales"],
        ["Cara Lowe", "cara@acme.com", "COO"],
      ]);
    });

    it(`caps reveals at ${MAX_REVEAL_PER_DOMAIN} per domain (credits)`, async () => {
      const many = { people: Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, first_name: "X", has_email: true })) };
      const fetchSpy = mockFetchSequence([ORG, many, { matches: [] }]);
      vi.stubGlobal("fetch", fetchSpy);
      await apolloConnector.research!({ domain: DOMAIN, icp: "" });
      const calls = (fetchSpy as unknown as { mock: { calls: [URL | string, RequestInit][] } }).mock.calls;
      expect(JSON.parse(String(calls[2]![1].body)).details).toHaveLength(MAX_REVEAL_PER_DOMAIN);
    });

    it("drops people it could not reveal to a full name (first-name-only contacts are useless)", async () => {
      vi.stubGlobal("fetch", mockFetchSequence([ORG, SEARCH, { matches: [{ id: "p1", first_name: "Jane" }, null] }]));
      const { contacts } = await apolloConnector.research!({ domain: DOMAIN, icp: "" });
      expect(contacts).toEqual([]);
    });

    it("makes no reveal call (spends no credits) when nobody has an email", async () => {
      const fetchSpy = mockFetchSequence([ORG, { people: [{ id: "p2", first_name: "Bob", has_email: false }] }]);
      vi.stubGlobal("fetch", fetchSpy);
      const { contacts } = await apolloConnector.research!({ domain: DOMAIN, icp: "" });
      expect(contacts).toEqual([]);
      expect((fetchSpy as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(2);
    });

    it("drops a revealed email that contains no @", async () => {
      vi.stubGlobal(
        "fetch",
        mockFetchSequence([ORG, SEARCH, { matches: [{ id: "p1", name: "Jane Doe", email: "not-an-email" }] }]),
      );
      const { contacts } = await apolloConnector.research!({ domain: DOMAIN, icp: "" });
      expect(contacts[0]?.email).toBeUndefined();
    });
  });

  describe("enrich – bulk_match: only matches with an email produce Enrichments", () => {
    const lead = {
      domain: DOMAIN,
      companyName: "Acme",
      source: "apollo" as const,
    };

    it("produces an Enrichment for each match that has an email", async () => {
      const matchPayload = {
        matches: [
          {
            email: "alice@acme.com",
            phone_numbers: [{ raw_number: "+15550001111" }],
          },
          {
            email: "bob@acme.com",
            phone_numbers: [],
          },
          // Match without an email — must be filtered out
          { first_name: "Ghost" },
        ],
      };
      vi.stubGlobal("fetch", mockFetchWith(matchPayload));

      const contacts = [
        { name: "Alice Smith", leadDomain: DOMAIN, source: "apollo" as const },
        { name: "Bob Jones", leadDomain: DOMAIN, source: "apollo" as const },
        { name: "Ghost Writer", leadDomain: DOMAIN, source: "apollo" as const },
      ];

      const { enrichments } = await apolloConnector.enrich!({ lead, contacts });

      expect(enrichments).toHaveLength(2);
      expect(enrichments[0]?.subjectKey).toBe("alice@acme.com");
      expect(enrichments[0]?.verifiedEmail).toBe("alice@acme.com");
      expect(enrichments[0]?.phone).toBe("+15550001111");
      expect(enrichments[0]?.provider).toBe("apollo");
      expect(enrichments[0]?.subjectType).toBe("contact");
      expect(enrichments[1]?.subjectKey).toBe("bob@acme.com");
      // phone_numbers is empty, so phone should be undefined
      expect(enrichments[1]?.phone).toBeUndefined();
    });

    it("skips enrich entirely when all contacts already have emails", async () => {
      const contacts = [
        { name: "Alice", leadDomain: DOMAIN, email: "alice@acme.com", source: "apollo" as const },
      ];
      // fetch should NOT be called
      const spy = vi.fn();
      vi.stubGlobal("fetch", spy);

      const { enrichments } = await apolloConnector.enrich!({ lead, contacts });

      expect(enrichments).toHaveLength(0);
      expect(spy).not.toHaveBeenCalled();
    });

    it("returns no enrichments when matches array is empty", async () => {
      vi.stubGlobal("fetch", mockFetchWith({ matches: [] }));
      const contacts = [{ name: "No Body", leadDomain: DOMAIN, source: "apollo" as const }];

      const { enrichments } = await apolloConnector.enrich!({ lead, contacts });

      expect(enrichments).toHaveLength(0);
    });
  });
});

// ===========================================================================
// Hunter
// ===========================================================================

describe("hunterConnector", () => {
  beforeEach(() => {
    clearKeys();
    process.env.HUNTER_API_KEY = "test-hunter-key";
    _resetSecretCache();
  });

  it("isConfigured returns true when key is set", () => {
    expect(hunterConnector.isConfigured()).toBe(true);
  });

  it("research maps domain-search emails to Contacts", async () => {
    const payload = {
      data: {
        organization: "Acme Inc",
        emails: [
          {
            value: "ceo@acme.com",
            first_name: "Alice",
            last_name: "Smith",
            position: "CEO",
            linkedin: "https://linkedin.com/in/alice",
          },
          {
            value: "cto@acme.com",
            first_name: "Bob",
            last_name: "Jones",
            position: "CTO",
          },
        ],
      },
    };
    vi.stubGlobal("fetch", mockFetchWith(payload));

    const { leads, contacts } = await hunterConnector.research!({ domain: DOMAIN, icp: "" });

    expect(leads).toHaveLength(1);
    expect(leads[0]?.domain).toBe(DOMAIN);
    expect(leads[0]?.companyName).toBe("Acme Inc");
    expect(leads[0]?.source).toBe("hunter");

    expect(contacts).toHaveLength(2);
    expect(contacts[0]?.name).toBe("Alice Smith");
    expect(contacts[0]?.email).toBe("ceo@acme.com");
    expect(contacts[0]?.title).toBe("CEO");
    expect(contacts[0]?.linkedin).toBe("https://linkedin.com/in/alice");
    expect(contacts[0]?.source).toBe("hunter");
    // Second contact: no linkedin in payload, should be undefined
    expect(contacts[1]?.linkedin).toBeUndefined();
  });

  it("research falls back to domain as companyName when organization is missing", async () => {
    vi.stubGlobal("fetch", mockFetchWith({ data: { emails: [] } }));
    const { leads } = await hunterConnector.research!({ domain: DOMAIN, icp: "" });
    expect(leads[0]?.companyName).toBe(DOMAIN);
  });

  it("research drops email that lacks @", async () => {
    const payload = {
      data: {
        emails: [{ value: "not-an-email", first_name: "X", last_name: "Y" }],
      },
    };
    vi.stubGlobal("fetch", mockFetchWith(payload));
    const { contacts } = await hunterConnector.research!({ domain: DOMAIN, icp: "" });
    expect(contacts[0]?.email).toBeUndefined();
  });

  it("research produces (unknown) name when first and last are absent", async () => {
    const payload = { data: { emails: [{ value: "x@acme.com" }] } };
    vi.stubGlobal("fetch", mockFetchWith(payload));
    const { contacts } = await hunterConnector.research!({ domain: DOMAIN, icp: "" });
    expect(contacts[0]?.name).toBe("(unknown)");
  });

  it("enrich calls email-finder and produces an Enrichment for a valid email", async () => {
    const payload = { data: { email: "found@acme.com", score: 92 } };
    vi.stubGlobal("fetch", mockFetchWith(payload));

    const lead = { domain: DOMAIN, companyName: "Acme", source: "hunter" as const };
    const contacts = [{ name: "Jane Doe", leadDomain: DOMAIN, source: "hunter" as const }];

    const { enrichments } = await hunterConnector.enrich!({ lead, contacts });

    expect(enrichments).toHaveLength(1);
    expect(enrichments[0]?.subjectKey).toBe("found@acme.com");
    expect(enrichments[0]?.verifiedEmail).toBe("found@acme.com");
    expect(enrichments[0]?.provider).toBe("hunter");
    expect(enrichments[0]?.subjectType).toBe("contact");
  });

  it("enrich skips a finder result that lacks @", async () => {
    const f = mockFetchWith({ data: { email: "invalid" } });
    vi.stubGlobal("fetch", f);
    const lead = { domain: DOMAIN, companyName: "Acme", source: "hunter" as const };
    const contacts = [{ name: "Xavier Ray", leadDomain: DOMAIN, source: "hunter" as const }];
    const { enrichments } = await hunterConnector.enrich!({ lead, contacts });
    expect(enrichments).toHaveLength(0);
    expect(f).toHaveBeenCalledTimes(1);
    const url = String(vi.mocked(f).mock.calls[0]?.[0]);
    expect(url).toContain("https://api.hunter.io/v2/email-finder");
    expect(url).toContain("full_name=Xavier+Ray");
  });

  it("enrich skips contacts that already have an email", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    const lead = { domain: DOMAIN, companyName: "Acme", source: "hunter" as const };
    const contacts = [
      { name: "Jane", leadDomain: DOMAIN, email: "jane@acme.com", source: "hunter" as const },
    ];
    const { enrichments } = await hunterConnector.enrich!({ lead, contacts });
    expect(enrichments).toHaveLength(0);
    expect(spy).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Crunchbase
// ===========================================================================

describe("crunchbaseConnector", () => {
  beforeEach(() => {
    clearKeys();
    process.env.CRUNCHBASE_API_KEY = "test-cb-key";
    _resetSecretCache();
  });

  it("isConfigured returns true when key is set", () => {
    expect(crunchbaseConnector.isConfigured()).toBe(true);
  });

  it("enrich maps funding object fields correctly", async () => {
    const payload = {
      entities: [
        {
          identifier: { value: "Acme Corp" },
          properties: {
            funding_total: { value_usd: 25_000_000 },
            last_funding_type: "Series B",
            last_funding_at: "2025-03-15",
            num_funding_rounds: 3,
            investors: [
              { identifier: { value: "Sequoia" } },
              { identifier: { value: "Andreessen Horowitz" } },
            ],
          },
        },
      ],
    };
    vi.stubGlobal("fetch", mockFetchWith(payload));

    const lead = { domain: DOMAIN, companyName: "Acme", source: "crunchbase" as const };
    const { enrichments } = await crunchbaseConnector.enrich!({ lead, contacts: [] });

    expect(enrichments).toHaveLength(1);
    const e = enrichments[0]!;
    expect(e.subjectType).toBe("lead");
    expect(e.subjectKey).toBe(DOMAIN);
    expect(e.provider).toBe("crunchbase");
    expect(e.funding?.totalRaisedUsd).toBe(25_000_000);
    expect(e.funding?.lastRound).toBe("Series B");
    expect(e.funding?.lastRoundDate).toBe("2025-03-15");
    expect(e.funding?.investors).toEqual(["Sequoia", "Andreessen Horowitz"]);
  });

  it("enrich handles missing investors gracefully", async () => {
    const payload = {
      entities: [
        {
          properties: {
            funding_total: { value_usd: 5_000_000 },
            last_funding_type: "Seed",
          },
        },
      ],
    };
    vi.stubGlobal("fetch", mockFetchWith(payload));

    const lead = { domain: DOMAIN, companyName: "Acme", source: "crunchbase" as const };
    const { enrichments } = await crunchbaseConnector.enrich!({ lead, contacts: [] });

    expect(enrichments[0]?.funding?.investors).toBeUndefined();
    expect(enrichments[0]?.funding?.lastRound).toBe("Seed");
  });

  it("enrich produces NO enrichment when entities is empty (no fabricated data:{})", async () => {
    vi.stubGlobal("fetch", mockFetchWith({ entities: [] }));
    const lead = { domain: DOMAIN, companyName: "Acme", source: "crunchbase" as const };
    const { enrichments } = await crunchbaseConnector.enrich!({ lead, contacts: [] });
    expect(enrichments).toHaveLength(0);
  });

  it("investors with missing identifier.value are filtered out", async () => {
    const payload = {
      entities: [
        {
          properties: {
            investors: [
              { identifier: { value: "Good VC" } },
              { identifier: {} }, // no value
              { something: "else" }, // no identifier at all
            ],
          },
        },
      ],
    };
    vi.stubGlobal("fetch", mockFetchWith(payload));
    const lead = { domain: DOMAIN, companyName: "Acme", source: "crunchbase" as const };
    const { enrichments } = await crunchbaseConnector.enrich!({ lead, contacts: [] });
    expect(enrichments[0]?.funding?.investors).toEqual(["Good VC"]);
  });
});

// ===========================================================================
// People Data Labs
// ===========================================================================

describe("peopledatalabsConnector", () => {
  beforeEach(() => {
    clearKeys();
    process.env.PDL_API_KEY = "test-pdl-key";
    _resetSecretCache();
  });

  it("isConfigured returns true when key is set", () => {
    expect(peopledatalabsConnector.isConfigured()).toBe(true);
  });

  it("research maps company enrich (data wrapper) to a Lead", async () => {
    const companyPayload = {
      status: 200,
      data: {
        name: "Acme Corp",
        industry: "Software",
        employee_count: 120,
        summary: "Enterprise SaaS platform",
      },
    };
    const personPayload = { status: 200, data: [] };
    vi.stubGlobal("fetch", mockFetchSequence([companyPayload, personPayload]));

    const { leads } = await peopledatalabsConnector.research!({ domain: DOMAIN, icp: "" });

    expect(leads).toHaveLength(1);
    expect(leads[0]?.companyName).toBe("Acme Corp");
    expect(leads[0]?.industry).toBe("Software");
    expect(leads[0]?.size).toBe("120");
    expect(leads[0]?.description).toBe("Enterprise SaaS platform");
    expect(leads[0]?.source).toBe("peopledatalabs");
  });

  it("research handles bare fields (no data wrapper) from company enrich", async () => {
    const companyPayload = {
      name: "Bare Corp",
      industry: "Retail",
      employee_count: 50,
      summary: "Bare fields version",
    };
    const personPayload = { data: [] };
    vi.stubGlobal("fetch", mockFetchSequence([companyPayload, personPayload]));

    const { leads } = await peopledatalabsConnector.research!({ domain: DOMAIN, icp: "" });

    expect(leads[0]?.companyName).toBe("Bare Corp");
    expect(leads[0]?.industry).toBe("Retail");
  });

  it("research maps person search results to Contacts", async () => {
    const companyPayload = { data: { name: "Acme" } };
    const personPayload = {
      data: [
        {
          full_name: "Alice M",
          job_title: "Head of Engineering",
          linkedin_url: "https://linkedin.com/in/alice",
          work_email: "alice@acme.com",
          phone_numbers: ["+1555000"],
        },
        {
          first_name: "Bob",
          last_name: "Jones",
          job_title: "Designer",
          personal_emails: ["bob@personal.com"],
        },
      ],
    };
    vi.stubGlobal("fetch", mockFetchSequence([companyPayload, personPayload]));

    const { contacts } = await peopledatalabsConnector.research!({ domain: DOMAIN, icp: "" });

    expect(contacts).toHaveLength(2);
    expect(contacts[0]?.name).toBe("Alice M");
    expect(contacts[0]?.email).toBe("alice@acme.com");
    expect(contacts[0]?.title).toBe("Head of Engineering");
    expect(contacts[0]?.source).toBe("peopledatalabs");
    // Bob: no full_name, joins first+last; personal emails are NEVER used (PII)
    expect(contacts[1]?.name).toBe("Bob Jones");
    expect(contacts[1]?.email).toBeUndefined();
  });

  it("research swallows person-search errors and still returns the lead", async () => {
    const companyPayload = { data: { name: "Acme" } };
    // Second fetch (person search) rejects
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(companyPayload),
      } as unknown as Response)
      .mockRejectedValueOnce(new Error("network error"));
    vi.stubGlobal("fetch", fetchImpl);

    const { leads, contacts } = await peopledatalabsConnector.research!({ domain: DOMAIN, icp: "" });

    expect(leads).toHaveLength(1);
    expect(contacts).toHaveLength(0);
  });

  it("enrich calls person/enrich per contact that has an email", async () => {
    const personPayload = {
      status: 200,
      data: {
        work_email: "jane@acme.com",
        phone_numbers: ["+15559876"],
      },
    };
    vi.stubGlobal("fetch", mockFetchWith(personPayload));

    const lead = { domain: DOMAIN, companyName: "Acme", source: "peopledatalabs" as const };
    const contacts = [
      { name: "Jane", leadDomain: DOMAIN, email: "jane@acme.com", source: "peopledatalabs" as const },
    ];

    const { enrichments } = await peopledatalabsConnector.enrich!({ lead, contacts });

    expect(enrichments).toHaveLength(1);
    expect(enrichments[0]?.subjectKey).toBe("jane@acme.com");
    expect(enrichments[0]?.verifiedEmail).toBe("jane@acme.com");
    // PDL phone_numbers are unlabeled (often personal mobiles) — never kept.
    expect(enrichments[0]?.phone).toBeUndefined();
    expect(enrichments[0]?.data).not.toHaveProperty("phone_numbers");
    expect(enrichments[0]?.provider).toBe("peopledatalabs");
  });

  it("enrich skips contacts without an email", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    const lead = { domain: DOMAIN, companyName: "Acme", source: "peopledatalabs" as const };
    const contacts = [{ name: "No Email", leadDomain: DOMAIN, source: "peopledatalabs" as const }];
    const { enrichments } = await peopledatalabsConnector.enrich!({ lead, contacts });
    expect(enrichments).toHaveLength(0);
    expect(spy).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// ZoomInfo
// ===========================================================================

describe("zoominfoConnector", () => {
  beforeEach(() => {
    clearKeys();
    process.env.ZOOMINFO_JWT = "test-zi-token";
    _resetSecretCache();
  });

  it("isConfigured returns true when ZOOMINFO_JWT is set", () => {
    expect(zoominfoConnector.isConfigured()).toBe(true);
  });

  it("research maps company search + contact search envelopes", async () => {
    const companyPayload = {
      data: [
        {
          name: "Acme Inc",
          website: DOMAIN,
          primaryIndustry: "Technology",
          employeeCount: 500,
          description: "Leading B2B platform",
        },
      ],
    };
    const contactPayload = {
      data: [
        {
          firstName: "Carol",
          lastName: "Chen",
          jobTitle: "VP Marketing",
          email: "carol@acme.com",
          mobilePhone: "+15550002222",
          linkedInUrl: "https://linkedin.com/in/carol",
        },
      ],
    };
    vi.stubGlobal("fetch", mockFetchSequence([companyPayload, contactPayload]));

    const { leads, contacts } = await zoominfoConnector.research!({ domain: DOMAIN, icp: "VP" });

    expect(leads).toHaveLength(1);
    expect(leads[0]?.domain).toBe(DOMAIN);
    expect(leads[0]?.companyName).toBe("Acme Inc");
    expect(leads[0]?.industry).toBe("Technology");
    expect(leads[0]?.size).toBe("500");
    expect(leads[0]?.description).toBe("Leading B2B platform");
    expect(leads[0]?.source).toBe("zoominfo");

    expect(contacts).toHaveLength(1);
    expect(contacts[0]?.name).toBe("Carol Chen");
    expect(contacts[0]?.email).toBe("carol@acme.com");
    expect(contacts[0]?.title).toBe("VP Marketing");
    expect(contacts[0]?.linkedin).toBe("https://linkedin.com/in/carol");
    expect(contacts[0]?.source).toBe("zoominfo");
  });

  it("research falls back to domain when company data array is empty", async () => {
    vi.stubGlobal("fetch", mockFetchSequence([{ data: [] }, { data: [] }]));

    const { leads } = await zoominfoConnector.research!({ domain: DOMAIN, icp: "" });

    expect(leads[0]?.domain).toBe(DOMAIN);
    expect(leads[0]?.companyName).toBe(DOMAIN);
  });

  it("research contact drops non-http linkedInUrl", async () => {
    const companyPayload = { data: [{ name: "X", website: DOMAIN }] };
    const contactPayload = {
      data: [{ firstName: "A", lastName: "B", linkedInUrl: "in/alice" }],
    };
    vi.stubGlobal("fetch", mockFetchSequence([companyPayload, contactPayload]));
    const { contacts } = await zoominfoConnector.research!({ domain: DOMAIN, icp: "" });
    expect(contacts[0]?.linkedin).toBeUndefined();
  });

  it("enrich never keeps mobilePhone (personal) as the phone", async () => {
    const enrichPayload = {
      data: [
        {
          firstName: "Dave",
          lastName: "D",
          email: "dave@acme.com",
          mobilePhone: "+15553333444",
        },
      ],
    };
    vi.stubGlobal("fetch", mockFetchWith(enrichPayload));

    const lead = { domain: DOMAIN, companyName: "Acme", source: "zoominfo" as const };
    const contacts = [
      { name: "Dave D", leadDomain: DOMAIN, email: "dave@acme.com", source: "zoominfo" as const },
    ];

    const { enrichments } = await zoominfoConnector.enrich!({ lead, contacts });

    expect(enrichments).toHaveLength(1);
    expect(enrichments[0]?.phone).toBeUndefined();
    expect(enrichments[0]?.data).not.toHaveProperty("mobilePhone");
    expect(enrichments[0]?.verifiedEmail).toBe("dave@acme.com");
    expect(enrichments[0]?.provider).toBe("zoominfo");
  });

  it("enrich falls back to directPhone when mobilePhone is absent", async () => {
    const enrichPayload = {
      data: [{ directPhone: "+15550009999" }],
    };
    vi.stubGlobal("fetch", mockFetchWith(enrichPayload));

    const lead = { domain: DOMAIN, companyName: "Acme", source: "zoominfo" as const };
    const contacts = [
      { name: "Eve", leadDomain: DOMAIN, email: "eve@acme.com", source: "zoominfo" as const },
    ];

    const { enrichments } = await zoominfoConnector.enrich!({ lead, contacts });

    expect(enrichments[0]?.phone).toBe("+15550009999");
  });

  it("enrich skips contacts without email", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    const lead = { domain: DOMAIN, companyName: "Acme", source: "zoominfo" as const };
    const contacts = [{ name: "Anon", leadDomain: DOMAIN, source: "zoominfo" as const }];
    const { enrichments } = await zoominfoConnector.enrich!({ lead, contacts });
    expect(enrichments).toHaveLength(0);
    expect(spy).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Exa
// ===========================================================================

describe("exaConnector", () => {
  beforeEach(() => {
    clearKeys();
    process.env.EXA_API_KEY = "test-exa-key";
    _resetSecretCache();
  });

  it("isConfigured returns true when key is set", () => {
    expect(exaConnector.isConfigured()).toBe(true);
  });

  it("research returns a Lead with description from top result highlights", async () => {
    const payload = {
      results: [
        {
          title: "Acme - B2B SaaS",
          url: "https://acme.com",
          highlights: ["Acme provides enterprise software for sales teams."],
        },
      ],
    };
    vi.stubGlobal("fetch", mockFetchWith(payload));

    const { leads, contacts } = await exaConnector.research!({ domain: DOMAIN, icp: "" });

    expect(leads).toHaveLength(1);
    expect(leads[0]?.domain).toBe(DOMAIN);
    expect(leads[0]?.companyName).toBe(DOMAIN);
    expect(leads[0]?.description).toBe("Acme provides enterprise software for sales teams.");
    expect(leads[0]?.source).toBe("exa");
    // Exa never produces contacts
    expect(contacts).toHaveLength(0);
  });

  it("research asks Exa for highlights (without `contents` Exa returns metadata only)", async () => {
    const fetchSpy = vi.fn(
      async () => new Response(JSON.stringify({ results: [{ title: "Acme", highlights: ["Acme sells software."] }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    await exaConnector.research!({ domain: DOMAIN, icp: "" });
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [URL | string, RequestInit];
    expect(String(url)).toBe("https://api.exa.ai/search");
    expect(JSON.parse(String(init.body))).toEqual({
      query: `company at ${DOMAIN}`,
      numResults: 5,
      type: "auto",
      contents: { highlights: true },
    });
  });

  it("research falls back to text snippet when highlights is absent", async () => {
    const payload = {
      results: [{ title: "Acme", text: "Great company doing great things." }],
    };
    vi.stubGlobal("fetch", mockFetchWith(payload));

    const { leads } = await exaConnector.research!({ domain: DOMAIN, icp: "" });

    expect(leads[0]?.description).toBe("Great company doing great things.");
  });

  it("research falls back to title when text and highlights are absent", async () => {
    const payload = { results: [{ title: "Acme Title Only" }] };
    vi.stubGlobal("fetch", mockFetchWith(payload));
    const { leads } = await exaConnector.research!({ domain: DOMAIN, icp: "" });
    expect(leads[0]?.description).toBe("Acme Title Only");
  });

  it("research produces no description when results array is empty", async () => {
    vi.stubGlobal("fetch", mockFetchWith({ results: [] }));
    const { leads } = await exaConnector.research!({ domain: DOMAIN, icp: "" });
    expect(leads[0]?.description).toBeUndefined();
  });

  it("enrich produces a lead Enrichment with webContext array and contacts:[]", async () => {
    const payload = {
      results: [
        { title: "Acme raises Series B", url: "https://news.example.com/acme-series-b" },
        { title: "Acme new hire", url: "https://news.example.com/acme-hire" },
      ],
    };
    vi.stubGlobal("fetch", mockFetchWith(payload));

    const lead = {
      domain: DOMAIN,
      companyName: "Acme",
      source: "exa" as const,
    };

    _setExaClock(() => new Date("2031-06-01T00:00:00Z"));
    const { enrichments } = await exaConnector.enrich!({ lead, contacts: [] });
    _setExaClock(null);

    // Query uses the injected clock's year, never a hardcoded one.
    const f = vi.mocked(globalThis.fetch);
    expect(String(f.mock.calls[0]?.[0])).toBe("https://api.exa.ai/search");
    const sent = JSON.parse(String((f.mock.calls[0]![1] as RequestInit).body)) as { query: string };
    expect(sent.query).toBe("Acme funding news 2031");

    expect(enrichments).toHaveLength(1);
    const e = enrichments[0]!;
    // Full payload lives only in `raw`, not duplicated into data._raw.
    expect(e.data).not.toHaveProperty("_raw");
    expect(e.subjectType).toBe("lead");
    expect(e.subjectKey).toBe(DOMAIN);
    expect(e.provider).toBe("exa");
    expect(Array.isArray((e.data as { webContext?: unknown }).webContext)).toBe(true);
    const wc = (e.data as { webContext: Array<{ title: string; url: string }> }).webContext;
    expect(wc[0]?.title).toBe("Acme raises Series B");
    expect(wc[0]?.url).toBe("https://news.example.com/acme-series-b");
  });
});

// ===========================================================================
// LeadMagic
// ===========================================================================

describe("leadmagicConnector", () => {
  beforeEach(() => {
    clearKeys();
    process.env.LEADMAGIC_API_KEY = "test-lm-key";
    _resetSecretCache();
  });

  it("isConfigured returns true when key is set", () => {
    expect(leadmagicConnector.isConfigured()).toBe(true);
  });

  it("enrich finds an email for a contact missing one", async () => {
    const payload = {
      email: "found@acme.com",
      first_name: "Jane",
      last_name: "Doe",
      company: "Acme",
      title: "VP Sales",
    };
    vi.stubGlobal("fetch", mockFetchWith(payload));

    const lead = { domain: DOMAIN, companyName: "Acme", source: "leadmagic" as const };
    const contacts = [{ name: "Jane Doe", leadDomain: DOMAIN, source: "leadmagic" as const }];

    const { enrichments } = await leadmagicConnector.enrich!({ lead, contacts });

    expect(enrichments).toHaveLength(1);
    expect(enrichments[0]?.subjectKey).toBe("found@acme.com");
    expect(enrichments[0]?.verifiedEmail).toBe("found@acme.com");
    expect(enrichments[0]?.provider).toBe("leadmagic");
    expect(enrichments[0]?.subjectType).toBe("contact");
  });

  it("enrich skips a result with no email", async () => {
    const f = mockFetchWith({ first_name: "Ghost" });
    vi.stubGlobal("fetch", f);
    const lead = { domain: DOMAIN, companyName: "Acme", source: "leadmagic" as const };
    const contacts = [{ name: "Ghost Rider", leadDomain: DOMAIN, source: "leadmagic" as const }];
    const { enrichments } = await leadmagicConnector.enrich!({ lead, contacts });
    expect(enrichments).toHaveLength(0);
    expect(f).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(f).mock.calls[0]?.[0])).toBe("https://api.leadmagic.io/email-finder");
  });

  it("enrich skips contacts that already have an email", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    const lead = { domain: DOMAIN, companyName: "Acme", source: "leadmagic" as const };
    const contacts = [
      { name: "Has Email", leadDomain: DOMAIN, email: "has@acme.com", source: "leadmagic" as const },
    ];
    const { enrichments } = await leadmagicConnector.enrich!({ lead, contacts });
    expect(enrichments).toHaveLength(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it("enrich skips single-token and (unknown) names without spending a lookup", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    const lead = { domain: DOMAIN, companyName: "Acme", source: "leadmagic" as const };
    const contacts = [
      { name: "Madonna", leadDomain: DOMAIN, source: "leadmagic" as const },
      { name: "(unknown)", leadDomain: DOMAIN, source: "leadmagic" as const },
    ];
    const { enrichments } = await leadmagicConnector.enrich!({ lead, contacts });
    expect(enrichments).toHaveLength(0);
    expect(spy).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Clearbit
// ===========================================================================

describe("clearbitConnector", () => {
  beforeEach(() => {
    clearKeys();
    process.env.CLEARBIT_API_KEY = "test-cb-key";
    _resetSecretCache();
  });

  it("isConfigured returns true when key is set", () => {
    expect(clearbitConnector.isConfigured()).toBe(true);
  });

  it("enrich produces a contact Enrichment from person data", async () => {
    const personPayload = {
      email: "ceo@acme.com",
      name: { fullName: "Alice CEO" },
      phone: "+15550001234",
      extra: "field",
    };
    const companyPayload = { name: "Acme Inc", domain: DOMAIN };
    vi.stubGlobal("fetch", mockFetchSequence([personPayload, companyPayload]));

    const lead = { domain: DOMAIN, companyName: "Acme", source: "clearbit" as const };
    const contacts = [
      { name: "Alice CEO", leadDomain: DOMAIN, email: "ceo@acme.com", source: "clearbit" as const },
    ];

    const { enrichments } = await clearbitConnector.enrich!({ lead, contacts });

    // person + company
    expect(enrichments).toHaveLength(2);
    const person = enrichments.find((e) => e.subjectType === "contact")!;
    expect(person.subjectKey).toBe("ceo@acme.com");
    expect(person.verifiedEmail).toBe("ceo@acme.com");
    expect(person.phone).toBe("+15550001234");
    expect(person.provider).toBe("clearbit");

    const company = enrichments.find((e) => e.subjectType === "lead")!;
    expect(company.subjectKey).toBe(DOMAIN);
    expect(company.provider).toBe("clearbit");
  });

  it("enrich yields no contact Enrichment when person body is empty (202-style)", async () => {
    // httpJson on an empty body returns {} which has zero keys → tryFetch returns null
    const emptyPayload = {};
    const companyPayload = { name: "Acme", domain: DOMAIN };
    vi.stubGlobal("fetch", mockFetchSequence([emptyPayload, companyPayload]));

    const lead = { domain: DOMAIN, companyName: "Acme", source: "clearbit" as const };
    const contacts = [
      { name: "Alice", leadDomain: DOMAIN, email: "alice@acme.com", source: "clearbit" as const },
    ];

    const { enrichments } = await clearbitConnector.enrich!({ lead, contacts });

    // person skipped (empty body), only company enrichment
    expect(enrichments).toHaveLength(1);
    expect(enrichments[0]?.subjectType).toBe("lead");
  });

  it("enrich yields no company Enrichment when company body is empty", async () => {
    const personPayload = { email: "a@acme.com", name: { fullName: "A" } };
    const emptyPayload = {};
    vi.stubGlobal("fetch", mockFetchSequence([personPayload, emptyPayload]));

    const lead = { domain: DOMAIN, companyName: "Acme", source: "clearbit" as const };
    const contacts = [
      { name: "A", leadDomain: DOMAIN, email: "a@acme.com", source: "clearbit" as const },
    ];

    const { enrichments } = await clearbitConnector.enrich!({ lead, contacts });

    expect(enrichments).toHaveLength(1);
    expect(enrichments[0]?.subjectType).toBe("contact");
  });

  it("enrich skips person enrichment for contacts without an email (only company call fires)", async () => {
    // The connector filters contacts to those with an email before calling person/enrich.
    // With no email contacts, only the company fetch fires.
    const companyPayload = { name: "Acme Inc", domain: DOMAIN };
    vi.stubGlobal("fetch", mockFetchWith(companyPayload));
    const lead = { domain: DOMAIN, companyName: "Acme", source: "clearbit" as const };
    const contacts = [{ name: "No Email", leadDomain: DOMAIN, source: "clearbit" as const }];
    const { enrichments } = await clearbitConnector.enrich!({ lead, contacts });
    // Only the company enrichment fires; no person enrichment
    expect(enrichments).toHaveLength(1);
    expect(enrichments[0]?.subjectType).toBe("lead");
  });
});

// ===========================================================================
// Clay (push-only)
// ===========================================================================

describe("clayConnector", () => {
  beforeEach(() => {
    clearKeys();
    process.env.CLAY_API_KEY = "test-clay-key";
    process.env.CLAY_WEBHOOK_URL = "https://hooks.clay.com/v1/test-webhook";
    _resetSecretCache();
  });

  it("isConfigured returns true only when BOTH key and webhook are set", () => {
    expect(clayConnector.isConfigured()).toBe(true);
  });

  it("isConfigured returns false when CLAY_API_KEY is missing", () => {
    delete process.env.CLAY_API_KEY;
    _resetSecretCache();
    expect(clayConnector.isConfigured()).toBe(false);
  });

  it("isConfigured returns false when CLAY_WEBHOOK_URL is missing", () => {
    delete process.env.CLAY_WEBHOOK_URL;
    _resetSecretCache();
    expect(clayConnector.isConfigured()).toBe(false);
  });

  it("research POSTs to the webhook and returns leads:[], contacts:[]", async () => {
    vi.stubGlobal("fetch", mockFetchWith({ ok: true }));

    const { leads, contacts, raw } = await clayConnector.research!({ domain: DOMAIN, icp: "VP Eng" });

    expect(leads).toHaveLength(0);
    expect(contacts).toHaveLength(0);
    // raw marker indicates the push happened
    expect((raw as { pushed?: string })?.pushed).toBe(DOMAIN);
  });

  it("research throws a sanitized error (no webhook token) on webhook failure", async () => {
    // Return a non-ok response so HttpError is thrown
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => "Forbidden",
    } as unknown as Response));

    await expect(
      clayConnector.research!({ domain: DOMAIN, icp: "" }),
    ).rejects.toThrow(/Clay webhook push failed \(403\)/);
  });

  it("clay has no enrich method (push-only phases:['research'])", () => {
    expect(clayConnector.phases).toEqual(["research"]);
    expect(clayConnector.enrich).toBeUndefined();
  });
});

// ===========================================================================
// Resilience: http.ts retries / redirects / body cap / redaction / URL policy
// ===========================================================================

/** A Response-like stub with real Headers (status, body, headers). */
function resp(status: number, body: unknown = {}, headers: Record<string, string> = {}): Response {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    text: async () => text,
  } as unknown as Response;
}

/** fetch stub returning the given responses in order (last one repeats). */
function fetchSeq(...responses: Array<Response | Error>) {
  let i = 0;
  return vi.fn().mockImplementation(async () => {
    const r = responses[Math.min(i, responses.length - 1)]!;
    i++;
    if (r instanceof Error) throw r;
    return r;
  });
}

describe("httpJson resilience", () => {
  const URL_ = "https://api.example.com/v1/thing";

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0); // backoff = 0.5 x 250ms x 2^n
    _clearRedactionRegistry();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    _clearRedactionRegistry();
  });

  it("retries 503 with jittered exponential backoff, then succeeds", async () => {
    const f = fetchSeq(resp(503), resp(503), resp(200, { ok: 1 }));
    vi.stubGlobal("fetch", f);
    const p = httpJson<{ ok: number }>(URL_);
    await vi.advanceTimersByTimeAsync(0);
    expect(f).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(124);
    expect(f).toHaveBeenCalledTimes(1); // first backoff = 125ms
    await vi.advanceTimersByTimeAsync(1);
    expect(f).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(250); // second backoff = 250ms
    expect(f).toHaveBeenCalledTimes(3);
    await expect(p).resolves.toEqual({ ok: 1 });
    expect(String(f.mock.calls[0]?.[0])).toBe(URL_);
    expect((f.mock.calls[0]![1] as RequestInit).redirect).toBe("manual");
  });

  it("gives up after 2 retries and throws HttpError with status + retryAfterMs", async () => {
    const f = fetchSeq(resp(429, "slow down", { "retry-after": "1" }));
    vi.stubGlobal("fetch", f);
    const p = httpJson(URL_).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(5_000);
    const err = await p;
    expect(f).toHaveBeenCalledTimes(3);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(429);
    expect((err as HttpError).retryAfterMs).toBe(1000);
  });

  it("honors Retry-After seconds over the computed backoff", async () => {
    const f = fetchSeq(resp(429, "", { "retry-after": "3" }), resp(200, { ok: 1 }));
    vi.stubGlobal("fetch", f);
    const p = httpJson(URL_);
    await vi.advanceTimersByTimeAsync(2_999);
    expect(f).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(f).toHaveBeenCalledTimes(2);
    await expect(p).resolves.toEqual({ ok: 1 });
  });

  it("caps an HTTP-date Retry-After at 10s", async () => {
    const future = new Date(Date.now() + 60_000).toUTCString();
    const f = fetchSeq(resp(503, "", { "retry-after": future }), resp(200, {}));
    vi.stubGlobal("fetch", f);
    const p = httpJson(URL_);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(f).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(f).toHaveBeenCalledTimes(2);
    await p;
  });

  it("parseRetryAfter handles seconds, HTTP dates and junk", () => {
    expect(parseRetryAfter("2")).toBe(2000);
    expect(
      parseRetryAfter("Thu, 01 Jan 2099 00:00:10 GMT", Date.parse("Thu, 01 Jan 2099 00:00:00 GMT")),
    ).toBe(10_000);
    expect(parseRetryAfter("soon")).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
  });

  it.each([401, 403, 404, 422])("never retries %i", async (status) => {
    const f = fetchSeq(resp(status, "nope"));
    vi.stubGlobal("fetch", f);
    const err = await httpJson(URL_).catch((e: unknown) => e);
    expect(f).toHaveBeenCalledTimes(1);
    expect((err as HttpError).status).toBe(status);
  });

  it("retries network errors and rethrows the original after exhausting retries", async () => {
    const f = fetchSeq(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", f);
    const p = httpJson(URL_).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1_000);
    const err = await p;
    expect(f).toHaveBeenCalledTimes(3);
    expect(err).toBeInstanceOf(TypeError);
  });

  it("does not retry when the caller's AbortSignal is already aborted", async () => {
    const f = fetchSeq(new DOMException("aborted", "AbortError"));
    vi.stubGlobal("fetch", f);
    const ac = new AbortController();
    ac.abort();
    const err = await httpJson(URL_, { signal: ac.signal }).catch((e: unknown) => e);
    expect(f).toHaveBeenCalledTimes(1);
    expect(err).toBeDefined();
    // The combined signal handed to fetch is aborted too.
    expect(((f.mock.calls[0]![1] as RequestInit).signal as AbortSignal).aborted).toBe(true);
  });

  it("follows a same-origin redirect", async () => {
    const f = fetchSeq(resp(302, "", { location: "/v1/moved" }), resp(200, { moved: true }));
    vi.stubGlobal("fetch", f);
    await expect(httpJson(URL_)).resolves.toEqual({ moved: true });
    expect(String(f.mock.calls[1]?.[0])).toBe("https://api.example.com/v1/moved");
  });

  it("refuses a cross-origin redirect (no hop to the other host)", async () => {
    const f = fetchSeq(resp(301, "", { location: "https://evil.example.net/steal" }));
    vi.stubGlobal("fetch", f);
    const err = await httpJson(URL_).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as Error).message).toMatch(/cross-origin redirect/);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("refuses more than 3 redirects", async () => {
    const f = fetchSeq(resp(307, "", { location: "/loop" }));
    vi.stubGlobal("fetch", f);
    const err = await httpJson(URL_).catch((e: unknown) => e);
    expect((err as Error).message).toMatch(/more than 3 redirects/);
    expect(f).toHaveBeenCalledTimes(4);
  });

  it("caps a streamed body at 5 MB and aborts the read", async () => {
    let pulled = 0;
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        pulled++;
        if (pulled > 20) c.close();
        else c.enqueue(new Uint8Array(1024 * 1024));
      },
      cancel,
    });
    vi.stubGlobal("fetch", fetchSeq(new Response(stream, { status: 200 })));
    const err = await httpJson(URL_).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ResponseTooLargeError);
    expect(pulled).toBeLessThanOrEqual(8); // stopped right after crossing 5 MB
    expect(cancel).toHaveBeenCalled();
  });

  it("rejects up front when Content-Length exceeds the cap", async () => {
    vi.stubGlobal(
      "fetch",
      fetchSeq(resp(200, "{}", { "content-length": String(MAX_BODY_BYTES + 1) })),
    );
    await expect(httpJson(URL_)).rejects.toBeInstanceOf(ResponseTooLargeError);
  });

  it("scrubs registered secret values and per-call redact values from error messages", async () => {
    registerSecretForRedaction("sk_live_SUPERSECRET");
    vi.stubGlobal(
      "fetch",
      fetchSeq(resp(400, "bad key sk_live_SUPERSECRET and tok_PERCALL123 echoed")),
    );
    const err = (await httpJson(URL_, { redact: ["tok_PERCALL123"] }).catch(
      (e: unknown) => e,
    )) as HttpError;
    expect(err.message).not.toContain("sk_live_SUPERSECRET");
    expect(err.message).not.toContain("tok_PERCALL123");
    expect(err.body).not.toContain("sk_live_SUPERSECRET");
    expect(err.message).toContain("REDACTED");
  });

  it("rejects non-https URLs except loopback", async () => {
    const f = fetchSeq(resp(200, { ok: 1 }));
    vi.stubGlobal("fetch", f);
    await expect(httpJson("http://api.example.com/x")).rejects.toThrow(/non-https/);
    await expect(httpJson("ftp://api.example.com/x")).rejects.toThrow(/non-https/);
    expect(f).not.toHaveBeenCalled();
    await expect(httpJson("http://localhost:8080/x")).resolves.toEqual({ ok: 1 });
    await expect(httpJson("http://127.0.0.1/x")).resolves.toEqual({ ok: 1 });
  });
});

describe("connector-level secret scrubbing", () => {
  beforeEach(() => {
    clearKeys();
    _clearRedactionRegistry();
    process.env.PDL_API_KEY = "pdl_key_ECHOED_9f8e7d";
    _resetSecretCache();
  });

  it("a vendor that echoes the key in its error body never surfaces it", async () => {
    vi.stubGlobal("fetch", fetchSeq(resp(400, "invalid key pdl_key_ECHOED_9f8e7d")));
    const contacts = [
      { name: "Jane Doe", leadDomain: DOMAIN, email: "jane@acme.com", source: "peopledatalabs" },
    ];
    const err = await peopledatalabsConnector
      .enrich!({ lead: { domain: DOMAIN, companyName: "Acme", source: "x" }, contacts })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(String((err as Error).message)).not.toContain("pdl_key_ECHOED_9f8e7d");
  });
});

// ===========================================================================
// forEachContact — partial results
// ===========================================================================

describe("forEachContact", () => {
  const mk = (name: string, email?: string) => ({ name, email, leadDomain: DOMAIN, source: "x" });
  const http = (status: number) => new HttpError(status, "https://x.test/", "");

  it("keeps earlier and later items when one item 404s (empty, not a failure)", async () => {
    const out = await forEachContact([mk("A One"), mk("B Two"), mk("C Three")], 10, async (c) => {
      if (c.name === "B Two") throw http(404);
      return c.name;
    });
    expect(out.results).toEqual(["A One", "C Three"]);
    expect(out.failures).toEqual([]);
  });

  it("records a non-auth failure and continues", async () => {
    const out = await forEachContact([mk("A One"), mk("B Two")], 10, async (c) => {
      if (c.name === "A One") throw http(500);
      return c.name;
    });
    expect(out.results).toEqual(["B Two"]);
    expect(out.failures).toEqual([{ item: 0, reason: "http", status: 500 }]);
  });

  it("rethrows 401/403 immediately", async () => {
    const fn = vi.fn(async () => {
      throw http(401);
    });
    await expect(forEachContact([mk("A One"), mk("B Two")], 10, fn)).rejects.toMatchObject({
      status: 401,
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("rethrows when every attempted item failed", async () => {
    await expect(
      forEachContact([mk("A One"), mk("B Two")], 10, async () => {
        throw http(502);
      }),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("skips (unknown) and single-token names before spending a lookup, then caps", async () => {
    const fn = vi.fn(async (c: { name: string }) => c.name);
    const out = await forEachContact(
      [mk("(unknown)"), mk("Cher"), mk("A One"), mk("B Two"), mk("C Three")],
      2,
      fn,
    );
    expect(out.results).toEqual(["A One", "B Two"]);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("requireFullName:false keeps single-token names (email-keyed lookups)", async () => {
    const out = await forEachContact([mk("Cher", "cher@acme.com")], 10, async (c) => c.name, {
      requireFullName: false,
    });
    expect(out.results).toEqual(["Cher"]);
  });
});

describe("enrich loops keep partial results", () => {
  beforeEach(() => {
    clearKeys();
    process.env.PDL_API_KEY = "test-pdl-key";
    process.env.HUNTER_API_KEY = "test-hunter-key";
    _resetSecretCache();
  });

  it("PDL: a 404 on the 2nd contact keeps the 1st and 3rd", async () => {
    const f = fetchSeq(
      resp(200, { data: { work_email: "a@acme.com" } }),
      resp(404, "not found"),
      resp(200, { data: { work_email: "c@acme.com" } }),
    );
    vi.stubGlobal("fetch", f);
    const contacts = ["a", "b", "c"].map((x) => ({
      name: x.toUpperCase() + " Person",
      email: x + "@acme.com",
      leadDomain: DOMAIN,
      source: "peopledatalabs",
    }));
    const out = await peopledatalabsConnector.enrich!({
      lead: { domain: DOMAIN, companyName: "Acme", source: "x" },
      contacts,
    });
    expect(out.enrichments.map((e) => e.subjectKey)).toEqual(["a@acme.com", "c@acme.com"]);
    expect(out.failures).toEqual([]);
    expect(String(f.mock.calls[1]?.[0])).toBe(
      "https://api.peopledatalabs.com/v5/person/enrich?email=b%40acme.com",
    );
  });

  it("Hunter: a 401 aborts the whole call (bad key, stop spending)", async () => {
    const f = fetchSeq(resp(401, "unauthorized"));
    vi.stubGlobal("fetch", f);
    const contacts = [
      { name: "Ann Lee", leadDomain: DOMAIN, source: "hunter" },
      { name: "Bo Kim", leadDomain: DOMAIN, source: "hunter" },
    ];
    await expect(
      hunterConnector.enrich!({
        lead: { domain: DOMAIN, companyName: "Acme", source: "x" },
        contacts,
      }),
    ).rejects.toMatchObject({ status: 401 });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("PDL research: company 404 still runs person search", async () => {
    const f = fetchSeq(
      resp(404, "no company"),
      resp(200, { data: [{ full_name: "Ann Lee", work_email: "ann@acme.com" }] }),
    );
    vi.stubGlobal("fetch", f);
    const out = await peopledatalabsConnector.research!({ domain: DOMAIN, icp: "" });
    expect(f).toHaveBeenCalledTimes(2);
    expect(String(f.mock.calls[0]?.[0])).toBe(
      "https://api.peopledatalabs.com/v5/company/enrich?website=acme.com",
    );
    expect(String(f.mock.calls[1]?.[0])).toBe("https://api.peopledatalabs.com/v5/person/search");
    expect(out.leads[0]?.companyName).toBe(DOMAIN);
    expect(out.contacts.map((c) => c.email)).toEqual(["ann@acme.com"]);
    expect(out.failures).toEqual([]);
  });

  it("PDL research: person-search 401 is not swallowed", async () => {
    vi.stubGlobal("fetch", fetchSeq(resp(200, { data: { name: "Acme" } }), resp(401, "bad key")));
    await expect(
      peopledatalabsConnector.research!({ domain: DOMAIN, icp: "" }),
    ).rejects.toMatchObject({ status: 401 });
  });
});

// ===========================================================================
// PII minimization
// ===========================================================================

describe("PII minimization", () => {
  const PERSONAL = {
    personal_emails: ["jane@gmail.com"],
    mobile_phone: "+15550000001",
    phone_numbers: ["+15550000002"],
    location_street_address: "1 Home St",
    birth_date: "1990-01-01",
    birth_year: 1990,
  };

  beforeEach(() => {
    clearKeys();
    delete process.env.INTENT_OUTREACH_KEEP_RAW;
    process.env.PDL_API_KEY = "test-pdl-key";
    process.env.ZOOMINFO_JWT = "test-zi-jwt";
    process.env.APOLLO_API_KEY = "test-apollo-key";
    _resetSecretCache();
  });

  const contact = { name: "Jane Doe", leadDomain: DOMAIN, email: "jane@acme.com", source: "x" };
  const lead = { domain: DOMAIN, companyName: "Acme", source: "x" };

  it("PDL enrichment data keeps B2B fields and drops personal ones", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchWith({
        data: {
          ...PERSONAL,
          full_name: "Jane Doe",
          job_title: "VP Sales",
          job_title_levels: ["vp"],
          job_company_name: "Acme",
          work_email: "jane@acme.com",
          linkedin_url: "linkedin.com/in/jane",
        },
      }),
    );
    const { enrichments } = await peopledatalabsConnector.enrich!({ lead, contacts: [contact] });
    const data = enrichments[0]!.data;
    expect(data).toMatchObject({
      job_title: "VP Sales",
      job_title_levels: ["vp"],
      job_company_name: "Acme",
      work_email: "jane@acme.com",
      linkedin_url: "linkedin.com/in/jane",
    });
    for (const k of Object.keys(PERSONAL)) expect(data).not.toHaveProperty(k);
    expect(JSON.stringify(enrichments)).not.toContain("jane@gmail.com");
  });

  it("INTENT_OUTREACH_KEEP_RAW=1 opts back in to the full payload", async () => {
    process.env.INTENT_OUTREACH_KEEP_RAW = "1";
    _resetSecretCache();
    vi.stubGlobal("fetch", mockFetchWith({ data: { ...PERSONAL, work_email: "jane@acme.com" } }));
    const { enrichments } = await peopledatalabsConnector.enrich!({ lead, contacts: [contact] });
    expect(enrichments[0]!.data).toHaveProperty("personal_emails");
  });

  it("ZoomInfo enrichment data drops mobilePhone and home address", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchWith({
        data: [
          {
            firstName: "Jane",
            lastName: "Doe",
            jobTitle: "VP Sales",
            managementLevel: "VP",
            email: "jane@acme.com",
            directPhone: "+15551112222",
            mobilePhone: "+15550000001",
            street: "1 Home St",
          },
        ],
      }),
    );
    const { enrichments } = await zoominfoConnector.enrich!({ lead, contacts: [contact] });
    expect(enrichments[0]!.phone).toBe("+15551112222");
    expect(enrichments[0]!.data).toMatchObject({ jobTitle: "VP Sales", managementLevel: "VP" });
    expect(enrichments[0]!.data).not.toHaveProperty("mobilePhone");
    expect(enrichments[0]!.data).not.toHaveProperty("street");
  });

  it("Apollo enrichment data drops personal emails and mobile phones", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchWith({
        matches: [
          {
            name: "Jane Doe",
            title: "VP Sales",
            seniority: "vp",
            email: "jane@acme.com",
            personal_emails: ["jane@gmail.com"],
            phone_numbers: [
              { raw_number: "+15550000001", type: "mobile" },
              { raw_number: "+15551112222", type: "work_direct" },
            ],
            organization: { name: "Acme", primary_domain: "acme.com", street_address: "HQ" },
          },
        ],
      }),
    );
    const { enrichments, raw } = await apolloConnector.enrich!({
      lead,
      contacts: [{ name: "Jane Doe", leadDomain: DOMAIN, source: "apollo" }],
    });
    expect(enrichments[0]!.phone).toBe("+15551112222");
    const data = enrichments[0]!.data;
    expect(data).toMatchObject({ title: "VP Sales", seniority: "vp" });
    expect(data).not.toHaveProperty("personal_emails");
    expect(data).not.toHaveProperty("phone_numbers");
    expect(JSON.stringify({ enrichments, raw })).not.toContain("+15550000001");
    expect(JSON.stringify({ enrichments, raw })).not.toContain("jane@gmail.com");
  });
});

// ===========================================================================
// Tolerant schema validation
// ===========================================================================

describe("vendor schema failures are recorded, not TypeErrors", () => {
  beforeEach(() => {
    clearKeys();
    process.env.PDL_API_KEY = "test-pdl-key";
    process.env.APOLLO_API_KEY = "test-apollo-key";
    _resetSecretCache();
  });

  it("PDL enrich: one malformed body becomes a schema failure; the other item survives", async () => {
    vi.stubGlobal(
      "fetch",
      fetchSeq(
        resp(200, { data: { work_email: 12345 } }), // wrong type
        resp(200, { data: { work_email: "b@acme.com" } }),
      ),
    );
    const contacts = ["a", "b"].map((x) => ({
      name: x + " x",
      email: x + "@acme.com",
      leadDomain: DOMAIN,
      source: "peopledatalabs",
    }));
    const out = await peopledatalabsConnector.enrich!({
      lead: { domain: DOMAIN, companyName: "Acme", source: "x" },
      contacts,
    });
    expect(out.enrichments.map((e) => e.subjectKey)).toEqual(["b@acme.com"]);
    expect(out.failures).toHaveLength(1);
    expect(out.failures?.[0]).toMatchObject({ item: 0, reason: "schema" });
    expect(out.failures?.[0]?.detail).toContain("work_email");
  });

  it("Apollo research: a non-array `people` throws a SchemaFailure, not a TypeError", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchSequence([{ organization: { name: "Acme" } }, { people: "oops" }]),
    );
    const err = await apolloConnector
      .research!({ domain: DOMAIN, icp: "" })
      .catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(TypeError);
    expect((err as Error).name).toBe("SchemaFailure");
  });
});

// ===========================================================================
// Domain normalization, Clearbit queued, Clay pushOnly
// ===========================================================================

describe("normalizeDomain", () => {
  it.each([
    ["https://www.Acme.com/about?x=1", "acme.com"],
    ["http://acme.com:8080", "acme.com"],
    ["WWW.ACME.CO.UK.", "acme.co.uk"],
    ["acme.com", "acme.com"],
    ["https://user@sub.acme.io/path", "sub.acme.io"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeDomain(input)).toBe(expected);
  });

  it.each([[""], ["   "], ["not a domain"], [undefined], [42]])("rejects %s", (input) => {
    expect(normalizeDomain(input)).toBeUndefined();
  });

  it("ZoomInfo website URLs are normalized onto lead.domain", async () => {
    clearKeys();
    process.env.ZOOMINFO_JWT = "test-zi-jwt";
    _resetSecretCache();
    vi.stubGlobal(
      "fetch",
      mockFetchSequence([
        { data: [{ name: "Acme", website: "https://www.Acme.com/" }] },
        { data: [] },
      ]),
    );
    const { leads } = await zoominfoConnector.research!({ domain: "x.com", icp: "" });
    expect(leads[0]?.domain).toBe("acme.com");
  });
});

describe("clearbit queued + clay pushOnly", () => {
  beforeEach(() => {
    clearKeys();
    process.env.CLEARBIT_API_KEY = "test-cb-key";
    _resetSecretCache();
  });

  it("clearbit treats a 202-style {error} / queued body as no result", async () => {
    vi.stubGlobal(
      "fetch",
      fetchSeq(resp(202, { error: { type: "queued" } }), resp(200, { status: "queued" })),
    );
    const out = await clearbitConnector.enrich!({
      lead: { domain: DOMAIN, companyName: "Acme", source: "x" },
      contacts: [{ name: "A B", email: "a@acme.com", leadDomain: DOMAIN, source: "x" }],
    });
    expect(out.enrichments).toHaveLength(0);
  });

  it("clay is flagged pushOnly", () => {
    expect(clayConnector.pushOnly).toBe(true);
    expect(apolloConnector.pushOnly).toBeUndefined();
  });
});
