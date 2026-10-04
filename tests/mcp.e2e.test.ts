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
  expect(existsSync(SERVER), "bundle/server.mjs missing: run npm run bundle").toBe(true);
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
    expect(tools.map((t) => t.name).sort()).toEqual(["enrich_lead", "list_connectors", "research_domain", "save_run"]);
  });

  it("list_connectors reports every connector unconfigured in a keyless environment", async () => {
    const r = await client.callTool({ name: "list_connectors", arguments: {} });
    const rows = JSON.parse(text(r)) as { name: string; configured: boolean }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((c) => c.configured === false)).toBe(true);
  });

  it("save_run rejects an invalid run and persists nothing", async () => {
    // Passes the tool input schema but fails the validator gate (icp must be non-empty).
    const gate = await client.callTool({ name: "save_run", arguments: { ...validRun, id: "bad-1", icp: "" } });
    expect(gate.isError).toBe(true);
    expect(text(gate)).toContain("NOT saved");
    // Fails the tool input schema itself (domains must be an array).
    const schema = await client.callTool({ name: "save_run", arguments: { ...validRun, id: "bad-2", domains: "example.com" } }).catch((e: unknown) => ({ isError: true, thrown: String(e) }));
    expect(schema.isError).toBe(true);
    expect(existsSync(runsFile())).toBe(false);
  });

  it("save_run accepts a valid run and it is readable from the JSONL store", async () => {
    const r = await client.callTool({ name: "save_run", arguments: validRun });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(text(r))).toMatchObject({ saved: "e2e-run-1", status: "researched" });
    const lines = readFileSync(runsFile(), "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] as string)).toMatchObject({ id: "e2e-run-1", icp: "Series A fintechs", provider: "anthropic" });
  });

  it("save_run refuses a duplicate id instead of silently appending", async () => {
    const r = await client.callTool({ name: "save_run", arguments: validRun }).catch((e: unknown) => ({ isError: true, thrown: String(e) }));
    expect(r.isError).toBe(true);
    expect(readFileSync(runsFile(), "utf8").trim().split("\n")).toHaveLength(1);
  });
});
