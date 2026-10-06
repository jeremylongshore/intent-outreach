/**
 * tests/key-quotas.test.ts — Phase 4b: several keys per connector with monthly quotas.
 */

import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { drainQuotaWarnings, KeyQuotaExhaustedError, keyStatus, useKey } from "../pipeline_core/key-quotas.js";
import { _resetSecretCache, intentOutreachHome, secretVariants } from "../pipeline_core/secrets.js";
import { main } from "../cli.js";

const OCT = new Date("2026-10-06T12:00:00Z");
const NOV = new Date("2026-11-01T00:00:01Z");
const quotas = (q: Record<string, number>) =>
  writeFileSync(join(intentOutreachHome(), "quotas.json"), JSON.stringify(Object.fromEntries(Object.entries(q).map(([k, v]) => [k, { monthlyCredits: v }]))));

beforeEach(async () => {
  const { mkdirSync, rmSync } = await import("node:fs");
  mkdirSync(intentOutreachHome(), { recursive: true });
  for (const f of ["quotas.json", "key-usage.json"]) rmSync(join(intentOutreachHome(), f), { force: true });
  process.env.VENDOR_API_KEY = "k-default";
  process.env.VENDOR_API_KEY__TEAM = "k-team";
  process.env.VENDOR_API_KEY__PERSONAL = "k-personal";
  process.env.VENDOR_API_KEY__BAD = "${UNSET}"; // counts as unset
  _resetSecretCache();
  drainQuotaWarnings();
});
afterEach(() => {
  for (const k of Object.keys(process.env)) if (k.startsWith("VENDOR_API_KEY")) delete process.env[k];
  _resetSecretCache();
});

describe("key variants", () => {
  it("default first, then labels in order; unset values excluded", () => {
    expect(secretVariants("VENDOR_API_KEY").map((v) => v.label)).toEqual(["default", "personal", "team"]);
  });
});

describe("useKey", () => {
  it("uses the first key with room, rolls to the next when a quota is spent, then fails", async () => {
    quotas({ VENDOR_API_KEY: 10, VENDOR_API_KEY__PERSONAL: 5, VENDOR_API_KEY__TEAM: 5 });
    expect((await useKey("VENDOR_API_KEY", 6, OCT)).label).toBe("default");
    expect((await useKey("VENDOR_API_KEY", 4, OCT)).label).toBe("default"); // exactly 10
    expect((await useKey("VENDOR_API_KEY", 5, OCT)).value).toBe("k-personal");
    expect((await useKey("VENDOR_API_KEY", 5, OCT)).value).toBe("k-team");
    await expect(useKey("VENDOR_API_KEY", 1, OCT)).rejects.toBeInstanceOf(KeyQuotaExhaustedError);
    expect(statSync(join(intentOutreachHome(), "key-usage.json")).mode & 0o777).toBe(0o600);
  });

  it("a key with no quota is unlimited; usage resets with the month", async () => {
    quotas({ VENDOR_API_KEY: 2 });
    await useKey("VENDOR_API_KEY", 2, OCT);
    expect((await useKey("VENDOR_API_KEY", 100, OCT)).label).toBe("personal"); // no quota
    expect((await useKey("VENDOR_API_KEY", 2, NOV)).label).toBe("default"); // a new month
    const ledger = JSON.parse(readFileSync(join(intentOutreachHome(), "key-usage.json"), "utf8"));
    expect(ledger).toEqual({ month: "2026-11", used: { VENDOR_API_KEY: 2 } });
  });

  it("warns once when a key crosses 80% of its quota", async () => {
    quotas({ VENDOR_API_KEY: 10 });
    await useKey("VENDOR_API_KEY", 7, OCT);
    expect(drainQuotaWarnings()).toEqual([]);
    await useKey("VENDOR_API_KEY", 1, OCT);
    expect(drainQuotaWarnings()).toEqual(["quota: VENDOR_API_KEY has used 8 of 10 monthly credits (80%)"]);
    await useKey("VENDOR_API_KEY", 1, OCT);
    expect(drainQuotaWarnings()).toEqual([]);
  });

  it("no key configured is the standard missing-secret error; concurrent charges all land", async () => {
    await expect(useKey("OTHER_API_KEY", 1, OCT)).rejects.toThrow(/OTHER_API_KEY/);
    await Promise.all(Array.from({ length: 10 }, () => useKey("VENDOR_API_KEY", 1, OCT)));
    expect((await keyStatus("VENDOR_API_KEY", OCT))[0]).toMatchObject({ envName: "VENDOR_API_KEY", used: 10 });
  });
});

describe("CLI: keys", () => {
  it("lists variants with usage and quota", async () => {
    quotas({ VENDOR_API_KEY__TEAM: 50 });
    await useKey("VENDOR_API_KEY", 3, new Date());
    let out = "";
    const write = process.stdout.write;
    process.stdout.write = ((c: string) => {
      out += c;
      return true;
    }) as typeof process.stdout.write;
    try {
      await main(["keys", "VENDOR_API_KEY"]);
    } finally {
      process.stdout.write = write;
    }
    expect(out).toMatch(/VENDOR_API_KEY\s+default\s+3 credits this month \(no quota\)/);
    expect(out).toMatch(/VENDOR_API_KEY__TEAM\s+team\s+0\/50 credits this month/);
    await expect(main(["keys", "lower_case"])).rejects.toThrow(/usage/);
  });
});
