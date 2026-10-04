/**
 * tests/cli.test.ts — CLI flag validation, provider status text, profile wiring
 * and quiet EPIPE handling.
 *
 * Unit tests import cli.ts's exported helpers (importing does NOT run main —
 * cli.ts only runs when it is the process entrypoint). Two small spawn checks
 * cover exit codes / EPIPE through the real entrypoint via `node --import tsx`.
 * (The broad CLI e2e suite lives in tests/cli.e2e.test.ts, owned by the CI stream.)
 */

import { spawn, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  installEpipeHandler,
  MAX_CONTACTS_LIMIT,
  parseChannelFlag,
  parseDomainsFlag,
  parseNumberFlag,
  UsageError,
} from "../cli.js";
import { loadProfileRef, resolveProfilePath } from "../pipeline_core/pipeline.js";

const ROOT = resolve(__dirname, "..");
const home = mkdtempSync(join(tmpdir(), "io-cli-home-"));

function cliEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, INTENT_OUTREACH_HOME: home };
  for (const k of Object.keys(env)) {
    if (k.endsWith("_API_KEY") || k === "ZOOMINFO_JWT" || k === "CLAY_WEBHOOK_URL") delete env[k];
  }
  return env;
}

function runCli(args: string[]) {
  return spawnSync(process.execPath, ["--import", "tsx", "cli.ts", ...args], {
    cwd: ROOT,
    env: cliEnv(),
    encoding: "utf8",
    timeout: 60_000,
  });
}

describe("numeric flags", () => {
  it.each(["abc", "", "NaN", "Infinity", "-1", "101", "1e3", "50abc"])("--min-score %j is a usage error", (raw) => {
    expect(() => parseNumberFlag("--min-score", raw, { min: 0, max: 100 })).toThrow(UsageError);
  });

  it("accepts in-range values (including decimals for the score)", () => {
    expect(parseNumberFlag("--min-score", "0", { min: 0, max: 100 })).toBe(0);
    expect(parseNumberFlag("--min-score", " 72.5 ", { min: 0, max: 100 })).toBe(72.5);
  });

  it("--max-contacts must be a whole number in range", () => {
    const opts = { min: 1, max: MAX_CONTACTS_LIMIT, integer: true };
    expect(parseNumberFlag("--max-contacts", "3", opts)).toBe(3);
    expect(() => parseNumberFlag("--max-contacts", "1.5", opts)).toThrow(/whole number/);
    expect(() => parseNumberFlag("--max-contacts", "0", opts)).toThrow(/between 1 and 50/);
    expect(() => parseNumberFlag("--max-contacts", String(MAX_CONTACTS_LIMIT + 1), opts)).toThrow(UsageError);
  });
});

describe("--domains / --channel", () => {
  it("normalizes and dedupes domains", () => {
    expect(parseDomainsFlag(" https://WWW.Acme.com/x , acme.com,beta.io ")).toEqual(["acme.com", "beta.io"]);
  });

  it.each(["not a domain", "localhost", "10.0.0.1", " , "])("rejects %j", (raw) => {
    expect(() => parseDomainsFlag(raw)).toThrow(UsageError);
  });

  it("channel must be email or linkedin (no silent fallback)", () => {
    expect(parseChannelFlag("linkedin")).toBe("linkedin");
    expect(() => parseChannelFlag("fax")).toThrow(UsageError);
  });
});

describe("--profile resolution", () => {
  it("resolves a bundled profile by name and carries its fields", () => {
    expect(resolveProfilePath("tech-founder-cold-outreach", home)).toMatch(/profiles\/tech-founder-cold-outreach\.json$/);
    expect(loadProfileRef("tech-founder-cold-outreach", home).filtering?.minScore).toBe(75);
  });

  it("rejects traversal-shaped names and unknown names", () => {
    expect(() => resolveProfilePath("..", home)).toThrow(/invalid name/);
    expect(() => resolveProfilePath("no-such-profile", home)).toThrow(/profile not found/);
  });
});

describe("EPIPE", () => {
  it("installEpipeHandler exits 0 on EPIPE and rethrows anything else", () => {
    const stream = new EventEmitter();
    const codes: number[] = [];
    installEpipeHandler(stream, (c) => codes.push(c));
    stream.emit("error", Object.assign(new Error("write EPIPE"), { code: "EPIPE" }));
    expect(codes).toEqual([0]);
    expect(() => stream.emit("error", Object.assign(new Error("boom"), { code: "EIO" }))).toThrow("boom");
  });

  it("`connectors` exits quietly when the reader closes the pipe", async () => {
    const child = spawn(process.execPath, ["--import", "tsx", "cli.ts", "connectors"], {
      cwd: ROOT,
      env: cliEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.destroy(); // the reader is gone before anything is written
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += String(d)));
    const code = await new Promise<number | null>((r) => child.on("close", (c) => r(c)));
    expect(stderr).not.toMatch(/EPIPE|Unhandled/);
    expect(code).toBe(0);
  }, 60_000);
});

describe("entrypoint exit codes + output", () => {
  it("a non-numeric --min-score exits 2 before any spend", () => {
    const r = runCli(["run", "--icp", "x", "--domains", "acme.com", "--min-score", "abc"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--min-score must be a number/);
  }, 60_000);

  it("an invalid --domains entry exits 2", () => {
    const r = runCli(["run", "--icp", "x", "--domains", "acme.com,not a domain"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--domains: invalid domain/);
  }, 60_000);

  it("`providers` says none configured with no keys, and help no longer lists google", () => {
    const p = runCli(["providers"]);
    expect(p.status).toBe(0);
    expect(p.stdout).toContain("auto-detected provider: none configured");
    const h = runCli(["help"]);
    expect(h.stdout).toContain("--profile <path|name>");
    expect(h.stdout).not.toMatch(/google/i);
  }, 60_000);
});
