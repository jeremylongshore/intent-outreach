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
import { apolloConnector } from "../pipeline_core/connectors/apollo.js";
import { hunterConnector } from "../pipeline_core/connectors/hunter.js";
import { crunchbaseConnector } from "../pipeline_core/connectors/crunchbase.js";
import { peopledatalabsConnector } from "../pipeline_core/connectors/peopledatalabs.js";
import { zoominfoConnector } from "../pipeline_core/connectors/zoominfo.js";
import { exaConnector } from "../pipeline_core/connectors/exa.js";
import { leadmagicConnector } from "../pipeline_core/connectors/leadmagic.js";
import { clearbitConnector } from "../pipeline_core/connectors/clearbit.js";
import { clayConnector } from "../pipeline_core/connectors/clay.js";

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

  describe("research – personToContact: name resolution", () => {
    const ORG = {
      organization: { name: "Acme", primary_domain: DOMAIN },
    };

    it("prefers the top-level name field when present", async () => {
      const people = {
        people: [
          {
            name: "Jane Doe",
            first_name: "Jane",
            last_name: "Doe",
            title: "VP Sales",
            email: "jane@acme.com",
          },
        ],
      };
      vi.stubGlobal("fetch", mockFetchSequence([ORG, people]));

      const { contacts } = await apolloConnector.research!({ domain: DOMAIN, icp: "" });

      expect(contacts[0]?.name).toBe("Jane Doe");
      expect(contacts[0]?.email).toBe("jane@acme.com");
      expect(contacts[0]?.title).toBe("VP Sales");
      expect(contacts[0]?.source).toBe("apollo");
    });

    it("joins first_name + last_name when name is absent", async () => {
      const people = {
        people: [{ first_name: "Bob", last_name: "Smith", email: "bob@acme.com" }],
      };
      vi.stubGlobal("fetch", mockFetchSequence([ORG, people]));

      const { contacts } = await apolloConnector.research!({ domain: DOMAIN, icp: "" });

      expect(contacts[0]?.name).toBe("Bob Smith");
    });

    it("falls back to (unknown) when both name and first/last are absent", async () => {
      const people = { people: [{}] };
      vi.stubGlobal("fetch", mockFetchSequence([ORG, people]));

      const { contacts } = await apolloConnector.research!({ domain: DOMAIN, icp: "" });

      expect(contacts[0]?.name).toBe("(unknown)");
    });

    it("drops email when it contains no @ character", async () => {
      const people = {
        people: [{ name: "No Email", email: "not-an-email" }],
      };
      vi.stubGlobal("fetch", mockFetchSequence([ORG, people]));

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
        { name: "Alice", leadDomain: DOMAIN, source: "apollo" as const },
        { name: "Bob", leadDomain: DOMAIN, source: "apollo" as const },
        { name: "Ghost", leadDomain: DOMAIN, source: "apollo" as const },
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
      const contacts = [{ name: "Nobody", leadDomain: DOMAIN, source: "apollo" as const }];

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
    vi.stubGlobal("fetch", mockFetchWith({ data: { email: "invalid" } }));
    const lead = { domain: DOMAIN, companyName: "Acme", source: "hunter" as const };
    const contacts = [{ name: "X", leadDomain: DOMAIN, source: "hunter" as const }];
    const { enrichments } = await hunterConnector.enrich!({ lead, contacts });
    expect(enrichments).toHaveLength(0);
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

  it("enrich produces an enrichment even when entities is empty (defensive)", async () => {
    vi.stubGlobal("fetch", mockFetchWith({ entities: [] }));
    const lead = { domain: DOMAIN, companyName: "Acme", source: "crunchbase" as const };
    const { enrichments } = await crunchbaseConnector.enrich!({ lead, contacts: [] });
    // entity is undefined, but one enrichment is still produced with empty funding
    expect(enrichments).toHaveLength(1);
    expect(enrichments[0]?.subjectKey).toBe(DOMAIN);
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
    // Bob: no full_name, joins first+last; uses personal email as fallback
    expect(contacts[1]?.name).toBe("Bob Jones");
    expect(contacts[1]?.email).toBe("bob@personal.com");
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
    expect(enrichments[0]?.phone).toBe("+15559876");
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

  it("enrich produces an Enrichment with phone from mobilePhone", async () => {
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
    expect(enrichments[0]?.phone).toBe("+15553333444");
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

    const { enrichments } = await exaConnector.enrich!({ lead, contacts: [] });

    expect(enrichments).toHaveLength(1);
    const e = enrichments[0]!;
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
    vi.stubGlobal("fetch", mockFetchWith({ first_name: "Ghost" }));
    const lead = { domain: DOMAIN, companyName: "Acme", source: "leadmagic" as const };
    const contacts = [{ name: "Ghost", leadDomain: DOMAIN, source: "leadmagic" as const }];
    const { enrichments } = await leadmagicConnector.enrich!({ lead, contacts });
    expect(enrichments).toHaveLength(0);
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

  it("enrich splits a single-token name into first only", async () => {
    // Verifies splitName handles mononyms without crashing
    vi.stubGlobal("fetch", mockFetchWith({ email: "mono@acme.com" }));
    const lead = { domain: DOMAIN, companyName: "Acme", source: "leadmagic" as const };
    const contacts = [{ name: "Madonna", leadDomain: DOMAIN, source: "leadmagic" as const }];
    const { enrichments } = await leadmagicConnector.enrich!({ lead, contacts });
    expect(enrichments).toHaveLength(1);
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
