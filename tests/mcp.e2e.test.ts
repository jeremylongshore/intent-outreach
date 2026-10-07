// tests/mcp.e2e.test.ts — the shipped MCP server (bundle/server.mjs) driven by the real SDK client over stdio.
// Scrubbed child environment: no keys, INTENT_OUTREACH_HOME in a tmpdir, so nothing real is read or written.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SERVER = resolve(import.meta.dirname, "..", "bundle", "server.mjs");
const validRun = {
  id: "e2e-run-1",
  icp: "Series A fintechs",
  domains: ["example.com"],
  provider: "anthropic",
  model: "claude-test",
};

let home: string;
let client: Client;
const runsFile = () => join(home, "runs.jsonl");
const text = (r: unknown) => ((r as { content: { text: string }[] }).content[0]?.text ?? "");

beforeAll(async () => {
  expect(existsSync(SERVER), "bundle/server.mjs missing: run pnpm run bundle").toBe(true);
  home = mkdtempSync(join(tmpdir(), "io-mcp-e2e-"));
  client = new Client({ name: "e2e", version: "0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [SERVER],
      env: { PATH: process.env.PATH ?? "", HOME: home, INTENT_OUTREACH_HOME: home },
      stderr: "pipe",
    }),
  );
});
afterAll(async () => {
  await client?.close();
  rmSync(home, { recursive: true, force: true });
});

describe("shipped MCP server", () => {
  it("lists exactly the four tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["approve", "enrich_lead", "list_connectors", "list_pending", "list_runs", "reject", "research_domain", "save_run", "suppress", "underwrite"]);
  });

  it("list_connectors: every keyed connector is unconfigured; only the keyless public-records ones are on", async () => {
    const r = await client.callTool({ name: "list_connectors", arguments: {} });
    const rows = JSON.parse(text(r)) as { name: string; configured: boolean }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((c) => c.configured).map((c) => c.name)).toEqual(["fl-dor-parcels", "fema-nfhl"]);
  });

  it("save_run rejects invalid input and persists nothing", async () => {
    // Fails the tool input schema (icp must be non-empty): the SDK rejects it before the handler.
    const empty = await client
      .callTool({ name: "save_run", arguments: { ...validRun, id: "bad-1", icp: "" } })
      .catch((e: unknown) => ({ isError: true, thrown: String(e) }));
    expect(empty.isError).toBe(true);
    // Wrong type for domains.
    const wrongType = await client
      .callTool({ name: "save_run", arguments: { ...validRun, id: "bad-2", domains: "example.com" } })
      .catch((e: unknown) => ({ isError: true, thrown: String(e) }));
    expect(wrongType.isError).toBe(true);
    expect(existsSync(runsFile())).toBe(false);
  });

  it("save_run refuses a draft whose contactKey matches no contact (recorded as rejected, never stored as a message)", async () => {
    const r = await client.callTool({
      name: "save_run",
      arguments: {
        ...validRun,
        id: "orphan-draft",
        messages: [{ contactKey: "nobody@nowhere.example", channel: "email", subject: "Hi", body: "Hello there", cta: "Reply" }],
      },
    });
    const out = JSON.parse(text(r)) as { messages: number; rejectedDrafts: { contactKey: string }[] };
    expect(out.messages).toBe(0);
    expect(out.rejectedDrafts.map((d) => d.contactKey)).toEqual(["nobody@nowhere.example"]);
    const saved = readFileSync(runsFile(), "utf8").trim().split("\n").map((l) => JSON.parse(l) as { id: string; messages: unknown[] });
    expect(saved.find((x) => x.id === "orphan-draft")?.messages).toEqual([]);
  });

  it("save_run accepts a valid run and it is readable from the JSONL store", async () => {
    const r = await client.callTool({ name: "save_run", arguments: validRun });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(text(r))).toMatchObject({ saved: "e2e-run-1" });
    const lines = readFileSync(runsFile(), "utf8").trim().split("\n");
    const stored = lines.map((l) => JSON.parse(l) as { id: string });
    expect(stored.filter((x) => x.id === "e2e-run-1")).toHaveLength(1);
    expect(stored.find((x) => x.id === "e2e-run-1")).toMatchObject({ id: "e2e-run-1", icp: "Series A fintechs", provider: "anthropic" });
  });

  it("save_run answers a duplicate id with a friendly error and does not append", async () => {
    const before = readFileSync(runsFile(), "utf8");
    const r = await client.callTool({ name: "save_run", arguments: validRun });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("already exists");
    expect(text(r)).toContain("overwrite");
    expect(readFileSync(runsFile(), "utf8")).toBe(before);
  });
});
