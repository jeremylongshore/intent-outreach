import { execFile } from "node:child_process";
import { createCipheriv, createHmac, randomBytes } from "node:crypto";
import { chmodSync, existsSync, linkSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedSqliteRunStore, StoreIntegrityError } from "../pipeline_core/encrypted-store.js";
import { runExpiresAt } from "../pipeline_core/run-retention.js";
import { defaultStorePath, DuplicateRunError, JsonlRunStore } from "../pipeline_core/store.js";
import { assertCampaignRun, ValidationError } from "../pipeline_core/validator.js";

const T = Date.parse("2026-10-07T00:00:00.000Z");
const DAY = 86_400_000;
function raw(id = "private-id@example.com", vertical = "residential-re") {
  return { id, schemaVersion: 6, vertical, icp: "Private owner research", domains: [], provider: "fixture", model: "fixture",
    status: "complete", leads: [], contacts: [], enrichments: [], messages: [], skippedConnectors: [], createdAt: new Date(T).toISOString(),
    parties: [{ key: "owner-1", kind: "person", name: "Private Owner Name", source: "fixture" }],
    contactPoints: [{ partyKey: "owner-1", kind: "phone", value: "+12515551234", source: "fixture", fetchedAt: new Date(T).toISOString() }],
  };
}
let home: string;
let path: string;
let now: number;
const store = () => new EncryptedSqliteRunStore(path, { now: () => new Date(now) });
function sql<T>(fn: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(path);
  try { return fn(db); } finally { db.close(); }
}
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "io-encrypted-"));
  path = join(home, "runs.sqlite");
  now = T;
});
afterEach(() => { vi.unstubAllEnvs(); rmSync(home, { recursive: true, force: true }); });

describe("encrypted persistence", () => {
  it("round-trips validated frozen data without plaintext identifiers, owner names or phones on disk", async () => {
    const checked = assertCampaignRun(raw());
    await store().saveRun(checked);
    expect(await store().getRun(checked.id)).toEqual(checked);
    const loaded = await store().getRun(checked.id);
    expect(Object.isFrozen(loaded?.parties[0])).toBe(true);
    const bytes = readFileSync(path);
    for (const secret of [checked.id, "Private Owner Name", "+12515551234", "Private owner research"]) expect(bytes.includes(secret)).toBe(false);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(statSync(`${path}.key`).mode & 0o777).toBe(0o600);
    expect(await store().corruptLines()).toEqual([]);
    expect(await store().getRun("missing")).toBeNull();
    expect(await store().listRunIds()).toEqual([checked.id]);
  });

  it("does not create files for invalid or expired values, even with a laundered brand", async () => {
    const checked = assertCampaignRun(raw());
    await expect(store().saveRun({ ...checked, status: "bogus" } as unknown as typeof checked)).rejects.toBeInstanceOf(ValidationError);
    now = T + 31 * DAY;
    await expect(store().saveRun(checked)).rejects.toThrow("retention deadline");
    expect(existsSync(path)).toBe(false);
    expect(existsSync(`${path}.key`)).toBe(false);
  });

  it("strips caller extras; refuses duplicates; overwrites payload without retaining an old snapshot", async () => {
    const checked = assertCampaignRun(raw());
    const extra = { ...checked, extraSecret: "do not save" };
    await store().saveRun(extra);
    const before = readFileSync(path);
    await expect(store().saveRun(checked)).rejects.toBeInstanceOf(DuplicateRunError);
    expect(readFileSync(path)).toEqual(before);
    await store().saveRun(assertCampaignRun({ ...raw(), icp: "Changed" }), { overwrite: true });
    expect((await store().getRun(checked.id))?.icp).toBe("Changed");
    expect(await store().getRun(checked.id)).not.toHaveProperty("extraSecret");
    expect((await store().audit()).map((e) => e.action)).toEqual(["save", "overwrite"]);
    expect(sql((db) => db.prepare("SELECT count(*) AS n FROM runs").get()?.n)).toBe(1);
    expect(JSON.stringify(await store().audit())).not.toContain(checked.id);
  });

  it("tightens existing file permissions and supports a separate absolute key path", async () => {
    const keyPath = join(home, "keys", "master");
    vi.stubEnv("INTENT_OUTREACH_STORE_KEY_FILE", keyPath);
    await store().saveRun(assertCampaignRun(raw()));
    chmodSync(path, 0o644); chmodSync(keyPath, 0o644);
    expect(await store().listRunIds()).toHaveLength(1);
    expect(statSync(keyPath).mode & 0o777).toBe(0o600);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(existsSync(`${path}.key`)).toBe(false);
    expect(statSync(join(home, "keys")).mode & 0o777).toBe(0o700);
  });

  it("rejects relative, empty and shared database/key paths", () => {
    for (const keyPath of ["", "relative"]) expect(() => new EncryptedSqliteRunStore(path, { keyPath })).toThrow("absolute");
    expect(() => new EncryptedSqliteRunStore(path, { keyPath: path })).toThrow("must differ");
  });

  it("never silently replaces a missing or wrong key, including an empty database file", async () => {
    await store().saveRun(assertCampaignRun(raw()));
    const before = readFileSync(path);
    rmSync(`${path}.key`);
    await expect(store().listRuns()).rejects.toThrow("key is missing");
    expect(existsSync(`${path}.key`)).toBe(false);
    writeFileSync(`${path}.key`, randomBytes(32), { mode: 0o600 });
    await expect(store().listRuns()).rejects.toThrow("Wrong run-store key");
    expect(readFileSync(path)).toEqual(before);
    writeFileSync(`${path}.key`, "bad-key");
    await expect(store().listRuns()).rejects.toThrow("exactly 32");
    rmSync(`${path}.key`); writeFileSync(path, "");
    await expect(store().listRuns()).rejects.toThrow("key is missing");
  });

  it.each(["key", "database"])("refuses symlinks and hardlinks for the %s", async (target) => {
    const linked = target === "key" ? `${path}.key` : path;
    const original = join(home, "original");
    writeFileSync(original, randomBytes(32));
    const originalMode = statSync(original).mode;
    symlinkSync(original, linked);
    await expect(store().listRuns()).rejects.toThrow();
    rmSync(linked);
    linkSync(original, linked);
    if (target === "database") writeFileSync(`${path}.key`, randomBytes(32));
    await expect(store().listRuns()).rejects.toThrow("regular, unlinked");
    expect(statSync(original).mode).toBe(originalMode);
  });

  it("serializes competing processes, including initial key publication and duplicate checks", async () => {
    const exec = promisify(execFile);
    const script = (id: string) => `
      import { EncryptedSqliteRunStore } from ${JSON.stringify(resolve("pipeline_core/encrypted-store.ts"))};
      import { assertCampaignRun } from ${JSON.stringify(resolve("pipeline_core/validator.ts"))};
      const s = new EncryptedSqliteRunStore(${JSON.stringify(path)}, { now: () => new Date(${T}) });
      (async () => {
        await s.saveRun(assertCampaignRun(${JSON.stringify(raw(id))}));
        try { await s.saveRun(assertCampaignRun(${JSON.stringify(raw("same"))})); }
        catch (e) { if (e.name !== 'DuplicateRunError') throw e; }
      })().catch(e => { console.error(e); process.exitCode = 1; });`;
    await Promise.all(["first", "second", "third"].map((id) => exec(resolve("node_modules/.bin/tsx"), ["-e", script(id)], { timeout: 60_000 })));
    expect((await store().listRunIds()).sort()).toEqual(["first", "same", "second", "third"]);
    expect(await store().audit()).toHaveLength(4);
  }, 90_000);
});

describe("integrity and audit", () => {
  it.each(["payload", "deadline", "identifier", "missing row", "extra row", "audit", "metadata", "version"])("fails closed after tampering with %s", async (kind) => {
    await store().saveRun(assertCampaignRun(raw()));
    sql((db) => {
      const query: Record<string, string> = {
        payload: "UPDATE runs SET payload = zeroblob(32)",
        deadline: "UPDATE runs SET expires = 1",
        identifier: "UPDATE runs SET token = 'substituted'",
        "missing row": "DELETE FROM runs",
        "extra row": "INSERT INTO runs VALUES ('extra', 9999999999999, x'00')",
        audit: "DROP TRIGGER audit_no_update; UPDATE audit SET action = 'overwrite'",
        metadata: "UPDATE metadata SET value = 'wrong' WHERE name = 'key_check'",
        version: "PRAGMA user_version=2",
      };
      db.exec(query[kind]!);
    });
    await expect(store().listRuns()).rejects.toBeInstanceOf(StoreIntegrityError);
    await expect(store().corruptLines()).rejects.toBeInstanceOf(StoreIntegrityError);
    await expect(store().saveRun(assertCampaignRun(raw("other")))).rejects.toBeInstanceOf(StoreIntegrityError);
  });

  it("prevents in-place audit updates/deletes and rolls back payload when the audit append fails", async () => {
    await store().saveRun(assertCampaignRun(raw()));
    sql((db) => {
      expect(() => db.exec("DELETE FROM audit")).toThrow("append-only");
      expect(() => db.exec("UPDATE audit SET at=0")).toThrow("append-only");
      db.exec("CREATE TRIGGER fail_append BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT, 'test failure'); END");
    });
    await expect(store().saveRun(assertCampaignRun(raw("other")))).rejects.toThrow("test failure");
    expect(await store().listRunIds()).toEqual([raw().id]);
  });

  it("refuses an unrelated database instead of initializing its tables", async () => {
    writeFileSync(`${path}.key`, randomBytes(32));
    sql((db) => db.exec("CREATE TABLE unrelated(x TEXT)"));
    await expect(store().listRuns()).rejects.toThrow("Not an Intent Outreach");
    expect(sql((db) => db.prepare("SELECT name FROM sqlite_master").all())).toEqual([{ name: "unrelated" }]);
  });

  it.each(["bad-tag", "invalid-schema", "mismatched-id"])("revalidates decrypted payloads independently of the row digest: %s", async (kind) => {
    // Forge using a known TEST key to exercise the second gate independently.
    // Possession of a production key is outside the at-rest threat boundary.
    await store().saveRun(assertCampaignRun(raw()));
    const key = readFileSync(`${path}.key`);
    const hmac = (input: string) => createHmac("sha256", key).update(input).digest("hex");
    sql((db) => {
      const row = db.prepare("SELECT * FROM runs").get()!;
      const event = db.prepare("SELECT * FROM audit").get()!;
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", Buffer.from(hmac("payload-key:v1"), "hex"), iv);
      cipher.setAAD(Buffer.from(JSON.stringify([1, row.token, row.expires])));
      const data = { ...raw(), ...(kind === "invalid-schema" ? { status: "invalid" } : kind === "mismatched-id" ? { id: "other" } : {}) };
      const ciphertext = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()]);
      const payload = Buffer.concat([iv, kind === "bad-tag" ? Buffer.alloc(16) : cipher.getAuthTag(), ciphertext]);
      const digest = hmac(JSON.stringify([row.token, row.expires, payload.toString("base64")]));
      const chain = hmac(JSON.stringify(["", 1, row.token, event.action, event.at, digest]));
      db.exec("DROP TRIGGER audit_no_update");
      db.prepare("UPDATE runs SET payload=?").run(payload);
      db.prepare("UPDATE audit SET digest=?, chain=?").run(digest, chain);
    });
    await expect(store().getRun(raw().id)).rejects.toBeInstanceOf(StoreIntegrityError);
  });
});

describe("retention", () => {
  it("expires residential/unknown packs at 30 days and B2B at 365, keeping only opaque audit evidence", async () => {
    for (const pack of ["residential-re", "b2b-sdr", "custom-pack", "constructor"]) await store().saveRun(assertCampaignRun(raw(pack, pack)));
    now = T + 30 * DAY;
    expect(await store().listRunIds()).toEqual(["b2b-sdr"]);
    expect((await store().audit()).filter((e) => e.action === "expire")).toHaveLength(3);
    now = T + 365 * DAY;
    expect(await store().purgeExpired()).toBe(1);
    expect(await store().purgeExpired()).toBe(0);
    expect(await store().listRuns()).toEqual([]);
  });

  it("enforces the earliest vendor deadline and does not reset it on overwrite", async () => {
    const input = raw();
    const checked = assertCampaignRun({ ...input, contactPoints: [{ ...input.contactPoints[0], fetchedAt: new Date(T - DAY).toISOString(), licenseTerms: { retentionDays: 3 } }] });
    await store().saveRun(checked);
    now = T + DAY;
    await store().saveRun(assertCampaignRun({ ...raw(), createdAt: new Date(now).toISOString() }), { overwrite: true });
    now = T + 2 * DAY;
    expect(await store().getRun(checked.id)).toBeNull();
    expect((await store().audit()).map((e) => e.action)).toEqual(["save", "overwrite", "expire"]);
  });

  it("checks nested vendor facts, timestamp-free Party terms and clamps future timestamps", () => {
    const input = raw();
    const partyTerms = assertCampaignRun({ ...input, parties: [{ ...input.parties[0], licenseTerms: { retentionDays: 4 } }] });
    expect(runExpiresAt(partyTerms, T)).toBe(T + 4 * DAY);
    const future = assertCampaignRun({ ...input, createdAt: new Date(T + DAY).toISOString() });
    expect(runExpiresAt(future, T)).toBe(T + 30 * DAY);
    const enrich = (fact: unknown) => assertCampaignRun({ ...input, enrichments: [{ subjectType: "lead", subjectKey: "example.com", provider: "fixture", fetchedAt: new Date(T).toISOString(), data: { nested: [fact, null] } }] });
    expect(runExpiresAt(enrich({ licenseTerms: { retentionDays: 2 }, fetchedAt: new Date(T - DAY).toISOString() }), T)).toBe(T + DAY);
    expect(() => runExpiresAt(enrich({ licenseTerms: { retentionDays: -1 } }), T)).toThrow("Invalid vendor");
    expect(() => runExpiresAt(enrich({ licenseTerms: { retentionDays: 1 }, fetchedAt: "bad" }), T)).toThrow("Invalid retention timestamp");
  });
});

describe("legacy migration", () => {
  it("requires explicit migration, imports latest snapshots, preserves source and detects later legacy edits", async () => {
    vi.stubEnv("INTENT_OUTREACH_HOME", home);
    const source = join(home, "runs.jsonl");
    const legacy = new JsonlRunStore(source);
    await legacy.saveRun(assertCampaignRun(raw()));
    await legacy.saveRun(assertCampaignRun({ ...raw(), icp: "latest" }), { overwrite: true });
    const original = readFileSync(source);
    expect(defaultStorePath()).toBe(path);
    await expect(store().listRuns()).rejects.toThrow("store migrate");
    expect(existsSync(path)).toBe(false);
    expect(await store().migrateJsonl(source)).toEqual({ imported: 1, expired: 0, alreadyMigrated: false });
    expect((await store().getRun(raw().id))?.icp).toBe("latest");
    expect(await store().migrateJsonl(source)).toEqual({ imported: 0, expired: 0, alreadyMigrated: true });
    expect(readFileSync(source)).toEqual(original);
    writeFileSync(source, `${original}\n`);
    await expect(store().getRun(raw().id)).rejects.toThrow("unimported or changed");
    await expect(store().migrateJsonl(source)).rejects.toThrow("empty encrypted store");
  });

  it("imports schema v1 with additive defaults and audits rather than retains expired snapshots", async () => {
    const source = join(home, "legacy.jsonl");
    const legacy = { ...raw("legacy", "b2b-sdr"), schemaVersion: 1, parties: undefined, contactPoints: undefined, vertical: undefined };
    writeFileSync(source, [legacy, { ...raw("expired"), createdAt: new Date(T - 31 * DAY).toISOString() }].map((r) => JSON.stringify(r)).join("\n"));
    expect(await store().migrateJsonl(source)).toMatchObject({ imported: 1, expired: 1 });
    expect(await store().getRun("legacy")).toMatchObject({ schemaVersion: 1, vertical: "b2b-sdr", parties: [] });
    expect(await store().getRun("expired")).toBeNull();
    expect((await store().audit()).map((e) => e.action)).toEqual(["import", "expire"]);
  });

  it.each(["{torn", JSON.stringify({ ...raw(), schemaVersion: 999 }), JSON.stringify({ ...raw(), status: "bad" })])("never imports a partial corrupt input", async (bad) => {
    const source = join(home, "legacy.jsonl");
    writeFileSync(source, `${JSON.stringify(raw())}\n${bad}`);
    await expect(store().migrateJsonl(source)).rejects.toThrow("line 2 is invalid");
    expect(existsSync(path)).toBe(false);
  });

  it("preserves the earliest deadline across legacy overwrites", async () => {
    const source = join(home, "legacy.jsonl");
    const first = { ...raw(), parties: [{ ...raw().parties[0], licenseTerms: { retentionDays: 1 } }] };
    writeFileSync(source, [first, raw()].map((r) => JSON.stringify(r)).join("\n"));
    await store().migrateJsonl(source);
    now = T + DAY;
    expect(await store().listRuns()).toEqual([]);
  });

  it("refuses same-path migration and nonempty destinations", async () => {
    await expect(store().migrateJsonl(path)).rejects.toThrow("must differ");
    await expect(store().migrateJsonl(`${path}.key`)).rejects.toThrow("must differ");
    await store().saveRun(assertCampaignRun(raw()));
    const source = join(home, "legacy.jsonl");
    writeFileSync(source, JSON.stringify(raw("new")));
    await expect(store().migrateJsonl(source)).rejects.toThrow("empty encrypted store");
    expect(await store().listRunIds()).toEqual([raw().id]);
  });

  it("refuses the entire import when a later record has invalid open-bag retention terms", async () => {
    const source = join(home, "legacy.jsonl");
    const invalid = { ...raw("bad-retention"), enrichments: [{ subjectType: "lead", subjectKey: "example.com", provider: "fixture", fetchedAt: new Date(T).toISOString(), data: { licenseTerms: { retentionDays: -1 } } }] };
    writeFileSync(source, [raw(), invalid].map((r) => JSON.stringify(r)).join("\n"));
    await expect(store().migrateJsonl(source)).rejects.toThrow("line 2 is invalid");
    expect(await store().listRuns()).toEqual([]);
    expect(await store().audit()).toEqual([]);
  });
});
