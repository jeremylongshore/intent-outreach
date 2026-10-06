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

  const check = async (opts: { now: () => string; path: string }) => {
    const r = await checkMonitor(monitor, opts);
    await r.commit();
    return r;
  };

  it("baseline first, then events; an outage keeps the old snapshot; changes become parcel queries", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "io-mon-")), "monitors", "perdido.json");
    const opts = { now: () => T, path };

    reply = model("ann", 100_000_00);
    const first = await check(opts);
    expect(first).toMatchObject({ baseline: true, parcels: 1, events: [] });
    expect(statSync(path).mode & 0o777).toBe(0o600);

    reply = new Error("503 from the county");
    const outage = await check(opts);
    expect(outage.events).toEqual([]);
    expect(outage.failedConnectors[0]?.name).toBe("stub-gis");
    expect((await readSnapshot(path))?.parcels["12033:10"]?.ownerName).toBe("ANN"); // not wiped

    reply = model("zed", 100_000_00);
    const sold = await check(opts);
    expect(sold.baseline).toBe(false);
    expect(sold.events).toEqual([{ kind: "owner-change", propertyKey: "12033:10", before: "ANN", after: "ZED" }]);
    expect(sold.changedQueries).toEqual([{ kind: "parcel", countyFips: "12033", apn: "10" }]);
  });

  it("a corrupt or empty snapshot fails loud, before any research", async () => {
    const dir = mkdtempSync(join(tmpdir(), "io-mon-bad-"));
    let calls = 0;
    reply = model("ann", 1);
    registerConnector({ ...gis, async research() { calls += 1; return reply as ResearchOutput; } });
    for (const body of [JSON.stringify({ nope: true }), ""]) {
      const path = join(dir, `bad-${body.length}.json`);
      writeFileSync(path, body);
      await expect(checkMonitor(monitor, { now: () => T, path })).rejects.toThrow(/invalid; delete it to re-baseline/);
    }
    expect(calls).toBe(0);
  });
});

describe("review regressions: no false events", () => {
  const two = (owners: [string, string], values: [number, number] = [1_000_00, 1_000_00]): ResearchOutput => {
    const a = prop("1", { justValueCents: fact(values[0]) });
    const b = prop("2", { justValueCents: fact(values[1]) });
    return {
      leads: [],
      contacts: [],
      properties: [a, b],
      parties: [party("a", owners[0]), party("b", owners[1])],
      ownerships: [
        { propertyKey: a.key, partyKey: "a", role: "owner", source: "s", fetchedAt: T },
        { propertyKey: b.key, partyKey: "b", role: "owner", source: "s", fetchedAt: T },
      ],
    };
  };
  const only = (out: ResearchOutput, apn: string): ResearchOutput => ({
    ...out,
    properties: out.properties!.filter((p) => p.apn === apn),
  });
  let reply: ResearchOutput | Error = two(["ANN", "BOB"]);
  const monitor = { id: "m", query: { kind: "area" as const, geography: { zips: ["32507"] }, filters: {} }, valueChangePct: 10 };
  const path = () => join(mkdtempSync(join(tmpdir(), "io-mon-reg-")), "m.json");
  const run = async (p: string, out: ResearchOutput | Error) => {
    reply = out;
    const r = await checkMonitor(monitor, { now: () => T, path: p });
    await r.commit();
    return r.events.map((e) => `${e.propertyKey} ${e.kind}`);
  };
  beforeEach(() => {
    _resetBuiltins();
    _resetSecretCache();
    registerConnector({
      name: "stub",
      displayName: "stub",
      tier: "free",
      keyEnvVar: null,
      phases: ["research"],
      queryKinds: ["area"],
      isConfigured: () => true,
      async research() {
        if (reply instanceof Error) throw reply;
        return reply;
      },
    });
  });

  it("a partial or empty check never makes a parcel 'new' later", async () => {
    const p = path();
    await run(p, two(["ANN", "BOB"]));
    expect(await run(p, only(two(["ANN", "BOB"]), "1"))).toEqual([]); // parcel 2 missing this time
    expect(await run(p, { leads: [], contacts: [] })).toEqual([]); // nothing at all
    expect(await run(p, two(["ANN", "BOB"]))).toEqual([]); // both back: not new
  });

  it("re-formatted owner names and a switched value basis are not events", async () => {
    const p = path();
    await run(p, two(["SMITH JOHN A", "BOB"]));
    expect(await run(p, two(["Smith,  John A.", "BOB"]))).toEqual([]);
    const assessedOnly: ResearchOutput = {
      ...two(["SMITH JOHN A", "BOB"]),
      properties: [prop("1", { assessedValueCents: fact(500_00) }), prop("2", { justValueCents: fact(1_000_00) })],
    };
    expect(await run(p, assessedOnly)).toEqual([]);
  });

  it("a listing or distress fact that drops out and comes back does not re-fire", async () => {
    const p = path();
    const listed = (on: boolean): ResearchOutput => ({
      ...two(["ANN", "BOB"]),
      properties: [prop("1", on ? { listingStatus: fact({ status: "Active" }) } : {}), prop("2")],
    });
    await run(p, listed(false));
    expect(await run(p, listed(true))).toEqual(["12033:1 listing-change"]); // a real new listing
    expect(await run(p, listed(false))).toEqual([]); // source drops the field
    expect(await run(p, listed(true))).toEqual([]); // and brings it back: same status, no event
  });

  it("abandon() keeps the old snapshot, so the same events are reported again", async () => {
    const p = path();
    await run(p, two(["ANN", "BOB"]));
    reply = two(["ZED", "BOB"]);
    const failedDraft = await checkMonitor(monitor, { now: () => T, path: p });
    expect(failedDraft.events).toHaveLength(1);
    await failedDraft.abandon();
    expect(await run(p, two(["ZED", "BOB"]))).toEqual(["12033:1 owner-change"]);
  });

  it("one check at a time per monitor", async () => {
    const p = path();
    reply = two(["ANN", "BOB"]);
    const first = await checkMonitor(monitor, { now: () => T, path: p });
    await expect(checkMonitor(monitor, { now: () => T, path: p })).rejects.toThrow(/already running/);
    await first.commit();
    const second = await checkMonitor(monitor, { now: () => T, path: p });
    await second.abandon();
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
    expect(cli("check", "perdido", "--icp", "x").status).toBe(2); // draft options need --draft
    expect(cli("check", "perdido", "--draft", "--icp", "x", "--profile", "nope.json").status).toBe(2); // before research
    expect(cli("add", "perdido", "--zips", "32506").status).toBe(2); // a different query needs --replace
    expect(cli("add", "perdido", "--zips", "32506", "--replace").status).toBe(0);
    expect(cli("add", "zipcheck", "--zips", "3250").status).toBe(2);
  });
});
