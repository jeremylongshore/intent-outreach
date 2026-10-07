import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

const clean = { advisories: {}, metadata: { vulnerabilities: { high: 0, critical: 0 } } };
const advisory = {
  module_name: "example", severity: "high", title: "Example vulnerability",
  github_advisory_id: "GHSA-2345-6789-cfgh",
};
const unsafe = { advisories: { 1: advisory }, metadata: { vulnerabilities: { high: 1, critical: 0 } } };
const allowance = { id: advisory.github_advisory_id, reason: "Test-only unreachable path", expires: "2099-01-01" };

function run(report: unknown, status = 0, allow: unknown[] = []) {
  const dir = mkdtempSync(join(tmpdir(), "io-audit-"));
  dirs.push(dir);
  mkdirSync(join(dir, ".github"));
  writeFileSync(join(dir, ".github/audit-allowlist.json"), JSON.stringify({ allow }));
  writeFileSync(join(dir, "pnpm"), `#!${process.execPath}
if (JSON.stringify(process.argv.slice(2)) !== JSON.stringify(["audit", "--prod", "--json"])) process.exit(90);
process.stdout.write(process.env.IO_AUDIT_REPORT);
process.exit(Number(process.env.IO_AUDIT_STATUS));
`, { mode: 0o700 });
  return spawnSync(process.execPath, [resolve(".github/scripts/audit-gate.mjs")], {
    cwd: dir, encoding: "utf8",
    env: { ...process.env, PATH: dir + delimiter + (process.env.PATH ?? ""),
      IO_AUDIT_REPORT: typeof report === "string" ? report : JSON.stringify(report), IO_AUDIT_STATUS: String(status) },
  });
}

it("accepts a clean pnpm production audit", () => {
  const result = run(clean);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("0 seen");
});

it("rejects high and critical advisories even when the command exits zero", () => {
  expect(run(unsafe).status).toBe(1);
  expect(run({ advisories: { 1: { ...advisory, severity: "critical" } },
    metadata: { vulnerabilities: { high: 0, critical: 1 } } }, 1).status).toBe(1);
});

it("honors only valid, unexpired explicit advisory allowances", () => {
  expect(run(unsafe, 1, [allowance]).status).toBe(0);
  expect(run(unsafe, 1, [{ ...allowance, expires: "2000-01-01" }]).status).toBe(1);
  expect(run(unsafe, 1, [{ ...allowance, reason: "" }]).status).toBe(1);
});

it("allows a moderate advisory without lowering the high/critical gate", () => {
  expect(run({ ...clean, advisories: { 1: { ...advisory, severity: "moderate" } } }, 1).status).toBe(0);
});

it.each([
  "not JSON", null, {}, { vulnerabilities: {} }, { error: { code: "registry-unavailable" } },
  { ...clean, advisories: [] }, { ...clean, advisories: { 1: null } },
  { ...unsafe, advisories: { 1: { ...advisory, github_advisory_id: "" } } },
  { ...unsafe, advisories: {} }, { ...clean, metadata: { vulnerabilities: {} } },
])("fails closed on invalid or incomplete audit output: %j", (report) => {
  expect(run(report).status).toBe(1);
});

it("rejects process failures even if stdout resembles a clean audit", () => {
  expect(run(clean, 2).status).toBe(1);
  expect(run(clean, 1).status).toBe(1);
});
