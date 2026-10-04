/**
 * tests/mcp-server.test.ts — the MCP tool handlers (mcp/tools.ts), called directly.
 *
 * save_run must apply the SAME compliance as runCampaign: suppression + pack gate
 * (blocked contacts never saved as messages), the send-safety draft guard
 * (rejectedDrafts), the code-appended CAN-SPAM footer (or needsSenderIdentity),
 * server-derived status, friendly duplicate errors. research_domain/enrich_lead
 * must not leak raw vendor payloads unless debug: true.
 *
 * Every test runs against a fresh tmp INTENT_OUTREACH_HOME — never ~/.intent-outreach.
 * (Spawn-based stdio e2e lives in tests/mcp.e2e.test.ts, owned by the CI stream.)
 */

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  handleEnrichLead,
  handleListConnectors,
  handleResearchDomain,
  handleSaveRun,
  MAX_SAVE_RUN_BYTES,
  type SaveRunArgs,
  type ToolResult,
} from "../mcp/tools.js";
import { addSuppression } from "../pipeline_core/suppressions.js";
import { JsonlRunStore } from "../pipeline_core/store.js";
import { _resetSecretCache } from "../pipeline_core/secrets.js";
import { _resetBuiltins, registerConnector } from "../pipeline_core/connectors/index.js";
import type { Connector } from "../pipeline_core/connectors/types.js";
import { _resetPacks, registerPack } from "../pipeline_core/packs/index.js";
import { FOOTER_DELIMITER } from "../pipeline_core/footer.js";

const FIXED = "2026-06-16T12:00:00.000Z";
const clock = () => FIXED;

const SENDER = {
  name: "Jeremy Longshore",
  company: "intentsolutions.io LLC",
  postalAddress: "26050 Equity Dr, Ste E - 1062\nDaphne, AL 36526",
};

let home: string;
const saved = { ...process.env };

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "io-mcp-home-"));
  process.env.INTENT_OUTREACH_HOME = home;
  delete process.env.INTENT_OUTREACH_PROFILE;
  for (const k of Object.keys(process.env)) {
    if (k.endsWith("_API_KEY") || k === "ZOOMINFO_JWT" || k === "CLAY_WEBHOOK_URL") delete process.env[k];
  }
  _resetSecretCache();
  _resetBuiltins();
  _resetPacks();
});
afterEach(() => {
  process.env = { ...saved };
});

function body(r: ToolResult): any {
  return JSON.parse(r.content[0]!.text);
}

function writeProfile(sender: object | undefined = SENDER): string {
  const path = join(home, "p.json");
  writeFileSync(
    path,
    JSON.stringify({
      name: "Test",
      description: "test profile",
      output: { formats: ["json"] },
      delivery: { targets: ["console"] },
      ...(sender ? { sender } : {}),
    }),
  );
  return path;
}

function baseArgs(over: Partial<SaveRunArgs> = {}): SaveRunArgs {
  return {
    id: "run-mcp-1",
    icp: "B2B SaaS founders",
    domains: ["acme.com"],
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    leads: [{ domain: "acme.com", companyName: "Acme Inc", source: "apollo" }],
    contacts: [
      { name: "Jane Doe", leadDomain: "acme.com", email: "jane@acme.com", source: "apollo" },
      { name: "Bob Roe", leadDomain: "acme.com", email: "bob@acme.com", source: "apollo" },
    ],
    messages: [
      {
        contactKey: "jane@acme.com",
        channel: "email",
        subject: "Scaling Acme",
        body: "Hi Jane, noticed Acme is hiring engineers. Teams at that stage often need X.",
        cta: "Open to a 15-minute call next week?",
        fitScore: 80,
      },
    ],
    ...over,
  } as SaveRunArgs;
}

const store = () => new JsonlRunStore(join(home, "runs.jsonl"));

describe("save_run applies runCampaign's compliance", () => {
  it("blocks a suppressed contact: recorded in blockedContacts, never saved as a message", async () => {
    await addSuppression("jane@acme.com", { reason: "unsubscribed" });
    const res = await handleSaveRun(baseArgs(), { now: clock });
    expect(res.isError).toBeUndefined();
    const run = await store().getRun("run-mcp-1");
    expect(run?.messages).toEqual([]);
    expect(run?.blockedContacts).toEqual([{ contactKey: "jane@acme.com", reason: "suppressed:email" }]);
    expect(body(res).blockedContacts).toEqual([{ contactKey: "jane@acme.com", reason: "suppressed:email" }]);
  });

  it("a suppressed DOMAIN blocks every contact at it", async () => {
    await addSuppression("acme.com");
    await handleSaveRun(baseArgs(), { now: clock });
    const run = await store().getRun("run-mcp-1");
    expect(run?.messages).toEqual([]);
    expect(run?.blockedContacts[0]?.reason).toBe("suppressed:domain");
  });

  it("runs the selected pack's gate (fail-closed) after suppression", async () => {
    registerPack({
      id: "test-dnc",
      displayName: "Test DNC",
      compliance: { check: ({ contact }) => (contact.email === "jane@acme.com" ? { status: "blocked", reason: "dnc" } : { status: "clean" }) },
      prompts: { score: ["research.v2.md"], draft: "outreach.v2.md" },
    });
    await handleSaveRun(baseArgs({ pack: "test-dnc" }), { now: clock });
    const run = await store().getRun("run-mcp-1");
    expect(run?.vertical).toBe("test-dnc");
    expect(run?.blockedContacts).toEqual([{ contactKey: "jane@acme.com", reason: "dnc" }]);
    expect(run?.messages).toEqual([]);
  });

  it("an unregistered pack fails loud and saves nothing", async () => {
    const res = await handleSaveRun(baseArgs({ pack: "nope" }), { now: clock });
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toMatch(/pack not registered: nope/);
    expect(await store().listRunIds()).toEqual([]);
  });

  it("appends the CAN-SPAM footer from the profile sender", async () => {
    const res = await handleSaveRun(baseArgs({ profile: writeProfile() }), { now: clock });
    expect(res.isError).toBeUndefined();
    const run = await store().getRun("run-mcp-1");
    const msg = run!.messages[0]!;
    expect(msg.body).toContain(`\n\n${FOOTER_DELIMITER}\nJeremy Longshore, intentsolutions.io LLC`);
    expect(msg.body).toContain("Daphne, AL 36526");
    expect(msg.needsSenderIdentity).toBe(false);
    expect(run!.complianceWarnings).toEqual([]);
  });

  it("honors INTENT_OUTREACH_PROFILE when no profile input is given", async () => {
    process.env.INTENT_OUTREACH_PROFILE = writeProfile();
    await handleSaveRun(baseArgs(), { now: clock });
    const run = await store().getRun("run-mcp-1");
    expect(run!.messages[0]!.body).toContain(FOOTER_DELIMITER);
  });

  it("no sender identity: saved but flagged needsSenderIdentity with a run warning", async () => {
    const res = await handleSaveRun(baseArgs(), { now: clock });
    const run = await store().getRun("run-mcp-1");
    expect(run!.messages[0]!.needsSenderIdentity).toBe(true);
    expect(run!.messages[0]!.body).not.toContain(FOOTER_DELIMITER);
    expect(run!.complianceWarnings[0]).toMatch(/1 email draft\(s\) have NO CAN-SPAM footer/);
    expect(body(res).needsSenderIdentity).toBe(1);
  });

  it("a missing profile is an error, not a silent footer-less save", async () => {
    const res = await handleSaveRun(baseArgs({ profile: join(home, "missing.json") }), { now: clock });
    expect(res.isError).toBe(true);
    expect(await store().listRunIds()).toEqual([]);
  });

  it("rejects an agent draft that fails the guard (injected url) into rejectedDrafts", async () => {
    const res = await handleSaveRun(
      baseArgs({
        messages: [
          {
            contactKey: "jane@acme.com",
            channel: "email",
            subject: "Quick idea",
            body: "Hi Jane, grab a slot at https://evil.io/book before Friday.",
            cta: "Book now?",
          },
        ],
      }),
      { now: clock },
    );
    expect(res.isError).toBeUndefined();
    const run = await store().getRun("run-mcp-1");
    expect(run?.messages).toEqual([]);
    expect(run?.rejectedDrafts).toHaveLength(1);
    expect(run?.rejectedDrafts[0]?.issues.join(" ")).toMatch(/url not present in inputs/);
    expect(run?.status).toBe("enriched");
  });

  it("allows the contact's verified enrichment phone in an agent draft", async () => {
    const res = await handleSaveRun(
      baseArgs({
        enrichments: [
          {
            subjectType: "contact",
            subjectKey: "jane@acme.com",
            provider: "apollo",
            phone: "+1 415 555 0100",
            data: {},
            fetchedAt: FIXED,
          },
        ],
        messages: [
          {
            contactKey: "jane@acme.com",
            channel: "email",
            subject: "Quick idea",
            body: "Hi Jane, happy to ring +1 415 555 0100 if that is easier.",
            cta: "Worth a chat?",
          },
        ],
      }),
      { now: clock },
    );
    expect(res.isError).toBeUndefined();
    expect((await store().getRun("run-mcp-1"))?.messages).toHaveLength(1);
  });

  it("a draft for a contactKey not in `contacts` is rejected, never guessed", async () => {
    await handleSaveRun(
      baseArgs({
        messages: [{ contactKey: "ghost@acme.com", channel: "email", subject: "Hi", body: "Hello there.", cta: "Chat?" }],
      }),
      { now: clock },
    );
    const run = await store().getRun("run-mcp-1");
    expect(run?.messages).toEqual([]);
    expect(run?.rejectedDrafts[0]).toMatchObject({ contactKey: "ghost@acme.com" });
  });

  it("server-stamps createdAt + origin and derives status (caller errors → partial)", async () => {
    const res = await handleSaveRun(
      baseArgs({
        messages: [
          {
            contactKey: "jane@acme.com",
            channel: "email",
            subject: "Hi",
            body: "Hello Jane, a short note.",
            cta: "Chat?",
            createdAt: "1999-01-01T00:00:00.000Z",
          },
        ],
        errors: [{ domain: "beta.io", stage: "score", message: "boom" }],
        failedConnectors: [{ name: "hunter", phase: "research", status: 401 }],
      }),
      { now: clock },
    );
    expect(body(res).status).toBe("partial");
    const run = await store().getRun("run-mcp-1");
    expect(run?.origin).toBe("agent");
    expect(run?.createdAt).toBe(FIXED);
    expect(run?.messages[0]?.createdAt).toBe(FIXED);
    expect(run?.messages[0]?.model).toBe("claude-sonnet-4-6");
    expect(run?.messages[0]?.promptVersion).toBe("agent");
    expect(run?.failedConnectors).toEqual([{ name: "hunter", phase: "research", status: 401 }]);
  });

  it("normalizes domains and rejects an invalid one", async () => {
    await handleSaveRun(baseArgs({ domains: ["https://WWW.Acme.com/about"] }), { now: clock });
    expect((await store().getRun("run-mcp-1"))?.domains).toEqual(["acme.com"]);
    const bad = await handleSaveRun(baseArgs({ id: "run-bad", domains: ["127.0.0.1"] }), { now: clock });
    expect(bad.isError).toBe(true);
    expect(bad.content[0]?.text).toMatch(/invalid domain/);
  });

  it("enforces input bounds (array max, payload size)", async () => {
    const tooMany = await handleSaveRun(
      baseArgs({ domains: Array.from({ length: 101 }, (_, i) => `d${i}.com`) }),
      { now: clock },
    );
    expect(tooMany.isError).toBe(true);
    const huge = await handleSaveRun(
      baseArgs({
        enrichments: [
          {
            subjectType: "lead",
            subjectKey: "acme.com",
            provider: "x",
            data: { blob: "x".repeat(MAX_SAVE_RUN_BYTES) },
            fetchedAt: FIXED,
          },
        ],
      }),
      { now: clock },
    );
    expect(huge.isError).toBe(true);
    expect(huge.content[0]?.text).toMatch(/payload exceeds/);
  });

  it("duplicate id → friendly error; overwrite: true replaces", async () => {
    expect((await handleSaveRun(baseArgs(), { now: clock })).isError).toBeUndefined();
    const dup = await handleSaveRun(baseArgs(), { now: clock });
    expect(dup.isError).toBe(true);
    expect(dup.content[0]?.text).toBe("run run-mcp-1 already exists; pass overwrite: true to replace");
    const over = await handleSaveRun(baseArgs({ icp: "replaced", overwrite: true }), { now: clock });
    expect(over.isError).toBeUndefined();
    expect((await store().getRun("run-mcp-1"))?.icp).toBe("replaced");
  });

  it("a schema-invalid record is a friendly validation error, not a throw", async () => {
    const res = await handleSaveRun(
      baseArgs({ contacts: [{ name: "", leadDomain: "acme.com", source: "x" }] as never }),
      { now: clock },
    );
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toMatch(/validation failed \(run NOT saved\)/);
  });
});

// ── research_domain / enrich_lead: no raw vendor payloads by default ────────

const rawResearch: Connector = {
  name: "stub-raw",
  displayName: "Stub Raw",
  tier: "free",
  keyEnvVar: null,
  phases: ["research", "enrich"],
  isConfigured: () => true,
  async research({ domain }) {
    return {
      leads: [{ domain, companyName: "Acme", source: "stub-raw" }],
      contacts: [{ name: "Jane Doe", leadDomain: domain, email: `jane@${domain}`, source: "stub-raw" }],
      raw: { people: [{ name: "Secret Person", email: "secret@acme.com" }] },
    };
  },
  async enrich() {
    return { enrichments: [], raw: { people: [{ email: "secret@acme.com" }] } };
  },
};

describe("research_domain / enrich_lead", () => {
  beforeEach(() => registerConnector(rawResearch));

  it("research_domain returns normalized records only; raw only with debug: true", async () => {
    const res = body(await handleResearchDomain({ domain: "acme.com", icp: "x" }));
    expect(res.raw).toBeUndefined();
    expect(JSON.stringify(res)).not.toContain("secret@acme.com");
    expect(res.leads[0].domain).toBe("acme.com");
    expect(res.ran).toEqual(["stub-raw"]);
    const dbg = body(await handleResearchDomain({ domain: "acme.com", icp: "x", debug: true }));
    expect(dbg.raw["stub-raw"].people[0].email).toBe("secret@acme.com");
  });

  it("research_domain rejects an invalid domain with a tool error", async () => {
    const res = await handleResearchDomain({ domain: "localhost", icp: "x" });
    expect(res.isError).toBe(true);
  });

  it("enrich_lead omits raw by default", async () => {
    const res = body(await handleEnrichLead({ domain: "Acme.com", contacts: [{ name: "Jane Doe" }] }));
    expect(res.raw).toBeUndefined();
    expect(JSON.stringify(res)).not.toContain("secret@acme.com");
    expect(res.contacts[0].leadDomain).toBe("acme.com");
    const dbg = body(await handleEnrichLead({ domain: "acme.com", debug: true }));
    expect(dbg.raw["stub-raw"]).toBeDefined();
  });

  it("list_connectors reports the user connector alongside the built-ins", () => {
    const list = body(handleListConnectors()) as { name: string; configured: boolean }[];
    expect(list.find((c) => c.name === "stub-raw")?.configured).toBe(true);
    expect(list.some((c) => c.name === "apollo")).toBe(true);
  });
});
