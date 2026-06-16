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
 * cannot reach storage — it fails to typecheck.
 */

import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { CampaignRun } from "./models.js";
import { validateCampaignRun, type Validated } from "./validator.js";

export interface RunStore {
  /** Persist a validated run. The brand makes un-validated writes impossible. */
  saveRun(run: Validated<CampaignRun>): Promise<void>;
  /** Read a run back by id (re-validated on read; corrupt lines are skipped). */
  getRun(id: string): Promise<Validated<CampaignRun> | null>;
  /** List all run ids currently persisted. */
  listRunIds(): Promise<string[]>;
}

/** Default location: the user's own machine, never anything hosted. */
export function defaultStorePath(): string {
  const base = process.env.INTENT_OUTREACH_HOME ?? join(homedir(), ".intent-outreach");
  return join(base, "runs.jsonl");
}

/**
 * Append-only JSONL store. Each line is one CampaignRun snapshot; the latest line
 * for an id wins on read. Simple, diffable, greppable, zero dependencies.
 */
export class JsonlRunStore implements RunStore {
  constructor(private readonly path: string = defaultStorePath()) {}

  async saveRun(run: Validated<CampaignRun>): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await appendFile(this.path, JSON.stringify(run) + "\n", "utf8");
  }

  async getRun(id: string): Promise<Validated<CampaignRun> | null> {
    const lines = await this.readLines();
    // Last write wins: scan from the end.
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (line === undefined) continue;
      const parsed = this.tryParseLine(line);
      if (parsed && parsed.id === id) return parsed;
    }
    return null;
  }

  async listRunIds(): Promise<string[]> {
    const lines = await this.readLines();
    const ids = new Set<string>();
    for (const line of lines) {
      const parsed = this.tryParseLine(line);
      if (parsed) ids.add(parsed.id);
    }
    return [...ids];
  }

  private async readLines(): Promise<string[]> {
    try {
      const text = await readFile(this.path, "utf8");
      return text.split("\n").filter((l) => l.trim().length > 0);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
  }

  /** Re-validate on read so a hand-edited/corrupt line can never poison a result. */
  private tryParseLine(line: string): Validated<CampaignRun> | null {
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      return null;
    }
    const r = validateCampaignRun(raw);
    return r.ok ? r.value : null;
  }
}

/**
 * In-memory store for tests and dry runs. Still brand-gated — you cannot put an
 * un-validated run in even a throwaway store.
 */
export class MemoryRunStore implements RunStore {
  private readonly runs = new Map<string, Validated<CampaignRun>>();
  async saveRun(run: Validated<CampaignRun>): Promise<void> {
    this.runs.set(run.id, run);
  }
  async getRun(id: string): Promise<Validated<CampaignRun> | null> {
    return this.runs.get(id) ?? null;
  }
  async listRunIds(): Promise<string[]> {
    return [...this.runs.keys()];
  }
}
