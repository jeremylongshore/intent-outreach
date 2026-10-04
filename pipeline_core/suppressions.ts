/**
 * pipeline_core/suppressions.ts — the local suppression (opt-out) list: file I/O.
 *
 * File: `${INTENT_OUTREACH_HOME}/suppressions.jsonl` (default ~/.intent-outreach),
 * one JSON object per line: { kind: "email"|"domain", value, addedAt, reason? }.
 * Local-only, mode 0600 like the run store; never a hosted list.
 *
 * This is the I/O half. The CHECK is pure and lives in compliance/suppression.ts;
 * runCampaign loads the list here (pipeline layer) and hands the gate an
 * in-memory SuppressionList.
 *
 * Fail-closed on read: a line that cannot be parsed or normalized throws with
 * its line number instead of being skipped — silently dropping an opt-out
 * could mean emailing someone who unsubscribed. Writes are whole-file atomic
 * (temp file + rename) under a lockfile, so a crash never leaves a torn line.
 */

import { constants, type FileHandle, mkdir, open, readFile, rename, stat, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { intentOutreachHome } from "./secrets.js";
import {
  buildSuppressionList,
  normalizeSuppressionDomain,
  normalizeSuppressionEmail,
  parseSuppressionValue,
  type SuppressionEntry,
  type SuppressionList,
} from "./compliance/suppression.js";

/** Default suppression file (honors INTENT_OUTREACH_HOME the same way the run store does). */
export function defaultSuppressionsPath(): string {
  return join(intentOutreachHome(), "suppressions.jsonl");
}

function parseEntry(raw: unknown, line: number, path: string): SuppressionEntry {
  const fail = (why: string): never => {
    throw new Error(`suppressions: line ${line} of ${path} is invalid (${why}); fix or remove it`);
  };
  if (!raw || typeof raw !== "object") return fail("not an object");
  const o = raw as Record<string, unknown>;
  if (o.kind !== "email" && o.kind !== "domain") return fail("kind must be email|domain");
  if (typeof o.value !== "string") return fail("value must be a string");
  let value: string;
  try {
    value = o.kind === "email" ? normalizeSuppressionEmail(o.value) : normalizeSuppressionDomain(o.value);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "unparseable value");
  }
  const addedAt = typeof o.addedAt === "string" ? o.addedAt : fail("addedAt must be a string");
  return {
    kind: o.kind,
    value,
    addedAt,
    ...(typeof o.reason === "string" && o.reason ? { reason: o.reason } : {}),
  };
}

/** Read every entry. A missing file is an empty list (nothing suppressed). */
export async function readSuppressions(path: string = defaultSuppressionsPath()): Promise<SuppressionEntry[]> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const out: SuppressionEntry[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw === undefined || !raw.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`suppressions: line ${i + 1} of ${path} is not valid JSON; fix or remove it`);
    }
    out.push(parseEntry(parsed, i + 1, path));
  }
  return out;
}

/** Load the in-memory list the compliance gate checks. Missing file ⇒ empty list. */
export async function loadSuppressionList(path: string = defaultSuppressionsPath()): Promise<SuppressionList> {
  return buildSuppressionList(await readSuppressions(path));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withLock<T>(path: string, fn: () => Promise<T>, timeoutMs = 10_000, staleMs = 30_000): Promise<T> {
  const lockPath = `${path}.lock`;
  const deadline = Date.now() + timeoutMs;
  let lock: FileHandle | undefined;
  let delay = 5;
  while (!lock) {
    try {
      lock = await open(lockPath, "wx", 0o600);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      try {
        if (Date.now() - (await stat(lockPath)).mtimeMs > staleMs) {
          await unlink(lockPath).catch(() => undefined);
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() >= deadline) throw new Error(`suppressions: timed out waiting for lock ${lockPath}`);
      await sleep(delay);
      delay = Math.min(delay * 2, 200);
    }
  }
  try {
    return await fn();
  } finally {
    await lock.close().catch(() => undefined);
    await unlink(lockPath).catch(() => undefined);
  }
}

/** Atomically replace the file with `entries` (temp + fsync + rename), mode 0600. */
async function writeAll(path: string, entries: SuppressionEntry[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.tmp`;
  const fh = await open(tmp, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC, 0o600);
  try {
    await fh.chmod(0o600);
    await fh.write(entries.map((e) => JSON.stringify(e)).join("\n") + (entries.length ? "\n" : ""));
    await fh.sync();
  } finally {
    await fh.close();
  }
  await rename(tmp, path);
}

export interface AddSuppressionResult {
  entry: SuppressionEntry;
  /** False when the value was already suppressed (file unchanged). */
  added: boolean;
}

/**
 * Suppress an email or domain ("@" ⇒ email). Idempotent: an existing entry is
 * returned unchanged. Throws on a malformed value — nothing is written.
 */
export async function addSuppression(
  input: string,
  opts: { reason?: string; now?: () => string; path?: string } = {},
): Promise<AddSuppressionResult> {
  const path = opts.path ?? defaultSuppressionsPath();
  const { kind, value } = parseSuppressionValue(input);
  return withLockAt(path, async () => {
    const entries = await readSuppressions(path);
    const existing = entries.find((e) => e.kind === kind && e.value === value);
    if (existing) return { entry: existing, added: false };
    const entry: SuppressionEntry = {
      kind,
      value,
      addedAt: (opts.now ?? (() => new Date().toISOString()))(),
      ...(opts.reason?.trim() ? { reason: opts.reason.trim() } : {}),
    };
    await writeAll(path, [...entries, entry]);
    return { entry, added: true };
  });
}

/** Remove a suppression. Returns false when it was not on the list. */
export async function removeSuppression(input: string, opts: { path?: string } = {}): Promise<boolean> {
  const path = opts.path ?? defaultSuppressionsPath();
  const { kind, value } = parseSuppressionValue(input);
  return withLockAt(path, async () => {
    const entries = await readSuppressions(path);
    const kept = entries.filter((e) => !(e.kind === kind && e.value === value));
    if (kept.length === entries.length) return false;
    await writeAll(path, kept);
    return true;
  });
}

async function withLockAt<T>(path: string, fn: () => Promise<T>): Promise<T> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  return withLock(path, fn);
}
