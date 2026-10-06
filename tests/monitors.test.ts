/**
 * tests/monitors.test.ts — Phase 8 event monitors.
 *
 *   • fingerprint + diff: new parcel, owner change, value change over the
 *     threshold, listing and distress changes; deterministic order.
 *   • checkMonitor: the first check is a baseline (no events); later checks
 *     diff; an outage keeps the old snapshot; changed parcels become queries.
 *   • the snapshot file is 0600; a corrupt snapshot fails loud.
 *   • CLI: monitor add / list / check.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { _resetBuiltins, registerConnector } from "../pipeline_core/connectors/index.js";
import type { Connector, ResearchOutput } from "../pipeline_core/connectors/types.js";
import { propertyKey, type Party, type Property } from "../pipeline_core/models.js";
import { checkMonitor, diffSnapshots, fingerprint, readSnapshot } from "../pipeline_core/monitors.js";
import { _resetSecretCache } from "../pipeline_core/secrets.js";

const T = "2026-10-06T12:00:00.000Z";
const fact = (value: unknown) => ({ value, source: "s", fetchedAt: T });
const prop = (apn: string, attributes: Property["attributes"] = {}): Property => ({
  key: propertyKey("12033", apn),
  apn,
  countyFips: "12033",
  attributes,
  source: "s",
});
const party = (key: string, name: string): Party => ({ key, kind: "person", name, source: "s" });

describe("fingerprint + diff", () => {
  it("reports each kind of change, in parcel order", () => {
    const before = {
      "12033:1": fingerprint(prop("1", { justValueCents: fact(100_000_00) }), party("a", "Ann")),
      "12033:2": fingerprint(prop("2", { justValueCents: fact(100_000_00) }), party("b", "Bob")),
      "12033:3": fingerprint(prop("3", { listingStatus: fact({ status: "Active" }) }), party("c", "Cy")),
    };
    const after = {
      "12033:1": fingerprint(prop("1", { justValueCents: fact(105_000_00) }), party("a", "Ann")), // +5%: under 10%
      "12033:2": fingerprint(prop("2", { justValueCents: fact(120_000_00) }), party("z", "Zed")), // sold + revalued
      "12033:3": fingerprint(
        prop("3", { listingStatus: fact({ status: "Expired" }), distressSignals: fact(["Lis Pendens"]) }),
        party("c", "Cy"),
      ),
      "12033:4": fingerprint(prop("4"), party("d", "Di")),
    };
    expect(diffSnapshots(before, after, 10).map((e) => `${e.propertyKey} ${e.kind}`)).toEqual([
      "12033:2 owner-change",
      "12033:2 value-change",
      "12033:3 listing-change",
      "12033:3 distress-change",
      "12033:4 new-parcel",
    ]);
  });
});

describe("checkMonitor", () => {
  let reply: ResearchOutput | Error;
  const gis: Connector = {
    name: "stub-gis",
    displayName: "stub",
    tier: "free",
    keyEnvVar: null,
    phases: ["research"],
    queryKinds: ["area", "parcel"],
    isConfigured: () => true,
    async research() {
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };
  const model = (owner: string, value: number): ResearchOutput => {
    const p = prop("10", { justValueCents: fact(value) });
    return {
      leads: [],
      contacts: [],
      properties: [p],
      parties: [party(owner, owner)],
      ownerships: [{ propertyKey: p.key, partyKey: owner, role: "owner", source: "s", fetchedAt: T }],
    };
  };
  const monitor = { id: "perdido", query: { kind: "area" as const, geography: { zips: ["32507"] }, filters: {} }, valueChangePct: 10 };

  beforeEach(() => {
    _resetBuiltins();
    _resetSecretCache();
    registerConnector(gis);
  });

  it("baseline first, then events; an outage keeps the old snapshot; changes become parcel queries", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "io-mon-")), "monitors", "perdido.json");
    const opts = { now: () => T, path };

    reply = model("ann", 100_000_00);
    const first = await checkMonitor(monitor, opts);
    expect(first).toMatchObject({ baseline: true, parcels: 1, events: [] });
    expect(statSync(path).mode & 0o777).toBe(0o600);

    reply = new Error("503 from the county");
    const outage = await checkMonitor(monitor, opts);
    expect(outage.events).toEqual([]);
    expect(outage.failedConnectors[0]?.name).toBe("stub-gis");
    expect((await readSnapshot(path))?.parcels["12033:10"]?.ownerName).toBe("ANN"); // not wiped

    reply = model("zed", 100_000_00);
    const sold = await checkMonitor(monitor, opts);
    expect(sold.baseline).toBe(false);
    expect(sold.events).toEqual([{ kind: "owner-change", propertyKey: "12033:10", before: "ANN", after: "ZED" }]);
    expect(sold.changedQueries).toEqual([{ kind: "parcel", countyFips: "12033", apn: "10" }]);
  });

  it("a corrupt snapshot fails loud", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "io-mon-bad-")), "bad.json");
    writeFileSync(path, JSON.stringify({ nope: true }));
    reply = model("ann", 1);
    await expect(checkMonitor(monitor, { now: () => T, path })).rejects.toThrow(/invalid; delete it to re-baseline/);
  });
});

describe("CLI: monitor", () => {
  it("add → list → check (baseline) → bad id is a usage error", { timeout: 60_000 }, () => {
    const home = mkdtempSync(join(tmpdir(), "io-mon-cli-"));
    const cli = (...args: string[]) =>
      spawnSync(resolve("node_modules/.bin/tsx"), [resolve("cli.ts"), "monitor", ...args], {
        env: { PATH: process.env.PATH ?? "", HOME: home, INTENT_OUTREACH_HOME: home, INTENT_OUTREACH_PUBLIC_RECORDS: "0" },
        encoding: "utf8",
      });
    expect(cli("add", "perdido", "--zips", "32507").status).toBe(0);
    expect(cli("list").stdout).toContain("perdido");
    const check = cli("check", "perdido");
    expect(check.status).toBe(0);
    expect(check.stdout).toContain("baseline recorded");
    expect(cli("add", "Bad_ID", "--zips", "32507").status).toBe(2);
    expect(cli("check", "missing").status).toBe(2);
    expect(cli("check", "perdido", "--draft").status).toBe(2); // --draft needs --icp
  });
});
