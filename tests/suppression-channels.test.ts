/**
 * tests/suppression-channels.test.ts — phone (E.164) and mailing-address
 * suppression entries, the prerequisite for honoring an SMS "STOP" or a
 * "take me off your mailing list" on every later run.
 *
 *   • normalizers: phone → E.164, address → one canonical key per mailbox.
 *   • classification: inferred kind, and an explicit --kind override.
 *   • gate: an enrichment phone on the list blocks the contact on every channel;
 *     a malformed phone fails closed only when phone entries exist.
 *   • suppressions.jsonl: the new kinds round-trip; a legacy email/domain file
 *     still loads; an unknown kind fails closed with its line number.
 *   • CLI: `suppress add --kind phone|address`.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  buildSuppressionList,
  checkSuppression,
  EMPTY_SUPPRESSION_LIST,
  normalizeMailingAddress,
  parseSuppressionValue,
  suppressionGate,
} from "../pipeline_core/compliance/suppression.js";
import {
  addSuppression,
  loadSuppressionList,
  readSuppressions,
  removeSuppression,
} from "../pipeline_core/suppressions.js";
import type { ComplianceContext } from "../pipeline_core/packs/types.js";
import type { Enrichment } from "../pipeline_core/models.js";

const HOME = mkdtempSync(join(tmpdir(), "io-suppch-home-"));
process.env.INTENT_OUTREACH_HOME = HOME;

const ADDR = "1204 W Beach Blvd, Gulf Shores, AL 36542";

function phoneEnrichment(phone: string): Enrichment {
  return {
    subjectType: "contact",
    subjectKey: "jane@acme.com",
    provider: "fixture",
    phone,
    data: {},
    fetchedAt: "2026-10-06T12:00:00.000Z",
  };
}

function ctx(enrichments: Enrichment[] = []): ComplianceContext {
  return {
    lead: { domain: "acme.com", companyName: "Acme", source: "fixture" },
    contact: { name: "Jane Doe", leadDomain: "acme.com", email: "jane@acme.com", source: "fixture" },
    now: new Date("2026-10-06T12:00:00.000Z"),
    enrichments,
  };
}

describe("normalizeMailingAddress", () => {
  it("collapses the common spellings of one mailbox to one key", () => {
    const key = "1204 W BEACH BLVD GULF SHORES AL 36542";
    expect(normalizeMailingAddress(ADDR)).toBe(key);
    expect(normalizeMailingAddress("1204 West Beach Boulevard,  Gulf Shores, AL 36542-1234")).toBe(key);
    expect(normalizeMailingAddress("1204 w. beach blvd. gulf shores al 36542")).toBe(key);
  });

  it("normalizes units and PO boxes", () => {
    expect(normalizeMailingAddress("25 Main Street #4, Foley, AL 36535")).toBe("25 MAIN ST UNIT 4 FOLEY AL 36535");
    expect(normalizeMailingAddress("P.O. Box 77, Orange Beach, AL 36561")).toBe("PO BOX 77 ORANGE BEACH AL 36561");
  });

  it.each([
    "", // empty
    "Gulf Shores, AL", // no ZIP
    "AL 36542", // no street
    "Beach Blvd Gulf Shores AL 36542", // no number anywhere
    "1204 W Beach Blvd, Gulf Shores, AL 3654", // 4-digit ZIP
  ])("rejects %j", (bad) => {
    expect(() => normalizeMailingAddress(bad)).toThrow();
  });
});

describe("parseSuppressionValue: phone + address", () => {
  it("infers the kind", () => {
    expect(parseSuppressionValue("(251) 555-0100")).toEqual({ kind: "phone", value: "+12515550100" });
    expect(parseSuppressionValue("+1 251 555 0100")).toEqual({ kind: "phone", value: "+12515550100" });
    expect(parseSuppressionValue(ADDR)).toEqual({ kind: "address", value: "1204 W BEACH BLVD GULF SHORES AL 36542" });
    // The pre-existing kinds still classify as before.
    expect(parseSuppressionValue("jane@acme.com").kind).toBe("email");
    expect(parseSuppressionValue("acme.com").kind).toBe("domain");
  });

  it("an explicit kind overrides inference and still validates", () => {
    expect(parseSuppressionValue("2515550100", "phone")).toEqual({ kind: "phone", value: "+12515550100" });
    expect(() => parseSuppressionValue("acme.com", "phone")).toThrow();
    expect(() => parseSuppressionValue("555-0100")).toThrow(); // phone-shaped but too short
  });
});

describe("checkSuppression / suppressionGate: phone + address", () => {
  const list = buildSuppressionList([
    { kind: "phone", value: "251-555-0100" },
    { kind: "address", value: ADDR },
  ]);

  it("blocks a contact whose enrichment phone is suppressed, whatever its format", () => {
    expect(suppressionGate(list).check(ctx([phoneEnrichment("(251) 555-0100")]))).toEqual({
      status: "blocked",
      reason: "suppressed:phone",
    });
  });

  it("lets a contact with a different phone through", () => {
    expect(suppressionGate(list).check(ctx([phoneEnrichment("251-555-0199")]))).toEqual({ status: "clean" });
    expect(suppressionGate(list).check(ctx())).toEqual({ status: "clean" });
  });

  it("a malformed phone FAILS CLOSED when phone entries exist", () => {
    expect(suppressionGate(list).check(ctx([phoneEnrichment("ext 12")]))).toEqual({
      status: "blocked",
      reason: "suppression:malformed-phone",
    });
  });

  it("a malformed phone is not inspected when the list holds no phone entries", () => {
    const emailOnly = buildSuppressionList([{ kind: "email", value: "bob@acme.com" }]);
    expect(suppressionGate(emailOnly).check(ctx([phoneEnrichment("ext 12")]))).toEqual({ status: "clean" });
    expect(suppressionGate(EMPTY_SUPPRESSION_LIST).check(ctx([phoneEnrichment("ext 12")]))).toEqual({
      status: "clean",
    });
  });

  it("blocks a suppressed mailing address, written differently", () => {
    expect(
      checkSuppression(list, { domains: [], addresses: ["1204 West Beach Boulevard, Gulf Shores AL 36542"] }),
    ).toEqual({ status: "blocked", reason: "suppressed:address" });
    expect(checkSuppression(list, { domains: [], addresses: ["9 Elm St, Foley, AL 36535"] })).toEqual({
      status: "clean",
    });
  });

  it("a malformed address FAILS CLOSED when address entries exist", () => {
    expect(checkSuppression(list, { domains: [], addresses: ["somewhere in Foley"] })).toEqual({
      status: "blocked",
      reason: "suppression:malformed-address",
    });
  });
});

describe("suppressions.jsonl: phone + address", () => {
  let path: string;
  beforeEach(() => {
    path = join(mkdtempSync(join(tmpdir(), "io-suppch-")), "suppressions.jsonl");
  });

  it("round-trips the new kinds alongside the old ones", async () => {
    const now = () => "2026-10-06T12:00:00.000Z";
    await addSuppression("jane@acme.com", { path, now });
    expect((await addSuppression("(251) 555-0100", { path, now, reason: "STOP" })).entry).toEqual({
      kind: "phone",
      value: "+12515550100",
      addedAt: now(),
      reason: "STOP",
    });
    await addSuppression(ADDR, { path, now });
    expect((await addSuppression("+12515550100", { path, now })).added).toBe(false);

    const list = await loadSuppressionList(path);
    expect([...list.phones]).toEqual(["+12515550100"]);
    expect([...list.addresses]).toEqual(["1204 W BEACH BLVD GULF SHORES AL 36542"]);
    expect([...list.emails]).toEqual(["jane@acme.com"]);

    expect(await removeSuppression("251.555.0100", { path })).toBe(true);
    expect((await readSuppressions(path)).map((e) => e.kind)).toEqual(["email", "address"]);
  });

  it("a legacy email/domain-only file still loads", async () => {
    writeFileSync(
      path,
      '{"kind":"email","value":"a@b.co","addedAt":"2026-06-16T12:00:00.000Z"}\n' +
        '{"kind":"domain","value":"blocked.io","addedAt":"2026-06-16T12:00:00.000Z"}\n',
    );
    const list = await loadSuppressionList(path);
    expect(list.emails.size + list.domains.size).toBe(2);
    expect(list.phones.size + list.addresses.size).toBe(0);
  });

  it("an unknown kind or a bad phone FAILS CLOSED with its line number", async () => {
    writeFileSync(path, '{"kind":"fax","value":"x","addedAt":"x"}\n');
    await expect(loadSuppressionList(path)).rejects.toThrow(/line 1.*kind must be/);
    writeFileSync(path, '{"kind":"email","value":"a@b.co","addedAt":"x"}\n{"kind":"phone","value":"12","addedAt":"x"}\n');
    await expect(loadSuppressionList(path)).rejects.toThrow(/line 2/);
  });
});

describe("CLI: suppress --kind", () => {
  const tsx = resolve("node_modules/.bin/tsx");
  const cli = resolve("cli.ts");
  const home = mkdtempSync(join(tmpdir(), "io-suppch-cli-"));
  const run = (...args: string[]) =>
    spawnSync(tsx, [cli, "suppress", ...args], {
      env: { ...process.env, INTENT_OUTREACH_HOME: home },
      encoding: "utf8",
    });

  it("adds a phone and an address, lists them, and rejects a bad --kind", { timeout: 60_000 }, () => {
    const phone = run("add", "251-555-0100", "--kind", "phone", "--reason", "STOP");
    expect(phone.status).toBe(0);
    expect(phone.stdout).toContain("suppressed: phone +12515550100");
    const addr = run("add", ADDR);
    expect(addr.status).toBe(0);
    expect(addr.stdout).toContain("suppressed: address 1204 W BEACH BLVD GULF SHORES AL 36542");

    const list = run("list");
    expect(list.stdout).toMatch(/phone\s+\+12515550100.*STOP/);
    expect(list.stdout).toMatch(/address\s+1204 W BEACH BLVD/);
    expect(readFileSync(join(home, "suppressions.jsonl"), "utf8").trim().split("\n")).toHaveLength(2);

    expect(run("add", "acme.com", "--kind", "fax").status).toBe(2);
    expect(run("add", "acme.com", "--kind", "phone").status).toBe(1);
  });
});
