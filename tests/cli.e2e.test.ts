// tests/cli.e2e.test.ts — the shipped CLI (bundle/cli.mjs, what users actually run) as a black box.
// Every child gets a scrubbed environment: no keys, HOME and INTENT_OUTREACH_HOME in a tmpdir.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const CLI = resolve(import.meta.dirname, "..", "bundle", "cli.mjs");
let home: string;

beforeAll(() => {
  expect(existsSync(CLI), "bundle/cli.mjs missing: run pnpm run bundle").toBe(true);
  home = mkdtempSync(join(tmpdir(), "io-cli-e2e-"));
});
afterAll(() => rmSync(home, { recursive: true, force: true }));

function cli(...args: string[]) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    timeout: 20_000,
    env: { PATH: process.env.PATH ?? "", HOME: home, INTENT_OUTREACH_HOME: home },
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

describe("shipped CLI", () => {
  it("--help prints usage to stdout and exits 0", () => {
    const r = cli("--help");
    expect(r.code).toBe(0);
    expect(r.out).toContain("intent-outreach run --icp");
    expect(r.err).toBe("");
  });

  it("providers lists the providers and an auto-detected one", () => {
    const r = cli("providers");
    expect(r.code).toBe(0);
    for (const p of ["anthropic", "openai", "xai", "minimax"]) expect(r.out).toContain(p);
    expect(r.out).toContain("auto-detected provider:");
  });

  it("connectors: every keyed connector is unconfigured; only the keyless public-records ones are on", () => {
    const r = cli("connectors");
    expect(r.code).toBe(0);
    expect(r.out).toContain("apollo");
    expect(r.out).toContain("set APOLLO_API_KEY");
    const configured = r.out.split("\n").filter((l) => / configured$/.test(l)).map((l) => l.split(/\s+/)[1]);
    expect(configured).toEqual(["fl-dor-parcels", "fema-nfhl"]);
  });

  it("an unknown command exits 2 and says so", () => {
    const r = cli("frobnicate");
    expect(r.code).toBe(2);
    expect(r.err).toContain("unknown command: frobnicate");
  });

  it("an unknown flag exits 2 and names the flag", () => {
    const r = cli("run", "--bogus");
    expect(r.code).toBe(2);
    expect(r.err).toContain("--bogus");
  });

  it("run without --domains exits 2 with the required-flags message", () => {
    const r = cli("run", "--icp", "x");
    expect(r.code).toBe(2);
    expect(r.err).toContain("--icp and --domains are required");
  });

  it("run with no keys fails fast with the friendly secret message and writes nothing", () => {
    const r = cli("run", "--icp", "Series A fintechs", "--domains", "example.com");
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("ANTHROPIC_API_KEY");
    expect(r.err).toContain("environment variable");
    expect(r.err).not.toMatch(/\n\s+at /); // a message, not a stack trace
    expect(existsSync(join(home, "runs.sqlite"))).toBe(false);
  });
});


describe("shipped storage migration", () => {
  it("migrates default JSONL, leaves the source intact, and exposes audit/purge commands", () => {
    const source = join(home, "runs.jsonl");
    const original = JSON.stringify({ id: "private-legacy-run", schemaVersion: 1, icp: "Private legacy ICP", domains: [], provider: "fixture", model: "fixture", status: "complete", createdAt: new Date().toISOString() });
    writeFileSync(source, original);
    const migrated = cli("store", "migrate");
    expect(migrated.code).toBe(0);
    expect(JSON.parse(migrated.out)).toMatchObject({ imported: 1, sourcePreserved: true });
    expect(readFileSync(source, "utf8")).toBe(original);
    expect(readFileSync(join(home, "runs.sqlite"), "utf8")).not.toContain("Private legacy ICP");
    const audit = cli("store", "audit");
    expect(audit.code).toBe(0);
    expect(JSON.parse(audit.out)[0].action).toBe("import");
    expect(audit.out).not.toContain("private-legacy-run");
    expect(JSON.parse(cli("store", "purge").out)).toEqual({ expired: 0, cacheEntries: 0, monitorSnapshots: 0 });
  });
});


describe("shipped adapter validation commands", () => {
  const validate = (command: string, input: string) => spawnSync(process.execPath, [CLI, command], {
    encoding: "utf8", input, timeout: 20_000,
    env: { PATH: process.env.PATH ?? "", HOME: home, INTENT_OUTREACH_HOME: join(home, "validation-only") },
  });
  it("normalizes a run through the shipped canonical schema without creating a store", () => {
    const r = validate("validate-run", JSON.stringify({ id: "adapter", schemaVersion: 6, icp: "x", domains: [], provider: "fixture", model: "fixture", status: "researched", createdAt: new Date().toISOString() }));
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ id: "adapter", properties: [], contactPoints: [] });
    expect(r.stderr).toBe("");
    expect(existsSync(join(home, "validation-only"))).toBe(false);
  });
  it("rejects invalid run data without echoing it and validates fresh CRM exclusions", () => {
    const bad = validate("validate-run", '{"id":"PRIVATE OWNER"}');
    expect(bad.status).toBe(2);
    expect(bad.stdout).toBe("");
    expect(bad.stderr).not.toContain("PRIVATE OWNER");
    const now = Date.now();
    const r = validate("validate-crm-context", JSON.stringify({ version: 1, source: "erpnext", generatedAt: new Date(now).toISOString(), expiresAt: new Date(now + 900_000).toISOString(), suppressions: [], doNotResearch: [{ kind: "parcel", value: "01003:abc" }] }));
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).doNotResearch).toEqual([{ kind: "parcel", value: "01003:ABC" }]);
    expect(validate("validate-crm-context", "{}").status).toBe(2);
  });
});
