/**
 * Local SQLite with AES-256-GCM payload encryption. SQLite receives ciphertext,
 * keyed opaque identifiers and minimal audit metadata only. This is NOT SQLCipher:
 * counts, timestamps and ciphertext lengths remain visible. See README.md#where-your-data-lives and SECURITY.md.
 * Each operation is one synchronous SQLite transaction, never held across await.
 */
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { closeSync, constants, existsSync, fchmodSync, fstatSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { CampaignRun } from "./models.js";
import { runExpiresAt } from "./run-retention.js";
import { defaultStorePath, legacyStorePath, DuplicateRunError, type CorruptLine, type RunStore, type SaveRunOptions } from "./store.js";
import { assertCampaignRun, type Validated } from "./validator.js";

export class StoreIntegrityError extends Error {
  constructor(message = "Encrypted run store integrity check failed; restore a verified database/key backup") {
    super(message);
    this.name = "StoreIntegrityError";
  }
}

export interface EncryptedStoreOptions {
  /** 32-byte master key file, stored separately from database backups. */
  keyPath?: string;
  now?: () => Date;
}

type Row = { token: string; expires: number; payload: Uint8Array };
export interface StoreAuditEntry {
  sequence: number;
  token: string;
  action: "save" | "overwrite" | "import" | "expire";
  at: number;
  digest: string;
  chain: string;
}

function mac(key: Buffer, value: string | Buffer): string {
  return createHmac("sha256", key).update(value).digest("hex");
}
function equal(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Refuse symlinks/hardlinks and tighten files created by an older version. */
function privateFile(path: string, create: boolean): number {
  const fd = openSync(path, constants.O_RDWR | constants.O_NOFOLLOW | (create ? constants.O_CREAT : 0), 0o600);
  try {
    const st = fstatSync(fd);
    if (!st.isFile() || st.nlink !== 1) throw new StoreIntegrityError("Run-store files must be regular, unlinked files");
    if ((st.mode & 0o077) !== 0) fchmodSync(fd, 0o600);
    return fd;
  } catch (error) { closeSync(fd); throw error; }
}

/** Publish a complete key atomically; competing initializers all read the winner. */
async function readKey(path: string, dbExists: boolean): Promise<Buffer> {
  if (!existsSync(path)) {
    if (dbExists) throw new StoreIntegrityError("Run-store key is missing; restore the original key, never generate a replacement");
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const temporary = `${path}.${randomBytes(12).toString("hex")}.tmp`;
    const fd = openSync(temporary, "wx", 0o600);
    try {
      writeFileSync(fd, randomBytes(32));
      fsyncSync(fd);
      try { linkSync(temporary, path); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    } finally { closeSync(fd); unlinkSync(temporary); }
    const directory = openSync(dirname(path), "r");
    try { fsyncSync(directory); } finally { closeSync(directory); }
  }
  // A concurrent publisher briefly has two links before removing its temporary name.
  for (let attempt = 0; attempt < 5 && lstatSync(path).nlink > 1; attempt++) {
    await new Promise((done) => setTimeout(done, 10));
  }
  const fd = privateFile(path, false);
  try {
    const key = readFileSync(fd);
    if (key.length !== 32) throw new StoreIntegrityError("Run-store key must contain exactly 32 random bytes");
    return key;
  } finally { closeSync(fd); }
}

export class EncryptedSqliteRunStore implements RunStore {
  readonly path: string;
  readonly keyPath: string;
  private readonly clock: () => Date;

  constructor(path = defaultStorePath(), options: EncryptedStoreOptions = {}) {
    this.path = resolve(path);
    const configuredKey = options.keyPath ?? process.env.INTENT_OUTREACH_STORE_KEY_FILE;
    if (configuredKey !== undefined && (!configuredKey.trim() || !isAbsolute(configuredKey))) {
      throw new Error("INTENT_OUTREACH_STORE_KEY_FILE must be an absolute path");
    }
    this.keyPath = configuredKey ?? `${this.path}.key`;
    if (resolve(this.keyPath) === this.path) throw new Error("Run-store database and key paths must differ");
    this.clock = options.now ?? (() => new Date());
  }

  async saveRun(run: Validated<CampaignRun>, options: SaveRunOptions = {}): Promise<void> {
    const checked = assertCampaignRun(run);
    const now = this.clock().getTime();
    const expires = runExpiresAt(checked, now);
    if (expires <= now) throw new Error("Run is past its retention deadline and cannot be saved");
    await this.transact((db, key) => {
      this.purge(db, key, now);
      const token = this.token(key, checked.id);
      const old = db.prepare("SELECT expires FROM runs WHERE token = ?").get(token);
      if (old && !options.overwrite) throw new DuplicateRunError(checked.id);
      // An overwrite cannot extend a previously established retention deadline.
      this.write(db, key, checked, Math.min(expires, old ? Number(old.expires) : expires), old ? "overwrite" : "save", now);
    });
  }

  async getRun(id: string): Promise<Validated<CampaignRun> | null> {
    return this.transact((db, key) => {
      this.purge(db, key, this.clock().getTime());
      const row = db.prepare("SELECT * FROM runs WHERE token = ?").get(this.token(key, id)) as Row | undefined;
      return row ? this.decrypt(key, row) : null;
    });
  }

  async listRunIds(): Promise<string[]> { return (await this.listRuns()).map((run) => run.id); }

  async listRuns(): Promise<Validated<CampaignRun>[]> {
    return this.transact((db, key) => {
      this.purge(db, key, this.clock().getTime());
      return (db.prepare("SELECT * FROM runs ORDER BY rowid").all() as Row[]).map((row) => this.decrypt(key, row));
    });
  }

  /** SQLite corruption fails the entire operation; never return a partial clean list. */
  async corruptLines(): Promise<CorruptLine[]> { await this.listRuns(); return []; }

  async purgeExpired(): Promise<number> {
    return this.transact((db, key) => this.purge(db, key, this.clock().getTime()));
  }

  async audit(): Promise<StoreAuditEntry[]> {
    return this.transact((db) => db.prepare("SELECT * FROM audit ORDER BY sequence").all() as unknown as StoreAuditEntry[]);
  }

  /** All-or-nothing import of latest snapshots. Source is never edited or removed. */
  async migrateJsonl(source: string): Promise<{ imported: number; expired: number; alreadyMigrated: boolean }> {
    if (resolve(source) === this.path || resolve(source) === resolve(this.keyPath)) throw new Error("Migration source must differ from database and key");
    const bytes = readFileSync(source);
    const runs = new Map<string, { run: Validated<CampaignRun>; expires: number }>();
    const now = this.clock().getTime();
    for (const [index, line] of bytes.toString("utf8").split("\n").entries()) {
      if (!line.trim()) continue;
      try {
        const run = assertCampaignRun(JSON.parse(line));
        const expires = Math.min(runExpiresAt(run, now), runs.get(run.id)?.expires ?? Infinity);
        runs.set(run.id, { run, expires });
      }
      catch { throw new StoreIntegrityError(`Legacy JSONL line ${index + 1} is invalid; no records imported`); }
    }
    return this.transact((db, key) => {
      const digest = mac(key, bytes);
      const prior = db.prepare("SELECT value FROM metadata WHERE name = 'legacy_digest'").get();
      if (prior?.value === digest) return { imported: 0, expired: 0, alreadyMigrated: true };
      if (prior || Number(db.prepare("SELECT count(*) AS n FROM audit").get()?.n) > 0) {
        throw new Error("Migration requires an empty encrypted store; use a new --out path");
      }
      let imported = 0;
      let expired = 0;
      for (const { run, expires } of runs.values()) {
        if (expires <= now) {
          this.appendAudit(db, key, this.token(key, run.id), "expire", now, "");
          expired++;
        } else { this.write(db, key, run, expires, "import", now); imported++; }
      }
      db.prepare("INSERT INTO metadata VALUES ('legacy_digest', ?)").run(digest);
      return { imported, expired, alreadyMigrated: false };
    }, true);
  }

  private token(key: Buffer, id: string): string { return mac(key, `run-id:${id}`); }

  private write(db: DatabaseSync, key: Buffer, run: Validated<CampaignRun>, expires: number, action: StoreAuditEntry["action"], now: number): void {
    const token = this.token(key, run.id);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", Buffer.from(mac(key, "payload-key:v1"), "hex"), iv);
    cipher.setAAD(Buffer.from(JSON.stringify([1, token, expires])));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(run), "utf8"), cipher.final()]);
    const payload = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
    db.prepare("INSERT INTO runs(token, expires, payload) VALUES (?, ?, ?) ON CONFLICT(token) DO UPDATE SET expires=excluded.expires, payload=excluded.payload").run(token, expires, payload);
    this.appendAudit(db, key, token, action, now, this.rowDigest(key, { token, expires, payload }));
  }

  private decrypt(key: Buffer, row: Row): Validated<CampaignRun> {
    try {
      const payload = Buffer.from(row.payload);
      const decipher = createDecipheriv("aes-256-gcm", Buffer.from(mac(key, "payload-key:v1"), "hex"), payload.subarray(0, 12));
      decipher.setAuthTag(payload.subarray(12, 28));
      decipher.setAAD(Buffer.from(JSON.stringify([1, row.token, row.expires])));
      const clear = Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]);
      const run = assertCampaignRun(JSON.parse(clear.toString("utf8")));
      if (this.token(key, run.id) !== row.token) throw new StoreIntegrityError();
      return run;
    } catch { throw new StoreIntegrityError(); }
  }

  private rowDigest(key: Buffer, row: Row): string {
    return mac(key, JSON.stringify([row.token, row.expires, Buffer.from(row.payload).toString("base64")]));
  }

  private appendAudit(db: DatabaseSync, key: Buffer, token: string, action: StoreAuditEntry["action"], at: number, digest: string): void {
    const last = db.prepare("SELECT sequence, chain FROM audit ORDER BY sequence DESC LIMIT 1").get();
    const sequence = Number(last?.sequence ?? 0) + 1;
    const chain = mac(key, JSON.stringify([last?.chain ?? "", sequence, token, action, at, digest]));
    db.prepare("INSERT INTO audit VALUES (?, ?, ?, ?, ?, ?)").run(sequence, token, action, at, digest, chain);
  }

  private verify(db: DatabaseSync, key: Buffer): void {
    const check = db.prepare("SELECT value FROM metadata WHERE name = 'key_check'").get();
    if (!equal(String(check?.value ?? ""), mac(key, "store-key-check:v1"))) throw new StoreIntegrityError("Wrong run-store key or damaged store metadata");
    let previous = "";
    let sequence = 0;
    const expected = new Map<string, string>();
    for (const event of db.prepare("SELECT * FROM audit ORDER BY sequence").all() as unknown as StoreAuditEntry[]) {
      const chain = mac(key, JSON.stringify([previous, ++sequence, event.token, event.action, event.at, event.digest]));
      if (event.sequence !== sequence || !equal(event.chain, chain)) throw new StoreIntegrityError();
      if (event.action === "expire") expected.delete(event.token);
      else expected.set(event.token, event.digest);
      previous = chain;
    }
    for (const row of db.prepare("SELECT * FROM runs").all() as Row[]) {
      if (!equal(expected.get(row.token) ?? "", this.rowDigest(key, row))) throw new StoreIntegrityError();
      expected.delete(row.token);
    }
    if (expected.size) throw new StoreIntegrityError();
  }

  private purge(db: DatabaseSync, key: Buffer, now: number): number {
    const expired = db.prepare("SELECT token FROM runs WHERE expires <= ?").all(now);
    for (const row of expired) this.appendAudit(db, key, String(row.token), "expire", now, "");
    db.prepare("DELETE FROM runs WHERE expires <= ?").run(now);
    return expired.length;
  }

  private async transact<T>(fn: (db: DatabaseSync, key: Buffer) => T, migrating = false): Promise<T> {
    // Load SQLite only for storage operations; help and provider commands stay lightweight.
    const { DatabaseSync } = await import("node:sqlite");
    const legacy = this.path === resolve(defaultStorePath()) && existsSync(legacyStorePath()) ? readFileSync(legacyStorePath()) : undefined;
    if (!migrating && legacy && !existsSync(this.path)) throw new Error("Legacy runs.jsonl exists; run intent-outreach store migrate before using encrypted storage");
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    const key = await readKey(this.keyPath, existsSync(this.path));
    // Pre-create/tighten permissions BEFORE SQLite can write a page or journal.
    const fd = privateFile(this.path, true);
    closeSync(fd);
    const db = new DatabaseSync(this.path);
    let transaction = false;
    try {
      db.exec("PRAGMA busy_timeout=10000; PRAGMA synchronous=FULL; PRAGMA secure_delete=ON; BEGIN IMMEDIATE");
      transaction = true;
      const version = Number(db.prepare("PRAGMA user_version").get()?.user_version);
      if (version === 0) {
        if (Number(db.prepare("SELECT count(*) AS n FROM sqlite_master").get()?.n) !== 0) throw new StoreIntegrityError("Not an Intent Outreach encrypted database");
        db.exec(`
          CREATE TABLE metadata(name TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
          CREATE TABLE runs(token TEXT PRIMARY KEY, expires INTEGER NOT NULL, payload BLOB NOT NULL) STRICT;
          CREATE TABLE audit(sequence INTEGER PRIMARY KEY, token TEXT NOT NULL, action TEXT NOT NULL CHECK(action IN ('save','overwrite','import','expire')), at INTEGER NOT NULL, digest TEXT NOT NULL, chain TEXT NOT NULL) STRICT;
          CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT, 'audit is append-only'); END;
          CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT, 'audit is append-only'); END;
          PRAGMA user_version=1;
        `);
        db.prepare("INSERT INTO metadata VALUES ('key_check', ?)").run(mac(key, "store-key-check:v1"));
      } else if (version !== 1) throw new StoreIntegrityError("Unsupported encrypted store version");
      this.verify(db, key);
      if (!migrating && legacy) {
        const imported = db.prepare("SELECT value FROM metadata WHERE name = 'legacy_digest'").get();
        if (imported?.value !== mac(key, legacy)) throw new Error("Legacy runs.jsonl is unimported or changed; run intent-outreach store migrate into an empty store");
      }
      const result = fn(db, key);
      db.exec("COMMIT");
      transaction = false;
      return result;
    } catch (error) {
      if (transaction) db.exec("ROLLBACK");
      throw error;
    } finally { db.close(); key.fill(0); }
  }
}
