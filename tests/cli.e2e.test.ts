// tests/cli.e2e.test.ts — the shipped CLI (bundle/cli.mjs, what users actually run) as a black box.
// Every child gets a scrubbed environment: no keys, HOME and INTENT_OUTREACH_HOME in a tmpdir.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const CLI = resolve(import.meta.dirname, "..", "bundle", "cli.mjs");
let home: string;

beforeAll(() => {
  expect(existsSync(CLI), "bundle/cli.mjs missing: run npm run bundle").toBe(true);
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
    for (const p of ["anthropic", "openai", "xai"]) expect(r.out).toContain(p);
    expect(r.out).toContain("auto-detected provider:");
  });

  it("connectors lists connectors, all unconfigured in a keyless environment", () => {
    const r = cli("connectors");
    expect(r.code).toBe(0);
    expect(r.out).toContain("apollo");
    expect(r.out).toContain("set APOLLO_API_KEY");
    expect(r.out).not.toMatch(/ configured$/m);
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
    expect(existsSync(join(home, "runs.jsonl"))).toBe(false);
  });
});
