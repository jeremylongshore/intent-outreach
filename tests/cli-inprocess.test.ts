/**
 * tests/cli-inprocess.test.ts — the CLI commands run in-process through
 * `main(argv)` (the spawned e2e tests prove the binary; these exercise the
 * command code itself): suppress, approvals, check-send, monitor, property-run.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main, UsageError } from "../cli.js";
import { messageDigest } from "../pipeline_core/approvals.js";
import { _resetBuiltins, registerConnector } from "../pipeline_core/connectors/index.js";
import type { ResearchOutput } from "../pipeline_core/connectors/types.js";
import { propertyKey, SCHEMA_VERSION } from "../pipeline_core/models.js";
import { _resetSecretCache } from "../pipeline_core/secrets.js";
import { EncryptedSqliteRunStore } from "../pipeline_core/encrypted-store.js";
import { assertCampaignRun } from "../pipeline_core/validator.js";

let out = "";
const T = "2026-10-06T12:00:00.000Z";

beforeEach(() => {
  vi.useFakeTimers({ now: Date.parse(T), toFake: ["Date"] });
  out = "";
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
    out += String(chunk);
    return true;
  });
  process.exitCode = undefined;
  _resetBuiltins();
  _resetSecretCache();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

function withStdin(text: string) {
  Object.defineProperty(process, "stdin", { value: Readable.from([Buffer.from(text)]), configurable: true });
}

describe("suppress", () => {
  it("add / list / remove, with --kind and --reason", async () => {
    await main(["suppress", "add", "(251) 555-0100", "--reason", "STOP"]);
    expect(out).toContain("suppressed: phone +12515550100");
    await main(["suppress", "add", "12 Main St, Foley, AL 36535", "--kind", "address"]);
    await main(["suppress", "list"]);
    expect(out).toMatch(/address\s+12 MAIN ST/);
    await main(["suppress", "remove", "251-555-0100"]);
    expect(out).toContain("removed");
    await expect(main(["suppress", "add", "x", "--kind", "fax"])).rejects.toBeInstanceOf(UsageError);
    await expect(main(["suppress"])).rejects.toBeInstanceOf(UsageError);
  });
});

describe("approvals + check-send", () => {
  const body = "Hi Jane, a quick note about Acme.";
  const seed = async () =>
    new EncryptedSqliteRunStore().saveRun(
      assertCampaignRun({
        id: "r1",
        schemaVersion: SCHEMA_VERSION,
        icp: "x",
        domains: ["acme.com"],
        provider: "anthropic",
        model: "stub",
        status: "complete",
        messages: [
          { contactKey: "jane@acme.com", channel: "linkedin", body, cta: "Call?", model: "stub", promptVersion: "p", createdAt: T },
        ],
        createdAt: T,
      }),
    );

  it("pending → approve (digest) → check-send passes; reject flips it", async () => {
    await seed();
    await main(["approvals", "pending", "--json"]);
    const [p] = JSON.parse(out);
    await expect(main(["approvals", "approve", "r1", "jane@acme.com"])).rejects.toBeInstanceOf(UsageError);
    await main(["approvals", "approve", "r1", "jane@acme.com", "--digest", p.digest, "--note", "ok"]);
    expect(out).toContain("approved: r1 jane@acme.com");
    out = "";
    await main(["approvals", "pending"]);
    expect(out).toContain("nothing waiting for approval");

    const input = { message: { channel: "linkedin", body, cta: "Call?" }, channel: "linkedin", contactEmail: "jane@acme.com", runId: "r1", contactKey: "jane@acme.com", now: T };
    expect(messageDigest(input.message as never)).toBe(messageDigest({ channel: "linkedin", body, cta: "Call?" }));
    withStdin(JSON.stringify(input));
    out = "";
    await main(["check-send"]);
    expect(JSON.parse(out)).toMatchObject({ sendable: true, reasons: [] });
    expect(process.exitCode).toBeUndefined();

    const crmPath = join(process.env.INTENT_OUTREACH_HOME!, "crm-send.json");
    writeFileSync(crmPath, JSON.stringify({ version: 1, source: "erpnext", generatedAt: T, expiresAt: new Date(Date.parse(T) + 900_000).toISOString(), suppressions: [{ kind: "email", value: "jane@acme.com" }, { kind: "party", value: "jane@acme.com" }], doNotResearch: [] }));
    withStdin(JSON.stringify(input));
    out = "";
    await main(["check-send", "--crm-context", crmPath]);
    expect(JSON.parse(out).sendable).toBe(false);
    expect(JSON.parse(out).reasons).toContain("suppressed:crm");
    expect(JSON.parse(out).reasons).toContain("suppressed:email");
    expect(process.exitCode).toBe(3);

    await main(["approvals", "reject", "r1", "jane@acme.com", "--note", "changed my mind"]);
    withStdin(JSON.stringify(input));
    out = "";
    await main(["check-send"]);
    expect(JSON.parse(out).reasons).toContain("approval:rejected");
    expect(process.exitCode).toBe(3);

    withStdin("{nope");
    await expect(main(["check-send"])).rejects.toBeInstanceOf(UsageError);
  });
});

describe("monitor", () => {
  const p = (apn: string, owner: string): ResearchOutput => {
    const prop = { key: propertyKey("12033", apn), apn, countyFips: "12033", attributes: {}, source: "s" };
    return {
      leads: [],
      contacts: [],
      properties: [prop],
      parties: [{ key: owner, kind: "person", name: owner, source: "s" }],
      ownerships: [{ propertyKey: prop.key, partyKey: owner, role: "owner", source: "s", fetchedAt: T }],
    };
  };
  let reply = p("1", "ANN");
  beforeEach(() => {
    registerConnector({
      name: "stub",
      displayName: "stub",
      tier: "free",
      keyEnvVar: null,
      phases: ["research"],
      queryKinds: ["area", "parcel"],
      isConfigured: () => true,
      async research() {
        return reply;
      },
    });
  });

  it("an unapproved draft model leaves monitor changes pending for a later retry", async () => {
    reply = p("1", "ANN");
    await main(["monitor", "add", "gated", "--zips", "32507"]);
    await main(["monitor", "check", "gated"]);
    reply = p("1", "ZED");
    await expect(main(["monitor", "check", "gated", "--draft", "--icp", "Listing agent"]))
      .rejects.toThrow(/eval gate for pack "residential-re"/);
    out = "";
    await main(["monitor", "check", "gated", "--json"]);
    expect(JSON.parse(out).events).toEqual([{ kind: "owner-change", propertyKey: "12033:1", before: "ANN", after: "ZED" }]);
    reply = p("1", "ANN");
  });

  it("add → check (baseline) → check (owner change, json) → list; option validation", async () => {
    await main(["monitor", "add", "pk", "--zips", "32507", "--value-change-pct", "15"]);
    expect(out).toContain("monitor pk saved");
    await main(["monitor", "check", "pk"]);
    expect(out).toContain("baseline recorded");
    reply = p("1", "ZED");
    out = "";
    await main(["monitor", "check", "pk", "--json"]);
    expect(JSON.parse(out).events).toEqual([{ kind: "owner-change", propertyKey: "12033:1", before: "ANN", after: "ZED" }]);
    out = "";
    await main(["monitor", "list"]);
    expect(out).toContain("pk");
    await main(["monitor", "add", "one", "--parcels", "12033:1"]);
    await expect(main(["monitor", "add", "pk", "--zips", "32506"])).rejects.toThrow(/--replace/);
    await main(["monitor", "add", "pk", "--zips", "32506", "--replace"]);
    await expect(main(["monitor", "add", "two", "--parcels", "12033:1,12033:2"])).rejects.toBeInstanceOf(UsageError);
    await expect(main(["monitor", "add", "bad", "--parcels", "nope"])).rejects.toBeInstanceOf(UsageError);
    await expect(main(["monitor", "check", "pk", "--icp", "x"])).rejects.toThrow(/only applies with --draft/);
    await expect(main(["monitor", "check", "pk", "--draft"])).rejects.toThrow(/needs --icp/);
    await expect(main(["monitor", "check", "pk", "--draft", "--icp", "x", "--profile", "missing.json"])).rejects.toThrow(/--profile/);
    await expect(main(["monitor", "check", "ghost"])).rejects.toThrow(/not found/);
    await expect(main(["monitor", "frob", "pk"])).rejects.toBeInstanceOf(UsageError);
  });
});

describe("property-run", () => {
  it("validates flags, then fails the model gate before any research", async () => {
    await expect(main(["property-run", "--zips", "32507"])).rejects.toBeInstanceOf(UsageError);
    await expect(main(["property-run", "--icp", "x", "--zips", "3250"])).rejects.toThrow(/5-digit/);
    await expect(main(["property-run", "--icp", "x", "--parcels", "nope"])).rejects.toThrow(/countyFips/);
    await expect(main(["property-run", "--icp", "x", "--zips", "32507", "--max-properties", "0"])).rejects.toBeInstanceOf(UsageError);
    await expect(main(["property-run", "--icp", "x", "--zips", "32507", "--profile", "missing.json"])).rejects.toThrow(/--profile/);
    await expect(main(["property-run", "--icp", "x", "--zips", "32507"])).rejects.not.toBeInstanceOf(UsageError);
  });
});


describe("store operations", () => {
  it("migrates explicitly, shows minimal audit and purges through the public commands", async () => {
    const source = join(process.env.INTENT_OUTREACH_HOME!, "legacy.jsonl");
    const destination = join(process.env.INTENT_OUTREACH_HOME!, "import.sqlite");
    const original = JSON.stringify({ id: "cli-import", schemaVersion: 1, icp: "legacy", domains: [], provider: "fixture", model: "fixture", status: "complete", createdAt: T });
    writeFileSync(source, original);
    await main(["store", "migrate", "--from", source, "--out", destination]);
    expect(JSON.parse(out)).toEqual({ imported: 1, expired: 0, alreadyMigrated: false, sourcePreserved: true });
    expect(readFileSync(source, "utf8")).toBe(original);
    out = "";
    await main(["store", "audit", "--out", destination]);
    expect(JSON.parse(out)[0].action).toBe("import");
    expect(out).not.toContain("cli-import");
    out = "";
    await main(["store", "purge", "--out", destination]);
    expect(JSON.parse(out)).toEqual({ expired: 0, cacheEntries: 0, monitorSnapshots: 0 });
  });

  it("rejects incomplete, misspelled and inconsistent commands", async () => {
    for (const args of [[], ["wrong"], ["purge", "extra"], ["audit", "--from", "unused"], ["purge", "--bogus"], ["migrate", "--from"]]) {
      await expect(main(["store", ...args])).rejects.toBeInstanceOf(UsageError);
    }
  });
});


describe("external adapter validation", () => {
  it("normalizes a legacy run using the storage schema without a provider or store", async () => {
    withStdin(JSON.stringify({ id: "bridge", schemaVersion: 1, icp: "x", domains: [], provider: "fixture", model: "fixture", status: "complete", createdAt: T, unexpected: "stripped" }));
    await main(["validate-run"]);
    expect(JSON.parse(out)).toMatchObject({ id: "bridge", vertical: "b2b-sdr", properties: [], parties: [], messages: [] });
    expect(out).not.toContain("unexpected");
  });
  it.each(["not-json PRIVATE", '{"id":"PRIVATE"}', '{"schemaVersion":999}'])("rejects invalid input without echoing owner data: %s", async (input) => {
    withStdin(input);
    await expect(main(["validate-run"])).rejects.toThrow("validate-run: invalid JSON, schema, or freshness window");
    expect(out).toBe("");
  });
  it("rejects flags and oversized input", async () => {
    await expect(main(["validate-run", "--unknown"])).rejects.toBeInstanceOf(UsageError);
    withStdin("x".repeat(16 * 1024 * 1024 + 1));
    await expect(main(["validate-run"])).rejects.toThrow("exceeds 16 MiB");
  });
  it("validates CRM snapshots using the wall clock", async () => {
    withStdin(JSON.stringify({ version: 1, source: "erpnext", generatedAt: T, expiresAt: new Date(Date.parse(T) + 900_000).toISOString(), suppressions: [{ kind: "phone", value: "2515550100" }], doNotResearch: [] }));
    await main(["validate-crm-context"]);
    expect(JSON.parse(out).suppressions).toEqual([{ kind: "phone", value: "+12515550100" }]);
    withStdin("{}");
    await expect(main(["validate-crm-context"])).rejects.toBeInstanceOf(UsageError);
  });
  it("refuses unreadable or stale CRM context before selecting any property provider", async () => {
    await expect(main(["property-run", "--icp", "x", "--zips", "36542", "--crm-context", "/missing/context.json"])).rejects.toThrow("valid, fresh ERPNext snapshot");
    withStdin(JSON.stringify({ message: { channel: "email", body: "Hi" }, channel: "email" }));
    await expect(main(["check-send", "--crm-context", "/missing/context.json"])).rejects.toThrow("valid, fresh ERPNext snapshot");
  });
});
