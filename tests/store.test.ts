/**
 * tests/store.test.ts — run-store integrity (invariants 1, 3, 6).
 *
 * The run store is the system of record. These tests pin that it:
 *   - refuses schema-invalid records even when the type-only brand was laundered,
 *   - hands out deep-frozen validated values (post-gate mutation throws),
 *   - never loses a run to a torn tail or to concurrent appends,
 *   - reports (never silently drops) corrupt and unknown-version lines,
 *   - rejects duplicate ids unless overwrite is explicit,
 *   - writes owner-only files,
 *   - still reads legacy v1/v2 JSONL (golden fixture).
 * Every test uses a fresh tmpdir — never the real ~/.intent-outreach.
 */

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  appendFileSync,
  copyFileSync,
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { SCHEMA_VERSION, type CampaignRun } from "../pipeline_core/models.js";
import {
  assertCampaignRun,
  validateMessage,
  ValidationError,
  type Validated,
} from "../pipeline_core/validator.js";
import {
  defaultStorePath,
  DuplicateRunError,
  JsonlRunStore,
  MemoryRunStore,
  StoreLockTimeoutError,
} from "../pipeline_core/store.js";

const now = "2026-06-16T00:00:00.000Z";

function sampleRun(id = "run-1", bodyPad = 0) {
  return {
    id,
    schemaVersion: SCHEMA_VERSION,
    icp: "B2B SaaS founders",
    domains: ["acme.com"],
    provider: "anthropic",
    model: "claude-opus-4-8",
    status: "complete" as const,
    leads: [{ domain: "acme.com", companyName: "Acme", source: "apollo" }],
    contacts: [{ name: "Jane Doe", leadDomain: "acme.com", source: "apollo" }],
    enrichments: [],
    messages: [
      {
        contactKey: "jane@acme.com",
        channel: "email" as const,
        body: "Hi Jane, noticed Acme just shipped X..." + "x".repeat(bodyPad),
        cta: "Open to a 15-min call next week?",
        model: "claude-opus-4-8",
        promptVersion: "outreach.v1",
        createdAt: now,
      },
    ],
    skippedConnectors: [],
    createdAt: now,
  };
}

/** A message that fails MessageSchema (empty body). */
const badMessage = {
  contactKey: "jane@acme.com",
  channel: "email",
  body: "",
  cta: "",
  model: "m",
  promptVersion: "v",
  createdAt: now,
};

let dir: string;
let path: string;
let stderr: MockInstance<typeof process.stderr.write>;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "io-store-"));
  path = join(dir, "runs.jsonl");
  stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});
afterEach(() => {
  stderr.mockRestore();
  rmSync(dir, { recursive: true, force: true });
});

const fileLines = () => readFileSync(path, "utf8").split("\n").filter((l) => l.length > 0);

// ── 1. runtime re-check + deep freeze ─────────────────────────────────────────

describe("validated values are deep-frozen", () => {
  it("assertCampaignRun returns a deeply frozen value; mutation throws (strict mode)", () => {
    const run = assertCampaignRun(sampleRun());
    expect(Object.isFrozen(run)).toBe(true);
    expect(Object.isFrozen(run.messages)).toBe(true);
    expect(Object.isFrozen(run.messages[0])).toBe(true);
    // @ts-expect-error — Validated<T> is DeepReadonly: push is a compile error too.
    expect(() => run.messages.push(badMessage)).toThrow(TypeError);
    // @ts-expect-error — readonly property
    expect(() => (run.id = "other")).toThrow(TypeError);
  });

  it("validateMessage (soft gate) also freezes", () => {
    const r = validateMessage(sampleRun().messages[0]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.isFrozen(r.value)).toBe(true);
  });

  it("does not freeze the caller's raw input objects", () => {
    const raw = sampleRun();
    assertCampaignRun(raw);
    expect(Object.isFrozen(raw)).toBe(false);
    expect(Object.isFrozen(raw.messages)).toBe(false);
  });
});

describe("saveRun re-asserts the schema at runtime (brand is type-only)", () => {
  for (const [name, makeStore] of [
    ["JsonlRunStore", () => new JsonlRunStore(path)],
    ["MemoryRunStore", () => new MemoryRunStore()],
  ] as const) {
    it(`${name}: a spread that keeps the brand but breaks the schema is refused`, async () => {
      const store = makeStore();
      const valid = assertCampaignRun(sampleRun());
      const laundered = { ...valid, messages: [badMessage] } as unknown as typeof valid;
      await expect(store.saveRun(laundered)).rejects.toBeInstanceOf(ValidationError);
      expect(await store.listRunIds()).toEqual([]);
    });

    it(`${name}: a JSON.parse cast to the brand is refused`, async () => {
      const store = makeStore();
      const forged = JSON.parse(JSON.stringify({ ...sampleRun(), status: "bogus" }));
      await expect(store.saveRun(forged as Validated<CampaignRun>)).rejects.toBeInstanceOf(
        ValidationError,
      );
      expect(await store.listRunIds()).toEqual([]);
    });
  }

  it("JsonlRunStore never creates the file for a refused run", async () => {
    const store = new JsonlRunStore(path);
    const forged = { ...sampleRun(), id: "" } as unknown as Validated<CampaignRun>;
    await expect(store.saveRun(forged)).rejects.toBeInstanceOf(ValidationError);
    expect(existsSync(path)).toBe(false);
  });

  it("persists the schema output, not extra caller fields", async () => {
    const store = new JsonlRunStore(path);
    const valid = assertCampaignRun(sampleRun());
    const extra = { ...valid, secretToken: "sk-should-not-persist" } as typeof valid;
    await store.saveRun(extra);
    expect(readFileSync(path, "utf8")).not.toContain("sk-should-not-persist");
  });
});

// ── 2. torn-write + concurrency safety ────────────────────────────────────────

describe("torn writes and concurrent appends never lose a run", () => {
  it("repairs a torn tail so the next run is not glued onto the fragment", async () => {
    const store = new JsonlRunStore(path);
    await store.saveRun(assertCampaignRun(sampleRun("before")));
    appendFileSync(path, '{"id":"torn","schemaVer'); // crash mid-write: no newline
    await store.saveRun(assertCampaignRun(sampleRun("after")));

    expect(await store.listRunIds()).toEqual(["before", "after"]);
    expect(await store.getRun("after")).not.toBeNull();
    expect(await store.corruptLines()).toEqual([{ line: 2, reason: "invalid-json" }]);
    expect(readFileSync(path, "utf8").endsWith("\n")).toBe(true);
  });

  it("many concurrent large saves from separate store instances all survive intact", async () => {
    const N = 24;
    await Promise.all(
      Array.from({ length: N }, (_, i) =>
        new JsonlRunStore(path).saveRun(assertCampaignRun(sampleRun(`c-${i}`, 200_000))),
      ),
    );
    const store = new JsonlRunStore(path);
    expect((await store.listRunIds()).sort()).toEqual(
      Array.from({ length: N }, (_, i) => `c-${i}`).sort(),
    );
    expect(await store.corruptLines()).toEqual([]);
    expect(fileLines()).toHaveLength(N);
    expect(existsSync(`${path}.lock`)).toBe(false);
  });

  it("separate OS processes appending at once do not interleave", async () => {
    const run = promisify(execFile);
    const tsx = resolve("node_modules/.bin/tsx");
    const storeUrl = resolve("pipeline_core/store.ts");
    const validatorUrl = resolve("pipeline_core/validator.ts");
    const script = (tag: string) => `
      import { JsonlRunStore } from ${JSON.stringify(storeUrl)};
      import { assertCampaignRun } from ${JSON.stringify(validatorUrl)};
      const base = ${JSON.stringify(sampleRun("x", 100_000))};
      const s = new JsonlRunStore(${JSON.stringify(path)});
      (async () => {
        for (let i = 0; i < 5; i++) await s.saveRun(assertCampaignRun({ ...base, id: "${tag}-" + i }));
      })().catch((e) => { console.error(e); process.exit(1); });
    `;
    await Promise.all(["p0", "p1", "p2"].map((t) => run(tsx, ["-e", script(t)], { timeout: 60_000 })));
    const store = new JsonlRunStore(path);
    expect((await store.listRunIds()).length).toBe(15);
    expect(await store.corruptLines()).toEqual([]);
  }, 90_000);

  it("breaks a stale lock left by a crashed writer", async () => {
    writeFileSync(`${path}.lock`, "99999 crashed\n");
    const old = new Date(Date.now() - 60_000);
    utimesSync(`${path}.lock`, old, old);
    const store = new JsonlRunStore(path, { staleLockMs: 1_000, lockTimeoutMs: 2_000 });
    await store.saveRun(assertCampaignRun(sampleRun("after-crash")));
    expect(await store.listRunIds()).toEqual(["after-crash"]);
    expect(existsSync(`${path}.lock`)).toBe(false);
  });

  it("times out (typed error) rather than writing while a live lock is held", async () => {
    writeFileSync(`${path}.lock`, "12345 live\n");
    const store = new JsonlRunStore(path, { staleLockMs: 60_000, lockTimeoutMs: 150 });
    await expect(store.saveRun(assertCampaignRun(sampleRun()))).rejects.toBeInstanceOf(
      StoreLockTimeoutError,
    );
    expect(existsSync(path)).toBe(false);
  });
});

// ── 3. corrupt lines are reported, not silent ─────────────────────────────────

describe("corrupt and unknown-version lines are reported", () => {
  it("counts each bad line with its reason and warns once on stderr naming line numbers", async () => {
    const good = JSON.stringify(assertCampaignRun(sampleRun("good")));
    const future = JSON.stringify({ ...sampleRun("future"), schemaVersion: 99 });
    const invalid = JSON.stringify({ ...sampleRun("invalid"), status: "bogus" });
    writeFileSync(path, [good, "not json", future, invalid, ""].join("\n"));

    const store = new JsonlRunStore(path);
    expect(await store.listRunIds()).toEqual(["good"]);
    expect(await store.corruptLines()).toEqual([
      { line: 2, reason: "invalid-json" },
      { line: 3, reason: "unknown-schema-version" },
      { line: 4, reason: "schema-invalid" },
    ]);
    await store.getRun("good");

    const warnings = stderr.mock.calls.map((c) => String(c[0])).filter((s) => s.includes("unreadable"));
    expect(warnings).toHaveLength(1); // one-time, despite three reads
    expect(warnings[0]).toContain("3 unreadable line(s)");
    expect(warnings[0]).toMatch(/line 2 \(invalid-json\), 3 \(unknown-schema-version\), 4 \(schema-invalid\)/);
  });

  it("a clean store reports no corrupt lines and never warns", async () => {
    const store = new JsonlRunStore(path);
    await store.saveRun(assertCampaignRun(sampleRun()));
    expect(await store.corruptLines()).toEqual([]);
    expect(stderr).not.toHaveBeenCalled();
  });
});

// ── 4. duplicate ids ──────────────────────────────────────────────────────────

describe("duplicate run ids", () => {
  for (const [name, makeStore] of [
    ["JsonlRunStore", () => new JsonlRunStore(path)],
    ["MemoryRunStore", () => new MemoryRunStore()],
  ] as const) {
    it(`${name}: rejects a second save of the same id with DuplicateRunError`, async () => {
      const store = makeStore();
      await store.saveRun(assertCampaignRun(sampleRun("dup")));
      const err = await store.saveRun(assertCampaignRun(sampleRun("dup"))).catch((e) => e);
      expect(err).toBeInstanceOf(DuplicateRunError);
      expect((err as DuplicateRunError).runId).toBe("dup");
    });

    it(`${name}: { overwrite: true } saves a new snapshot that wins on read`, async () => {
      const store = makeStore();
      await store.saveRun(assertCampaignRun(sampleRun("dup")));
      await store.saveRun(assertCampaignRun({ ...sampleRun("dup"), icp: "updated" }), {
        overwrite: true,
      });
      expect((await store.getRun("dup"))?.icp).toBe("updated");
      expect(await store.listRunIds()).toEqual(["dup"]);
    });
  }

  it("JSONL overwrite stays append-only (old snapshot kept for audit)", async () => {
    const store = new JsonlRunStore(path);
    await store.saveRun(assertCampaignRun(sampleRun("dup")));
    await store.saveRun(assertCampaignRun({ ...sampleRun("dup"), icp: "updated" }), { overwrite: true });
    expect(fileLines()).toHaveLength(2);
  });
});

// ── 5. permissions ────────────────────────────────────────────────────────────

describe("owner-only permissions", () => {
  it("creates the directory 0700 and the file 0600", async () => {
    const nested = join(dir, "home", "runs.jsonl");
    await new JsonlRunStore(nested).saveRun(assertCampaignRun(sampleRun()));
    expect(statSync(join(dir, "home")).mode & 0o777).toBe(0o700);
    expect(statSync(nested).mode & 0o777).toBe(0o600);
  });

  it("tightens a pre-existing world-readable store file on first write", async () => {
    writeFileSync(path, "");
    chmodSync(path, 0o644);
    await new JsonlRunStore(path).saveRun(assertCampaignRun(sampleRun()));
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });
});

// ── 6. INTENT_OUTREACH_HOME resolution ────────────────────────────────────────

describe("defaultStorePath honours INTENT_OUTREACH_HOME safely", () => {
  const saved = process.env.INTENT_OUTREACH_HOME;
  afterEach(() => {
    if (saved === undefined) delete process.env.INTENT_OUTREACH_HOME;
    else process.env.INTENT_OUTREACH_HOME = saved;
  });

  it("uses an absolute override", () => {
    process.env.INTENT_OUTREACH_HOME = dir;
    expect(defaultStorePath()).toBe(join(dir, "runs.sqlite"));
  });

  for (const unset of ["", "   ", "${INTENT_OUTREACH_HOME}", "${user_config.home}"]) {
    it(`treats ${JSON.stringify(unset)} as unset (falls back to ~/.intent-outreach)`, () => {
      process.env.INTENT_OUTREACH_HOME = unset;
      const p = defaultStorePath();
      expect(p.endsWith(join(".intent-outreach", "runs.sqlite"))).toBe(true);
      expect(p.startsWith("/")).toBe(true);
    });
  }

  it("rejects a relative override", () => {
    process.env.INTENT_OUTREACH_HOME = "relative/dir";
    expect(() => defaultStorePath()).toThrow(/absolute/);
  });
});

// ── 7. golden legacy fixture (invariant 6) ────────────────────────────────────

describe("legacy JSONL golden fixture still parses (invariant 6)", () => {
  it("every v1 and v2 line in tests/fixtures/runs.legacy.jsonl is readable", async () => {
    copyFileSync(resolve("tests/fixtures/runs.legacy.jsonl"), path);
    const store = new JsonlRunStore(path);
    expect(await store.corruptLines()).toEqual([]);
    expect(await store.listRunIds()).toEqual([
      "legacy-v1-complete",
      "legacy-v1-minimal",
      "legacy-v1-enriched",
      "legacy-v2-blocked",
      "legacy-v1-pending",
      "legacy-v1-drafted",
    ]);

    const minimal = await store.getRun("legacy-v1-minimal");
    expect(minimal?.schemaVersion).toBe(1);
    expect(minimal?.vertical).toBe("b2b-sdr"); // v2 default applied to a v1 line
    expect(minimal?.blockedContacts).toEqual([]);
    expect(minimal?.messages).toEqual([]);

    const blocked = await store.getRun("legacy-v2-blocked");
    expect(blocked?.schemaVersion).toBe(2);
    expect(blocked?.blockedContacts).toEqual([{ contactKey: "Ana Ruiz@gulfroof.com", reason: "dnc" }]);

    // Pre-dd46601b v1 statuses (pruned without a version bump) parse again and
    // are kept verbatim — an audit record's status is never rewritten.
    const pending = await store.getRun("legacy-v1-pending");
    expect(pending?.status).toBe("pending");
    const drafted = await store.getRun("legacy-v1-drafted");
    expect(drafted?.status).toBe("drafted");
    expect(drafted?.messages[0]?.needsSenderIdentity).toBe(false); // v4 default on an old message
    expect(drafted?.complianceWarnings).toEqual([]); // v4 default on an old run
  });

  it("new saves append cleanly after legacy lines", async () => {
    copyFileSync(resolve("tests/fixtures/runs.legacy.jsonl"), path);
    const store = new JsonlRunStore(path);
    await store.saveRun(assertCampaignRun(sampleRun("fresh")));
    expect(await store.listRunIds()).toHaveLength(7);
    await expect(store.saveRun(assertCampaignRun(sampleRun("legacy-v1-minimal")))).rejects.toBeInstanceOf(
      DuplicateRunError,
    );
  });
});
