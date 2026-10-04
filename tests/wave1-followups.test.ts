/**
 * tests/wave1-followups.test.ts — Wave 1 follow-ups bundled with #53.
 *
 *   5. runCampaign meters cache read/write tokens, so run.costUsd equals the sum
 *      of the per-call Usage.costUsd (no cache-blind overcount).
 *   6. Connector per-item `failures` are folded into run.failedConnectors.
 *   8. Every adapter forwards the pipeline's AbortSignal to httpJson (fetch sees
 *      it), and enrich adapters stamp Enrichment.contactName.
 *   9. toSlack escapes &, <, > so <!channel>, <@U…> and <url|text> can't inject.
 * (7, the legacy v1 statuses, is asserted against the golden fixture in store.test.ts.)
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCampaign } from "../pipeline_core/pipeline.js";
import { costFor } from "../pipeline_core/cost.js";
import { _resetSecretCache } from "../pipeline_core/secrets.js";
import { _resetBuiltins, registerConnector } from "../pipeline_core/connectors/index.js";
import type { Connector } from "../pipeline_core/connectors/types.js";
import type { LLMProvider } from "../pipeline_core/providers.js";
import type { Usage } from "../pipeline_core/cost.js";
import { EMPTY_SUPPRESSION_LIST } from "../pipeline_core/compliance/suppression.js";
import { apolloConnector } from "../pipeline_core/connectors/apollo.js";
import { hunterConnector } from "../pipeline_core/connectors/hunter.js";
import { crunchbaseConnector } from "../pipeline_core/connectors/crunchbase.js";
import { peopledatalabsConnector } from "../pipeline_core/connectors/peopledatalabs.js";
import { zoominfoConnector } from "../pipeline_core/connectors/zoominfo.js";
import { exaConnector } from "../pipeline_core/connectors/exa.js";
import { leadmagicConnector } from "../pipeline_core/connectors/leadmagic.js";
import { clearbitConnector } from "../pipeline_core/connectors/clearbit.js";
import { clayConnector } from "../pipeline_core/connectors/clay.js";
import { render } from "../pipeline_core/render/index.js";
import { assertCampaignRun } from "../pipeline_core/validator.js";
import { SCHEMA_VERSION } from "../pipeline_core/models.js";

process.env.INTENT_OUTREACH_HOME = mkdtempSync(join(tmpdir(), "io-wave1-home-"));

const FIXED = "2026-06-16T12:00:00.000Z";
const clock = () => FIXED;
const KEYS = [
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
];

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
  _resetSecretCache();
  _resetBuiltins();
  vi.unstubAllGlobals();
});

function clearKeys() {
  for (const k of Object.keys(process.env)) {
    if (k.endsWith("_API_KEY") || KEYS.includes(k)) delete process.env[k];
  }
  _resetSecretCache();
}

const research: Connector = {
  name: "stub-research",
  displayName: "Stub",
  tier: "free",
  keyEnvVar: null,
  phases: ["research"],
  isConfigured: () => true,
  async research({ domain }) {
    return {
      leads: [{ domain, companyName: "Acme", source: "stub-research" }],
      contacts: [{ name: "Jane Doe", leadDomain: domain, email: `jane@${domain}`, source: "stub-research" }],
      failures: [{ item: -1, reason: "schema", detail: "people.0.name" }],
    };
  },
};

const partialEnrich: Connector = {
  name: "stub-partial",
  displayName: "Partial",
  tier: "paid",
  keyEnvVar: null,
  phases: ["enrich"],
  isConfigured: () => true,
  async enrich() {
    return {
      enrichments: [],
      failures: [
        { item: 0, reason: "http", status: 503 },
        { item: 1, reason: "error" },
      ],
    };
  },
};

// ── 5. cache-aware metering ─────────────────────────────────────────────────

describe("runCampaign meters prompt-cache tokens", () => {
  beforeEach(() => {
    clearKeys();
    _resetBuiltins();
    registerConnector(research);
  });

  it("run.costUsd equals the sum of per-call costs computed WITH the cache split", async () => {
    const model = "claude-sonnet-4-6";
    const calls: Usage[] = [];
    const provider: LLMProvider = {
      name: "anthropic",
      model,
      async generateObject({ schema }) {
        const object = schema.parse({
          fitScore: 80,
          fitReason: "fit",
          angles: ["a"],
          subject: "s",
          body: "b",
          cta: "c",
        });
        const cache = { cacheReadTokens: 800, cacheWriteTokens: 100 };
        const usage: Usage = {
          inputTokens: 1000,
          outputTokens: 100,
          costUsd: costFor(model, 1000, 100, cache),
          ...cache,
        };
        calls.push(usage);
        return { object, usage };
      },
    };
    const { run, cost } = await runCampaign({
      id: "cache",
      icp: "x",
      domains: ["acme.com"],
      provider,
      now: clock,
      suppressions: EMPTY_SUPPRESSION_LIST,
    });
    expect(calls).toHaveLength(2); // score + draft
    const expected = calls.reduce((s, u) => s + u.costUsd, 0);
    expect(run.costUsd).toBeCloseTo(expected, 9);
    expect(cost.spentUsd).toBeCloseTo(expected, 6);
    // And it is strictly cheaper than the cache-blind figure the old code recorded.
    expect(expected).toBeLessThan(2 * costFor(model, 1000, 100));
  });
});

// ── 6. per-item failures folded ─────────────────────────────────────────────

describe("connector per-item failures land in run.failedConnectors", () => {
  beforeEach(() => {
    clearKeys();
    _resetBuiltins();
    registerConnector(research);
    registerConnector(partialEnrich);
  });

  it("folds research + enrich failures with phase and sanitized status", async () => {
    const provider: LLMProvider = {
      name: "anthropic",
      model: "claude-sonnet-4-6",
      async generateObject({ schema }) {
        return {
          object: schema.parse({ fitScore: 1, fitReason: "r", angles: [], subject: "s", body: "b", cta: "c" }),
          usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 },
        };
      },
    };
    const { run } = await runCampaign({
      id: "fold",
      icp: "x",
      domains: ["acme.com"],
      provider,
      now: clock,
      suppressions: EMPTY_SUPPRESSION_LIST,
    });
    expect(run.failedConnectors).toEqual([
      { name: "stub-research", phase: "research", status: "schema" },
      { name: "stub-partial", phase: "enrich", status: 503 },
      { name: "stub-partial", phase: "enrich", status: "error" },
    ]);
  });
});

// ── 8. AbortSignal forwarded to fetch + contactName ─────────────────────────

describe("adapters forward the pipeline AbortSignal to httpJson", () => {
  beforeEach(() => {
    clearKeys();
    for (const k of KEYS) process.env[k] = "test-key";
    process.env.CLAY_WEBHOOK_URL = "https://hooks.clay.com/v1/test-webhook";
    _resetSecretCache();
  });

  const lead = { domain: "acme.com", companyName: "Acme", source: "fixture" };
  const noEmail = [{ name: "Jane Doe", leadDomain: "acme.com", source: "fixture" }];
  const withEmail = [{ name: "Jane Doe", leadDomain: "acme.com", email: "jane@acme.com", source: "fixture" }];

  const cases: [string, (signal: AbortSignal) => Promise<unknown>][] = [
    ["apollo.research", (signal) => apolloConnector.research!({ domain: "acme.com", icp: "x", signal })],
    ["apollo.enrich", (signal) => apolloConnector.enrich!({ lead, contacts: noEmail, signal })],
    ["hunter.research", (signal) => hunterConnector.research!({ domain: "acme.com", icp: "x", signal })],
    ["hunter.enrich", (signal) => hunterConnector.enrich!({ lead, contacts: noEmail, signal })],
    ["crunchbase.enrich", (signal) => crunchbaseConnector.enrich!({ lead, contacts: [], signal })],
    ["pdl.research", (signal) => peopledatalabsConnector.research!({ domain: "acme.com", icp: "x", signal })],
    ["pdl.enrich", (signal) => peopledatalabsConnector.enrich!({ lead, contacts: withEmail, signal })],
    ["zoominfo.research", (signal) => zoominfoConnector.research!({ domain: "acme.com", icp: "x", signal })],
    ["zoominfo.enrich", (signal) => zoominfoConnector.enrich!({ lead, contacts: withEmail, signal })],
    ["exa.research", (signal) => exaConnector.research!({ domain: "acme.com", icp: "x", signal })],
    ["exa.enrich", (signal) => exaConnector.enrich!({ lead, contacts: [], signal })],
    ["leadmagic.enrich", (signal) => leadmagicConnector.enrich!({ lead, contacts: noEmail, signal })],
    ["clearbit.enrich", (signal) => clearbitConnector.enrich!({ lead, contacts: withEmail, signal })],
    ["clay.research", (signal) => clayConnector.research!({ domain: "acme.com", icp: "x", signal })],
  ];

  for (const [label, call] of cases) {
    it(`${label}: every fetch sees the caller's (aborted) signal`, async () => {
      const seen: boolean[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: unknown, init?: RequestInit) => {
          seen.push(init?.signal?.aborted === true);
          return { ok: true, status: 200, headers: new Headers(), text: async () => "{}" } as unknown as Response;
        }),
      );
      const controller = new AbortController();
      controller.abort(new Error("caller cancelled"));
      await call(controller.signal).catch(() => undefined);
      expect(seen.length).toBeGreaterThan(0);
      // httpJson links the caller's signal to its per-attempt controller, so an
      // already-aborted caller signal means fetch got an aborted signal. Without
      // the plumbing, fetch would see a live (non-aborted) per-attempt signal.
      expect(seen.every(Boolean)).toBe(true);
    });
  }
});

describe("enrich adapters stamp Enrichment.contactName", () => {
  beforeEach(() => {
    clearKeys();
    for (const k of KEYS) process.env[k] = "test-key";
    _resetSecretCache();
  });
  const lead = { domain: "acme.com", companyName: "Acme", source: "fixture" };
  const json = (body: unknown) =>
    vi.fn(async () => ({ ok: true, status: 200, headers: new Headers(), text: async () => JSON.stringify(body) }));

  it("hunter + leadmagic: the requested contact's name", async () => {
    const contacts = [{ name: "Jane Doe", leadDomain: "acme.com", source: "fixture" }];
    vi.stubGlobal("fetch", json({ data: { email: "jdoe@acme.com" } }));
    expect((await hunterConnector.enrich!({ lead, contacts })).enrichments[0]?.contactName).toBe("Jane Doe");
    vi.stubGlobal("fetch", json({ email: "jdoe@acme.com", first_name: "Janet" }));
    expect((await leadmagicConnector.enrich!({ lead, contacts })).enrichments[0]?.contactName).toBe("Jane Doe");
  });

  it("apollo: index-aligned bulk_match maps each match to the right contact", async () => {
    const contacts = [
      { name: "Jane Doe", leadDomain: "acme.com", source: "fixture" },
      { name: "Bob Roe", leadDomain: "acme.com", source: "fixture" },
    ];
    vi.stubGlobal("fetch", json({ matches: [null, { email: "bob@acme.com", name: "Robert Roe" }] }));
    const { enrichments } = await apolloConnector.enrich!({ lead, contacts });
    expect(enrichments.map((e) => [e.verifiedEmail, e.contactName])).toEqual([["bob@acme.com", "Bob Roe"]]);
  });

  it("pdl + zoominfo: the contact the email-keyed lookup was for", async () => {
    const contacts = [{ name: "Jane Doe", leadDomain: "acme.com", email: "jane@acme.com", source: "fixture" }];
    vi.stubGlobal("fetch", json({ data: { full_name: "jane doe", work_email: "jane@acme.com" } }));
    expect((await peopledatalabsConnector.enrich!({ lead, contacts })).enrichments[0]?.contactName).toBe(
      "Jane Doe",
    );
    vi.stubGlobal("fetch", json({ data: [{ firstName: "Jane", lastName: "Doe" }] }));
    expect((await zoominfoConnector.enrich!({ lead, contacts })).enrichments[0]?.contactName).toBe("Jane Doe");
  });
});

// ── 9. Slack mrkdwn escaping ────────────────────────────────────────────────

describe("toSlack escapes run data (no mrkdwn injection)", () => {
  it("encodes &, <, > in icp, id, contact key and draft body", () => {
    const run = assertCampaignRun({
      id: "run-<b>",
      schemaVersion: SCHEMA_VERSION,
      icp: "<!channel> & <@U123ABC> founders",
      domains: ["acme.com"],
      provider: "anthropic",
      model: "m",
      status: "complete",
      messages: [
        {
          contactKey: "<!here>@acme.com",
          channel: "email",
          body: "Click <https://evil.example|your bank> now & win",
          cta: "c",
          model: "m",
          promptVersion: "outreach.v1",
          createdAt: FIXED,
        },
      ],
      createdAt: FIXED,
    });
    const r = render(run, "slack");
    if (r.format !== "slack") throw new Error("expected slack");
    const all = [r.value.text, ...(r.value.blocks ?? []).map((b) => b.text?.text ?? "")].join("\n");
    expect(all).not.toMatch(/<!channel>|<@U123ABC>|<!here>|<https:\/\/evil/);
    expect(r.value.text).toContain("ICP: &lt;!channel&gt; &amp; &lt;@U123ABC&gt; founders");
    expect(r.value.text).toContain("run-&lt;b&gt;");
    expect(all).toContain("&lt;https://evil.example|your bank&gt; now &amp; win");
    expect(all).toContain("&lt;!here&gt;@acme.com");
  });
});
