/**
 * tests/pipeline.test.ts — full-pipeline acceptance (017-AT-DECR §10).
 *
 * #2 plugin/standalone runs a full campaign → a VALIDATED CampaignRun in the store.
 * #4 a non-Anthropic provider still passes the validator.
 * #6 determinism: same input ⇒ identical run + identical connector call order.
 *
 * No live API calls: the LLM provider and the connectors are deterministic stubs.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_DOMAINS,
  deriveRunStatus,
  normalizeDomain,
  normalizeDomains,
  runCampaign,
  runEnrich,
  runResearch,
} from "../pipeline_core/pipeline.js";
import { MemoryRunStore } from "../pipeline_core/store.js";
import { _resetSecretCache } from "../pipeline_core/secrets.js";
import { _resetBuiltins, registerConnector } from "../pipeline_core/connectors/index.js";
import type { Connector } from "../pipeline_core/connectors/types.js";
import type { LLMProvider, ProviderName } from "../pipeline_core/providers.js";

const FIXED = "2026-06-16T12:00:00.000Z";
const clock = () => FIXED;

const stubResearch: Connector = {
  name: "stub-research",
  displayName: "Stub Research",
  tier: "free",
  keyEnvVar: null,
  phases: ["research"],
  isConfigured: () => true,
  async research({ domain }) {
    return {
      leads: [{ domain, companyName: "Acme Inc", industry: "SaaS", source: "stub-research" }],
      contacts: [
        { name: "Jane Doe", leadDomain: domain, email: `jane@${domain}`, title: "VP Eng", source: "stub-research" },
      ],
    };
  },
};

const stubEnrich: Connector = {
  name: "stub-enrich",
  displayName: "Stub Enrich",
  tier: "free",
  keyEnvVar: null,
  phases: ["enrich"],
  isConfigured: () => true,
  async enrich({ lead }) {
    return {
      enrichments: [
        {
          subjectType: "lead",
          subjectKey: lead.domain,
          provider: "stub-enrich",
          funding: { lastRound: "Series A", totalRaisedUsd: 10_000_000 },
          data: {},
          fetchedAt: FIXED,
        },
      ],
    };
  },
};

/** A provider that returns deterministic structured output for any schema. */
function stubProvider(name: ProviderName): LLMProvider {
  return {
    name,
    model: "stub-model",
    async generateObject({ schema }) {
      // zod strips unknown keys, so one superset satisfies both seam schemas.
      const object = schema.parse({
        fitScore: 75,
        fitReason: "Matches the ICP on industry and size.",
        angles: ["Just raised a Series A — likely scaling GTM."],
        subject: "Scaling Acme's GTM",
        body: "Hi Jane — saw Acme raised a Series A; teams at that stage often need X.",
        cta: "Open to a 15-min call next week?",
      });
      return { object, usage: { inputTokens: 50, outputTokens: 40, costUsd: 0 } };
    },
  };
}

describe("runCampaign full pipeline", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    _resetBuiltins();
    _resetSecretCache();
    for (const k of Object.keys(process.env)) {
      if (k.endsWith("_API_KEY") || k === "ZOOMINFO_JWT" || k === "CLAY_WEBHOOK_URL") delete process.env[k];
    }
    registerConnector(stubResearch);
    registerConnector(stubEnrich);
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("#2 runs a full campaign and produces a validated CampaignRun in the store", async () => {
    const { run, cost } = await runCampaign({
      id: "run-acceptance-2",
      icp: "B2B SaaS founders doing their own outbound",
      domains: ["acme.com"],
      provider: stubProvider("anthropic"),
      now: clock,
    });

    expect(run.status).toBe("complete");
    expect(run.leads.map((l) => l.domain)).toContain("acme.com");
    expect(run.contacts.some((c) => c.email === "jane@acme.com")).toBe(true);
    expect(run.enrichments[0]?.funding?.lastRound).toBe("Series A");
    expect(run.messages).toHaveLength(1);
    expect(run.messages[0]?.body).toContain("Series A");
    expect(run.messages[0]?.fitScore).toBe(75);
    expect(cost.calls).toBe(2); // one score + one draft

    const store = new MemoryRunStore();
    await store.saveRun(run); // only compiles because run is Validated<CampaignRun>
    expect((await store.getRun("run-acceptance-2"))?.id).toBe("run-acceptance-2");
  });

  it("#4 a non-Anthropic provider still passes the validator", async () => {
    const { run } = await runCampaign({
      id: "run-byo-openai",
      icp: "B2B SaaS founders",
      domains: ["acme.com"],
      provider: stubProvider("openai"),
      now: clock,
    });
    expect(run.provider).toBe("openai");
    expect(run.messages).toHaveLength(1); // validated identically regardless of provider
  });

  it("#6 same input ⇒ byte-identical run (deterministic)", async () => {
    const opts = {
      id: "run-determinism",
      icp: "B2B SaaS founders",
      domains: ["acme.com"],
      provider: stubProvider("anthropic"),
      now: clock,
    };
    const a = await runCampaign(opts);
    const b = await runCampaign(opts);
    expect(JSON.stringify(a.run)).toBe(JSON.stringify(b.run));
  });

  it("#6 research calls connectors in a stable order across runs", async () => {
    const first = (await runResearch("acme.com", "icp")).ran;
    const second = (await runResearch("acme.com", "icp")).ran;
    expect(first).toEqual(second);
    expect(first).toEqual(["stub-research"]);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Hardening: failure isolation, connector failures, enrichment merge, domains,
// bounds, provenance, status derivation.
// ──────────────────────────────────────────────────────────────────────────

/** Provider whose Nth call (1-based) throws `err`; every other call succeeds. */
function throwingOnCall(n: number, err: unknown): LLMProvider {
  const base = stubProvider("anthropic");
  let calls = 0;
  return {
    ...base,
    async generateObject(args) {
      calls += 1;
      if (calls === n) throw err;
      return base.generateObject(args);
    },
  };
}

/** An AI-SDK-shaped NoObjectGeneratedError (carries usage + finishReason). */
function noObjectError(): Error {
  return Object.assign(new Error("No object generated: response did not match schema."), {
    name: "AI_NoObjectGeneratedError",
    usage: { inputTokens: 1000, outputTokens: 500 },
    finishReason: "length",
  });
}

function resetEnv(saved: NodeJS.ProcessEnv) {
  _resetBuiltins();
  _resetSecretCache();
  for (const k of Object.keys(process.env)) {
    if (k.endsWith("_API_KEY") || k === "ZOOMINFO_JWT" || k === "CLAY_WEBHOOK_URL") delete process.env[k];
  }
  return saved;
}

describe("runCampaign failure isolation", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    resetEnv(saved);
    registerConnector(stubResearch);
    registerConnector(stubEnrich);
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("a provider throw on the 2nd domain's SCORE yields a persistable partial run with errors[]", async () => {
    // calls: 1=score acme, 2=draft acme, 3=score beta (throws)
    const { run, cost } = await runCampaign({
      id: "run-partial-score",
      icp: "B2B SaaS founders",
      domains: ["acme.com", "beta.io"],
      provider: throwingOnCall(3, noObjectError()),
      now: clock,
    });

    expect(run.status).toBe("partial");
    expect(run.messages.map((m) => m.contactKey)).toEqual(["jane@acme.com"]);
    expect(run.errors).toHaveLength(1);
    expect(run.errors[0]).toMatchObject({ domain: "beta.io", stage: "score", finishReason: "length" });
    expect(run.errors[0]?.contactKey).toBeUndefined();
    expect(run.errors[0]?.message).toMatch(/No object generated/);
    // Both leads were still researched + recorded.
    expect(run.leads.map((l) => l.domain)).toEqual(["acme.com", "beta.io"]);
    // The failed call's usage is metered (2 ok calls + 1 errored call with usage).
    expect(cost.calls).toBe(3);
    expect(cost.inputTokens).toBe(50 + 50 + 1000);

    const store = new MemoryRunStore();
    await store.saveRun(run);
    expect((await store.getRun("run-partial-score"))?.status).toBe("partial");
  });

  it("a DRAFT throw is isolated to that contact and recorded with its contactKey", async () => {
    const { run } = await runCampaign({
      id: "run-partial-draft",
      icp: "B2B SaaS founders",
      domains: ["acme.com", "beta.io"],
      provider: throwingOnCall(2, new Error("upstream 529 overloaded")),
      now: clock,
    });
    expect(run.status).toBe("partial");
    expect(run.messages.map((m) => m.contactKey)).toEqual(["jane@beta.io"]);
    expect(run.errors).toEqual([
      { domain: "acme.com", contactKey: "jane@acme.com", stage: "draft", message: "upstream 529 overloaded" },
    ]);
  });

  it("every LLM call failing → status failed, run still assembles (nothing lost silently)", async () => {
    const provider: LLMProvider = {
      ...stubProvider("anthropic"),
      generateObject: async () => {
        throw new Error("down");
      },
    };
    const { run } = await runCampaign({ id: "run-all-fail", icp: "x", domains: ["acme.com"], provider, now: clock });
    expect(run.status).toBe("failed");
    expect(run.errors).toHaveLength(1);
    expect(run.leads).toHaveLength(1);
  });

  it("error messages are redacted before they reach the record", async () => {
    const provider = throwingOnCall(
      1,
      new Error("GET https://api.example/v1?api_key=SECRET123abc failed; Bearer sk-abcdefghijklmnop"),
    );
    const { run } = await runCampaign({ id: "run-redact", icp: "x", domains: ["acme.com"], provider, now: clock });
    const text = JSON.stringify(run);
    expect(text).not.toContain("SECRET123abc");
    expect(text).not.toContain("sk-abcdefghijklmnop");
    expect(run.errors[0]?.message).toContain("api_key=[redacted]");
  });

  it("a draft that fails validation goes to rejectedDrafts instead of vanishing", async () => {
    // The first now() after the draft call is the message createdAt — make it invalid.
    let poison = false;
    const base = stubProvider("anthropic");
    const provider: LLMProvider = {
      ...base,
      async generateObject(args) {
        const out = await base.generateObject(args);
        if ("body" in (out.object as object)) poison = true;
        return out;
      },
    };
    const poisonClock = () => {
      if (poison) {
        poison = false;
        return "not-a-datetime";
      }
      return FIXED;
    };
    const { run } = await runCampaign({ id: "run-rejected", icp: "x", domains: ["acme.com"], provider, now: poisonClock });
    expect(run.messages).toHaveLength(0);
    expect(run.rejectedDrafts).toHaveLength(1);
    expect(run.rejectedDrafts[0]?.contactKey).toBe("jane@acme.com");
    expect(run.rejectedDrafts[0]?.issues.join(" ")).toMatch(/createdAt/);
  });

  it("promptVersion derives from the pack's draft prompt file (b2b-sdr: outreach.v1.md)", async () => {
    const { run } = await runCampaign({
      id: "run-pv",
      icp: "x",
      domains: ["acme.com"],
      provider: stubProvider("anthropic"),
      now: clock,
    });
    expect(run.messages[0]?.promptVersion).toBe("outreach.v1");
  });
});

describe("connector failures vs skips", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    resetEnv(saved);
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("a throwing connector lands in failedConnectors, never in skipped", async () => {
    registerConnector(stubResearch);
    registerConnector({
      ...stubResearch,
      name: "broken",
      async research() {
        throw new Error("boom with ?api_key=SHOULD_NOT_LEAK");
      },
    });
    registerConnector(stubEnrich);
    const res = await runResearch("acme.com", "icp");
    expect(res.failedConnectors).toEqual([{ name: "broken", phase: "research", status: "error" }]);
    expect(res.skipped).not.toContain("broken");
    expect(JSON.stringify(res)).not.toContain("SHOULD_NOT_LEAK");

    const { run } = await runCampaign({
      id: "run-fc",
      icp: "x",
      domains: ["acme.com"],
      provider: stubProvider("anthropic"),
      now: clock,
    });
    expect(run.failedConnectors).toEqual([{ name: "broken", phase: "research", status: "error" }]);
    expect(run.skippedConnectors).not.toContain("broken");
    expect(run.status).toBe("complete"); // a connector failure alone doesn't degrade the draft outcome
  });

  it("a connector that ignores its deadline is cut off and recorded as a timeout", async () => {
    let seenSignal: AbortSignal | undefined;
    registerConnector({
      ...stubResearch,
      name: "hangs",
      research({ signal }) {
        seenSignal = signal;
        return new Promise(() => {}); // never settles, ignores the signal
      },
    });
    registerConnector(stubResearch);
    const res = await runResearch("acme.com", "icp", { connectorTimeoutMs: 20 });
    expect(seenSignal).toBeInstanceOf(AbortSignal);
    expect(seenSignal?.aborted).toBe(true);
    expect(res.failedConnectors).toEqual([{ name: "hangs", phase: "research", status: "timeout" }]);
    expect(res.ran).toEqual(["stub-research"]); // the next connector still ran
  });

  it("a push-only connector running does not count as research having run", async () => {
    const pushSink = {
      ...stubResearch,
      name: "push-sink",
      pushOnly: true,
      async research() {
        return { leads: [], contacts: [] };
      },
    };
    registerConnector(pushSink as Connector);
    const { run } = await runCampaign({
      id: "run-push",
      icp: "x",
      domains: ["acme.com"],
      provider: stubProvider("anthropic"),
      now: clock,
    });
    expect(run.status).toBe("failed"); // not "researched": no data connector ran
  });

  it("leads from two connectors for one domain merge by normalized domain and concatenate sources", async () => {
    registerConnector(stubResearch);
    registerConnector({
      ...stubResearch,
      name: "second",
      async research({ domain }) {
        return { leads: [{ domain: `WWW.${domain.toUpperCase()}`, companyName: "Acme", source: "second" }], contacts: [] };
      },
    });
    const res = await runResearch("acme.com", "icp");
    expect(res.leads).toHaveLength(1);
    expect(res.leads[0]?.source).toBe("stub-research,second");
  });
});

describe("enrichment merge", () => {
  beforeEach(() => {
    _resetBuiltins();
    _resetSecretCache();
  });

  it("a later (paid) connector skips contacts an earlier connector already found an email for", async () => {
    const seenByPaid: { name: string; email?: string }[][] = [];
    registerConnector({
      ...stubEnrich,
      name: "free-finder",
      async enrich({ contacts }) {
        return {
          enrichments: contacts
            .filter((c) => !c.email && c.name === "Ann Lee")
            .map(() => ({
              subjectType: "contact" as const,
              subjectKey: "ann@acme.com",
              provider: "free-finder",
              verifiedEmail: "ann@acme.com",
              data: { first_name: "Ann", last_name: "Lee" },
              fetchedAt: FIXED,
            })),
        };
      },
    });
    registerConnector({
      ...stubEnrich,
      name: "paid-finder",
      async enrich({ contacts }) {
        seenByPaid.push(contacts.map((c) => ({ name: c.name, email: c.email })));
        return { enrichments: [] };
      },
    });
    const lead = { domain: "acme.com", companyName: "Acme", source: "t" };
    const res = await runEnrich(lead, [
      { name: "Ann Lee", leadDomain: "acme.com", source: "t" },
      { name: "Bob Roe", leadDomain: "acme.com", source: "t" },
    ]);
    expect(seenByPaid[0]).toEqual([
      { name: "Ann Lee", email: "ann@acme.com" },
      { name: "Bob Roe", email: undefined },
    ]);
    expect(seenByPaid[0]?.filter((c) => !c.email).map((c) => c.name)).toEqual(["Bob Roe"]);
    expect(res.contacts.find((c) => c.name === "Ann Lee")?.email).toBe("ann@acme.com");
    expect(res.contacts.find((c) => c.name === "Bob Roe")?.email).toBeUndefined();
  });

  it("an unattributable email is never guessed onto a contact when ambiguous", async () => {
    registerConnector({
      ...stubEnrich,
      name: "mystery",
      async enrich() {
        return {
          enrichments: [
            { subjectType: "contact" as const, subjectKey: "x@acme.com", provider: "m", verifiedEmail: "x@acme.com", data: {}, fetchedAt: FIXED },
          ],
        };
      },
    });
    const res = await runEnrich({ domain: "acme.com", companyName: "Acme", source: "t" }, [
      { name: "A", leadDomain: "acme.com", source: "t" },
      { name: "B", leadDomain: "acme.com", source: "t" },
    ]);
    expect(res.contacts.every((c) => c.email === undefined)).toBe(true);
  });
});

describe("domain normalization + bounds", () => {
  beforeEach(() => {
    _resetBuiltins();
    _resetSecretCache();
  });

  it.each([
    ["acme.com", "acme.com"],
    ["  ACME.com  ", "acme.com"],
    ["https://www.Acme.com:443/about?x=1#y", "acme.com"],
    ["http://sub.acme.co.uk/", "sub.acme.co.uk"],
    ["www.acme.io.", "acme.io"],
    ["user:pw@acme.com", "acme.com"],
    ["münchen.de", "xn--mnchen-3ya.de"],
  ])("normalizeDomain(%j) === %j", (input, expected) => {
    expect(normalizeDomain(input)).toBe(expected);
  });

  it.each(["", "   ", "localhost", "acme", "192.168.1.1", "acme..com", "-acme.com", "ac me.com", "acme.c0m"])(
    "normalizeDomain rejects %j",
    (bad) => {
      expect(() => normalizeDomain(bad)).toThrow(/invalid domain/);
    },
  );

  it("normalizeDomains dedupes after normalizing, preserving order", () => {
    expect(normalizeDomains(["https://www.acme.com/x", "beta.io", "ACME.com"])).toEqual(["acme.com", "beta.io"]);
  });

  it("runCampaign normalizes + dedupes input domains (one research pass per real domain)", async () => {
    const domainsSeen: string[] = [];
    registerConnector({
      ...stubResearch,
      async research(i) {
        domainsSeen.push(i.domain);
        return stubResearch.research!(i);
      },
    });
    const { run } = await runCampaign({
      id: "run-norm",
      icp: "x",
      domains: ["https://www.Acme.com/", "acme.com", "ACME.COM"],
      provider: stubProvider("anthropic"),
      now: clock,
    });
    expect(run.domains).toEqual(["acme.com"]);
    expect(domainsSeen).toEqual(["acme.com"]);
  });

  it("runCampaign rejects an invalid domain up front", async () => {
    await expect(
      runCampaign({ id: "r", icp: "x", domains: ["not a domain"], provider: stubProvider("anthropic"), now: clock }),
    ).rejects.toThrow(/invalid domain/);
  });

  it(`maxDomains defaults to ${DEFAULT_MAX_DOMAINS} and throws above it unless allowLarge`, async () => {
    registerConnector(stubResearch);
    const many = Array.from({ length: DEFAULT_MAX_DOMAINS + 1 }, (_, i) => `d${i}.com`);
    await expect(
      runCampaign({ id: "r", icp: "x", domains: many, provider: stubProvider("anthropic"), now: clock }),
    ).rejects.toThrow(/exceeds maxDomains=25/);

    await expect(
      runCampaign({
        id: "r",
        icp: "x",
        domains: ["a.com", "b.com", "c.com"],
        maxDomains: 2,
        provider: stubProvider("anthropic"),
        now: clock,
      }),
    ).rejects.toThrow(/allowLarge/);

    const { run } = await runCampaign({
      id: "r-large",
      icp: "x",
      domains: ["a.com", "b.com", "c.com"],
      maxDomains: 2,
      allowLarge: true,
      provider: stubProvider("anthropic"),
      now: clock,
    });
    expect(run.domains).toHaveLength(3);
  });
});

describe("deriveRunStatus", () => {
  it.each([
    [{ messages: 2, leads: 1, researchRan: true, errors: 0 }, "complete"],
    [{ messages: 1, leads: 2, researchRan: true, errors: 1 }, "partial"],
    [{ messages: 1, leads: 1, researchRan: true, errors: 0, rejectedDrafts: 1 }, "partial"],
    [{ messages: 0, leads: 2, researchRan: true, errors: 2 }, "failed"],
    [{ messages: 0, leads: 1, researchRan: true, errors: 0 }, "enriched"],
    [{ messages: 0, leads: 0, researchRan: true, errors: 0 }, "researched"],
    [{ messages: 0, leads: 0, researchRan: false, errors: 0 }, "failed"],
  ] as const)("%j → %s", (input, expected) => {
    expect(deriveRunStatus(input)).toBe(expected);
  });
});
