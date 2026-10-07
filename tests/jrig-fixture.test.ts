import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const fixture = resolve(import.meta.dirname, "../evals/jrig/fixture-fetch.mjs");
function run(source: string) {
  const home = mkdtempSync(join(tmpdir(), "jrig-network-fixture-"));
  try {
    const stdout = execFileSync(process.execPath, ["--import", fixture, "--input-type=module", "-e", source], {
      encoding: "utf8", timeout: 5000,
      env: { PATH: process.env.PATH, HOME: home, INTENT_OUTREACH_HOME: home, HUNTER_API_KEY: "jrig-offline-fixture" },
    });
    let fetches = "";
    try { fetches = readFileSync(join(home, "fetches.jsonl"), "utf8"); } catch { /* Refused requests produce no success event. */ }
    return { stdout, fetches };
  } finally { rmSync(home, { recursive: true, force: true }); }
}

describe("J-Rig fixture transport isolation", () => {
  it("serves only the reviewed synthetic vendor response and omits keys from its trace", () => {
    const result = run(`const r = await fetch('https://api.hunter.io/v2/domain-search?domain=example.test&api_key=jrig-offline-fixture'); console.log(JSON.stringify(await r.json()));`);
    expect(JSON.parse(result.stdout).data.organization).toBe("Example Fixture Labs");
    expect(JSON.parse(result.fetches)).toEqual({ path: "/v2/domain-search" });
    expect(result.fetches).not.toContain("api_key");
  });
  it.each([
    "https://unlisted.example/v2/domain-search?domain=example.test&api_key=jrig-offline-fixture",
    "https://api.hunter.io/v2/domain-search?domain=real-company.example&api_key=jrig-offline-fixture",
    "https://api.hunter.io/v2/domain-search?domain=example.test&api_key=wrong",
    "https://api.hunter.io/v2/unlisted?domain=example.test&api_key=jrig-offline-fixture",
  ])("refuses an unlisted request without forwarding it: %s", (url) => {
    const result = run(`try { await fetch(${JSON.stringify(url)}); process.exitCode = 9; } catch (error) { console.log(error.message); }`);
    expect(result.stdout.trim()).toMatch(/^fixture (refuses|endpoint)/);
    expect(result.fetches).toBe("");
  });
});
