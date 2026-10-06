/**
 * pipeline_core/store.ts — the local run record.
 *
 * Reconciles Thompson ("no hosted DB") with Huyen ("a durable run record is
 * mandatory"): the record exists, but its backend is a local file by default.
 *
 * HARD CONSTRAINT (017-AT-DECR §5): local-only. No hosted/managed database, no
 * telemetry, no server-side retention. The default impl writes append-only JSONL
 * under the user's own directory. A local SQLite adapter can be slotted in behind
 * the same interface later — never a network store.
 *
 * INVARIANT (017-AT-DECR §8): `saveRun` accepts ONLY `Validated<CampaignRun>`.
 * The brand can only be minted by validator.ts, so un-validated model output
 * cannot reach storage — it fails to typecheck. Because a TS brand is erasable
 * (spread, cast, JSON.parse), saveRun ALSO re-asserts the schema at runtime and
 * persists the re-validated value: belt (types) and braces (runtime).
 *
 * DURABILITY: every append is (1) serialized across processes by a `<path>.lock`
 * lockfile, (2) preceded by a newline repair if a prior write was torn, (3) one
 * single write() on an O_APPEND handle, (4) fsync'd. Unreadable lines are never
 * silently dropped — they are counted, exposed via `corruptLines()`, and warned
 * about once on stderr.
 */

import { constants, type FileHandle, mkdir, open, readFile, stat, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { SUPPORTED_SCHEMA_VERSIONS, type CampaignRun } from "./models.js";
import { intentOutreachHome } from "./secrets.js";
import { assertCampaignRun, validateCampaignRun, type Validated } from "./validator.js";

export interface SaveRunOptions {
  /**
   * Allow saving a run whose id is already persisted. The new snapshot is
   * appended (append-only: the old line is kept for audit) and wins on read.
   */
  overwrite?: boolean;
}

/** Why a stored line could not be read back as a CampaignRun. */
export type CorruptReason = "invalid-json" | "unknown-schema-version" | "schema-invalid";

export interface CorruptLine {
  /** 1-based physical line number in the JSONL file. */
  line: number;
  reason: CorruptReason;
}

export interface RunStore {
  /**
   * Persist a validated run. The brand makes un-validated writes a type error;
   * the schema is re-asserted at runtime anyway (throws ValidationError).
   * Throws DuplicateRunError if the id exists, unless `{ overwrite: true }`.
   */
  saveRun(run: Validated<CampaignRun>, opts?: SaveRunOptions): Promise<void>;
  /** Read a run back by id (re-validated on read; corrupt lines are reported, not used). */
  getRun(id: string): Promise<Validated<CampaignRun> | null>;
  /** List all run ids currently persisted. */
  listRunIds(): Promise<string[]>;
  /** Every run (latest write per id), in one read. */
  listRuns(): Promise<Validated<CampaignRun>[]>;
  /** Lines that could not be read back as a valid run (empty for a clean store). */
  corruptLines(): Promise<CorruptLine[]>;
}

export class DuplicateRunError extends Error {
  constructor(public readonly runId: string) {
    super(`run "${runId}" already exists in the store; pass { overwrite: true } to append a new snapshot`);
    this.name = "DuplicateRunError";
  }
}

export class StoreLockTimeoutError extends Error {
  constructor(public readonly lockPath: string) {
    super(`timed out waiting for run-store lock ${lockPath} (another intent-outreach process is writing)`);
    this.name = "StoreLockTimeoutError";
  }
}

/**
 * Default location: the user's own machine, never anything hosted. An empty,
 * whitespace or `${...}`-placeholder INTENT_OUTREACH_HOME is treated as unset; a
 * relative one is rejected (see secrets.ts `envPath`).
 */
export function defaultStorePath(): string {
  return join(intentOutreachHome(), "runs.jsonl");
}

export interface JsonlRunStoreOptions {
  /** Give up acquiring the lock after this long. Default 10s. */
  lockTimeoutMs?: number;
  /** A lockfile older than this is presumed abandoned (crashed writer) and broken. Default 30s. */
  staleLockMs?: number;
}

interface ScanResult {
  runs: { line: number; run: Validated<CampaignRun> }[];
  corrupt: CorruptLine[];
}

const SUPPORTED_VERSIONS: readonly unknown[] = SUPPORTED_SCHEMA_VERSIONS;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Append-only JSONL store. Each line is one CampaignRun snapshot; the latest line
 * for an id wins on read. Simple, diffable, greppable, zero dependencies.
 */
export class JsonlRunStore implements RunStore {
  private readonly lockTimeoutMs: number;
  private readonly staleLockMs: number;
  private permsChecked = false;
  private warnedKey = "";

  constructor(
    private readonly path: string = defaultStorePath(),
    opts: JsonlRunStoreOptions = {},
  ) {
    this.lockTimeoutMs = opts.lockTimeoutMs ?? 10_000;
    this.staleLockMs = opts.staleLockMs ?? 30_000;
  }

  async saveRun(run: Validated<CampaignRun>, opts: SaveRunOptions = {}): Promise<void> {
    // Runtime re-check: the brand is type-only and can be laundered by a spread
    // or a cast. Persist what the schema produces, never the caller's object.
    const checked = assertCampaignRun(run);
    const line = JSON.stringify(checked) + "\n";

    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    await this.withLock(async () => {
      if (!opts.overwrite) {
        const { runs } = await this.scan();
        if (runs.some((r) => r.run.id === checked.id)) throw new DuplicateRunError(checked.id);
      }
      await this.append(line);
    });
  }

  async getRun(id: string): Promise<Validated<CampaignRun> | null> {
    const { runs } = await this.scan();
    // Last write wins: scan from the end.
    for (let i = runs.length - 1; i >= 0; i--) {
      const r = runs[i];
      if (r && r.run.id === id) return r.run;
    }
    return null;
  }

  async listRunIds(): Promise<string[]> {
    const { runs } = await this.scan();
    return [...new Set(runs.map((r) => r.run.id))];
  }

  async listRuns(): Promise<Validated<CampaignRun>[]> {
    const { runs } = await this.scan();
    const latest = new Map<string, Validated<CampaignRun>>();
    for (const r of runs) latest.set(r.run.id, r.run); // last write wins, first-seen order kept
    return [...latest.values()];
  }

  async corruptLines(): Promise<CorruptLine[]> {
    return (await this.scan()).corrupt;
  }

  // ── write path ──────────────────────────────────────────────────────────────

  /** One O_APPEND write (with torn-tail repair folded in), then fsync. */
  private async append(line: string): Promise<void> {
    const fh = await open(
      this.path,
      constants.O_RDWR | constants.O_APPEND | constants.O_CREAT,
      0o600,
    );
    try {
      const st = await fh.stat();
      if (!this.permsChecked) {
        // Tighten a pre-existing file created before this hardening (once per store).
        if ((st.mode & 0o077) !== 0) await fh.chmod(0o600);
        this.permsChecked = true;
      }
      let payload = line;
      if (st.size > 0) {
        const last = Buffer.alloc(1);
        await fh.read(last, 0, 1, st.size - 1);
        // A prior write was torn (no trailing newline): terminate it so this run
        // is not glued onto the fragment and lost with it.
        if (last[0] !== 0x0a) payload = "\n" + line;
      }
      await fh.write(payload);
      await fh.sync();
    } finally {
      await fh.close();
    }
  }

  /**
   * Cross-process mutual exclusion via an exclusive-create lockfile. A lock older
   * than `staleLockMs` (writer crashed mid-save) is broken. Backoff is bounded.
   */
  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const lockPath = `${this.path}.lock`;
    const deadline = Date.now() + this.lockTimeoutMs;
    let delay = 5;
    let lock: FileHandle | undefined;
    while (!lock) {
      try {
        lock = await open(lockPath, "wx", 0o600);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
        try {
          const st = await stat(lockPath);
          if (Date.now() - st.mtimeMs > this.staleLockMs) {
            await unlink(lockPath).catch(() => undefined);
            continue;
          }
        } catch {
          continue; // lock vanished between open and stat — retry immediately
        }
        if (Date.now() >= deadline) throw new StoreLockTimeoutError(lockPath);
        await sleep(delay + Math.floor(Math.random() * delay));
        delay = Math.min(delay * 2, 200);
      }
    }
    try {
      await lock.write(`${process.pid} ${new Date().toISOString()}\n`);
      return await fn();
    } finally {
      await lock.close().catch(() => undefined);
      await unlink(lockPath).catch(() => undefined);
    }
  }

  // ── read path ───────────────────────────────────────────────────────────────

  private async scan(): Promise<ScanResult> {
    let text: string;
    try {
      text = await readFile(this.path, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return { runs: [], corrupt: [] };
      throw err;
    }
    const runs: ScanResult["runs"] = [];
    const corrupt: CorruptLine[] = [];
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      if (raw === undefined || raw.trim().length === 0) continue;
      const lineNo = i + 1;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        corrupt.push({ line: lineNo, reason: "invalid-json" });
        continue;
      }
      // Re-validate on read so a hand-edited/corrupt line can never poison a result.
      const r = validateCampaignRun(parsed);
      if (r.ok) {
        runs.push({ line: lineNo, run: r.value });
        continue;
      }
      const version =
        parsed && typeof parsed === "object" ? (parsed as { schemaVersion?: unknown }).schemaVersion : undefined;
      corrupt.push({
        line: lineNo,
        reason: SUPPORTED_VERSIONS.includes(version) ? "schema-invalid" : "unknown-schema-version",
      });
    }
    this.warnCorrupt(corrupt);
    return { runs, corrupt };
  }

  /** One stderr warning per distinct set of bad lines (not one per read). */
  private warnCorrupt(corrupt: CorruptLine[]): void {
    if (corrupt.length === 0) return;
    const key = corrupt.map((c) => `${c.line}:${c.reason}`).join(",");
    if (key === this.warnedKey) return;
    this.warnedKey = key;
    const detail = corrupt.map((c) => `${c.line} (${c.reason})`).join(", ");
    process.stderr.write(
      `intent-outreach: warning: ${corrupt.length} unreadable line(s) in ${this.path} ` +
        `were skipped: line ${detail}\n`,
    );
  }
}

/**
 * In-memory store for tests and dry runs. Same contract as the JSONL store:
 * brand-gated, runtime re-checked, duplicate-rejecting.
 */
export class MemoryRunStore implements RunStore {
  private readonly runs = new Map<string, Validated<CampaignRun>>();
  async saveRun(run: Validated<CampaignRun>, opts: SaveRunOptions = {}): Promise<void> {
    const checked = assertCampaignRun(run);
    if (!opts.overwrite && this.runs.has(checked.id)) throw new DuplicateRunError(checked.id);
    this.runs.set(checked.id, checked);
  }
  async getRun(id: string): Promise<Validated<CampaignRun> | null> {
    return this.runs.get(id) ?? null;
  }
  async listRunIds(): Promise<string[]> {
    return [...this.runs.keys()];
  }
  async listRuns(): Promise<Validated<CampaignRun>[]> {
    return [...this.runs.values()];
  }
  async corruptLines(): Promise<CorruptLine[]> {
    return [];
  }
}
