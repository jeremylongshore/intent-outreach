import { dataExpiresAt } from "./run-retention.js";
import { PROPERTY_PII } from "./pii-policy.js";
/**
 * pipeline_core/monitors.ts — event monitors over property snapshots.
 *
 * A monitor is a saved property query. Each check re-runs the query through
 * the normal research path (fixed routing, budget, cache), reduces every
 * parcel to a small FINGERPRINT of the facts that signal an opportunity, and
 * diffs it against the previous snapshot:
 *
 *   new-parcel        a parcel that was not in the last snapshot
 *   owner-change      the owner of record changed (a sale was recorded)
 *   value-change      just/assessed value moved by at least `valueChangePct`
 *   listing-change    listing status changed (new listing, expired, withdrawn...)
 *   distress-change   distress signals appeared or changed
 *
 * Snapshots live under `${INTENT_OUTREACH_HOME}/monitors/<id>.json` (0600).
 * The FIRST check records a baseline and reports no events. Every event can
 * trigger a mailing, so the snapshot is built to never invent one:
 *
 *   • ABSENCE IS NOT DELETION. A parcel missing from a check (an outage, a
 *     partial page, an empty reply) keeps its last fingerprint; it can never
 *     "reappear" as new.
 *   • A MISSING VALUE NEVER OVERWRITES A KNOWN ONE (listing status, distress,
 *     value), so a source that drops a field for one check cannot re-fire it.
 *   • Values compare only on the SAME field (just vs assessed value), and
 *     owner names compare after normalization (case, punctuation, spacing,
 *     token order), so re-formatting is not a sale.
 *   • TWO-PHASE: checkMonitor returns the events and a `commit()`; the caller
 *     commits after acting (e.g. after the draft run is saved), so a failure in
 *     between re-reports the same events next time instead of losing them.
 *   • One check at a time per monitor (a lock), and the snapshot is fsync'd
 *     before it replaces the old one.
 */

import { constants, mkdir, open, readFile, rename, readdir, stat, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { z } from "zod";
import { ResearchQuerySchema, type Ownership, type Party, type Property, type ResearchQuery } from "./models.js";
import { mergePropertyModel, runResearchQuery, type ConnectorRunOptions } from "./pipeline.js";
import { intentOutreachHome } from "./secrets.js";

export const MonitorSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/, "lowercase letters, digits and dashes"),
  query: ResearchQuerySchema,
  /** Minimum relative change in value that counts as an event (default 10%). */
  valueChangePct: z.number().positive().max(100).default(10),
});
export type Monitor = z.infer<typeof MonitorSchema>;

const FingerprintSchema = z.object({
  ownerName: z.string().optional(),
  ownerKey: z.string().optional(),
  valueCents: z.number().optional(),
  /** Which attribute `valueCents` came from; values only compare on the same key. */
  valueKey: z.string().optional(),
  listingStatus: z.string().optional(),
  distress: z.array(z.string()).optional(),
});
export type Fingerprint = z.infer<typeof FingerprintSchema>;

const SnapshotSchema = z.object({
  monitorId: z.string(),
  checkedAt: z.string().datetime(),
  parcels: z.record(z.string(), FingerprintSchema),
  expiresAt: z.number().finite().optional(),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;

export type MonitorEventKind = "new-parcel" | "owner-change" | "value-change" | "listing-change" | "distress-change";
export interface MonitorEvent {
  kind: MonitorEventKind;
  propertyKey: string;
  before?: unknown;
  after?: unknown;
}

const VALUE_KEYS = ["justValueCents", "marketValueCents", "assessedValueCents"] as const;

/** Owner names as a comparable key: uppercase, punctuation dropped, tokens sorted ("SMITH, JOHN A." = "JOHN A SMITH"). */
export function normalizeOwnerName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9&]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

/** Reduce one parcel to the facts a monitor watches. Pure. */
export function fingerprint(property: Property, owner: Party | undefined): Fingerprint {
  const fp: Fingerprint = {};
  if (owner) {
    fp.ownerName = normalizeOwnerName(owner.name);
    fp.ownerKey = owner.key;
  }
  for (const k of VALUE_KEYS) {
    const v = property.attributes[k]?.value;
    if (typeof v === "number") {
      fp.valueCents = v;
      fp.valueKey = k;
      break;
    }
  }
  const listing = property.attributes.listingStatus?.value as { status?: unknown } | undefined;
  if (listing && typeof listing.status === "string") fp.listingStatus = listing.status.toLowerCase();
  const distress = property.attributes.distressSignals?.value;
  if (Array.isArray(distress)) fp.distress = distress.filter((s): s is string => typeof s === "string").map((s) => s.toLowerCase()).sort();
  return fp;
}

/** Diff two snapshots' parcels into events. Pure; deterministic order (by parcel key, then kind). */
export function diffSnapshots(
  before: Readonly<Record<string, Fingerprint>>,
  after: Readonly<Record<string, Fingerprint>>,
  valueChangePct: number,
): MonitorEvent[] {
  const events: MonitorEvent[] = [];
  for (const key of Object.keys(after).sort()) {
    const a = after[key]!;
    const b = before[key];
    if (!b) {
      events.push({ kind: "new-parcel", propertyKey: key });
      continue;
    }
    if (b.ownerName !== undefined && a.ownerName !== undefined && b.ownerName !== a.ownerName) {
      events.push({ kind: "owner-change", propertyKey: key, before: b.ownerName, after: a.ownerName });
    }
    if (b.valueCents !== undefined && a.valueCents !== undefined && b.valueCents > 0 && a.valueKey === b.valueKey) {
      const pct = (Math.abs(a.valueCents - b.valueCents) / b.valueCents) * 100;
      if (pct >= valueChangePct) events.push({ kind: "value-change", propertyKey: key, before: b.valueCents, after: a.valueCents });
    }
    if (a.listingStatus !== b.listingStatus && a.listingStatus !== undefined) {
      events.push({ kind: "listing-change", propertyKey: key, before: b.listingStatus, after: a.listingStatus });
    }
    if (JSON.stringify(a.distress ?? []) !== JSON.stringify(b.distress ?? []) && (a.distress?.length ?? 0) > 0) {
      events.push({ kind: "distress-change", propertyKey: key, before: b.distress ?? [], after: a.distress });
    }
  }
  return events;
}

export function monitorPath(id: string): string {
  return join(intentOutreachHome(), "monitors", `${id}.json`);
}

/** The last snapshot, or undefined when the monitor has never run. A corrupt snapshot throws (fail loud). */
export async function readSnapshot(path: string, now = Date.now()): Promise<Snapshot | undefined> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`monitor snapshot ${path} is invalid; delete it to re-baseline`);
  }
  const r = SnapshotSchema.safeParse(parsed);
  if (!r.success) throw new Error(`monitor snapshot ${path} is invalid; delete it to re-baseline`);
  const expires = Math.min(r.data.expiresAt ?? Infinity, Date.parse(r.data.checkedAt) + 30 * 86_400_000);
  return expires <= now ? undefined : r.data;
}

async function writeSnapshot(path: string, snap: Snapshot): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${randomUUID()}.tmp`;
  const fh = await open(tmp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
  try {
    try {
      await fh.write(JSON.stringify(snap));
      await fh.sync();
    } finally { await fh.close(); }
    await rename(tmp, path);
  } finally { await unlink(tmp).catch(() => undefined); }
}

/** Merge a check into the previous snapshot: never drop a parcel, never overwrite a known value with a missing one. */
export function mergeFingerprints(
  previous: Readonly<Record<string, Fingerprint>>,
  seen: Readonly<Record<string, Fingerprint>>,
): Record<string, Fingerprint> {
  const out: Record<string, Fingerprint> = { ...previous };
  for (const [key, now] of Object.entries(seen)) {
    const was = previous[key] ?? {};
    out[key] = {
      ...was,
      ...Object.fromEntries(Object.entries(now).filter(([, v]) => v !== undefined)),
      ...(now.valueCents === undefined && was.valueCents !== undefined ? { valueCents: was.valueCents, valueKey: was.valueKey } : {}),
    };
  }
  return out;
}

const STALE_LOCK_MS = 30 * 60_000;

async function acquireMonitorLock(path: string): Promise<() => Promise<void>> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const lockPath = `${path}.lock`;
  try {
    const fh = await open(lockPath, "wx", 0o600);
    await fh.close();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    const age = Date.now() - (await stat(lockPath)).mtimeMs;
    if (age < STALE_LOCK_MS) throw new Error(`monitor check already running (${lockPath}); retry later`);
    await unlink(lockPath).catch(() => undefined);
    return acquireMonitorLock(path);
  }
  return async () => {
    await unlink(lockPath).catch(() => undefined);
  };
}

export interface MonitorCheck {
  monitorId: string;
  baseline: boolean;
  /**
   * Persist the new snapshot. Call it after acting on the events (or right away
   * if nothing will act); until then, the next check re-reports the same events.
   * Releases the monitor lock. Safe to call once.
   */
  commit(): Promise<void>;
  /** Release the lock WITHOUT saving (the events will be reported again). */
  abandon(): Promise<void>;
  parcels: number;
  events: MonitorEvent[];
  /** The changed parcels as a ready-to-run parcel query list (for runPropertyCampaign). */
  changedQueries: ResearchQuery[];
  failedConnectors: { name: string; status: number | string }[];
}

/**
 * Run one monitor check. Takes the monitor lock and returns the events plus
 * `commit()` / `abandon()`; nothing is saved until `commit()`. A check where a
 * connector failed or nothing ran still merges what it did see (absence is
 * never deletion), so it can never produce false "new" parcels.
 */
export async function checkMonitor(
  monitor: Monitor,
  opts: ConnectorRunOptions & { now: () => string; path?: string; icp?: string },
): Promise<MonitorCheck> {
  const m = MonitorSchema.parse(monitor);
  const path = opts.path ?? monitorPath(m.id);
  const release = await acquireMonitorLock(path);
  try {
    const checkedAt = opts.now();
    const checked = Date.parse(checkedAt);
    const previous = await readSnapshot(path, checked); // a corrupt snapshot fails BEFORE any paid research
    if (!previous) await unlink(path).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
    const r = await runResearchQuery(m.query, opts.icp ?? "monitor", { ...opts, piiPolicy: opts.piiPolicy ?? PROPERTY_PII, clock: () => checked });
    const model = mergePropertyModel(r);
    const failed = r.failedConnectors.map((f) => ({ name: f.name, status: f.status }));
    const seen: Record<string, Fingerprint> = {};
    for (const p of model.properties) {
      const own = [...model.ownerships]
        .filter((o: Ownership) => o.propertyKey === p.key)
        .sort((a, b) => Number(b.role === "owner") - Number(a.role === "owner") || a.partyKey.localeCompare(b.partyKey))[0];
      seen[p.key] = fingerprint(p, own ? model.parties.find((x) => x.key === own.partyKey) : undefined);
    }
    const expiresAt = Math.min(dataExpiresAt(model, checked, 30), previous?.expiresAt ?? (previous ? Date.parse(previous.checkedAt) + 30 * 86_400_000 : Infinity));
    if (expiresAt <= checked) throw new Error("Monitor data is past its retention deadline");
    const canBaseline = model.properties.length > 0 && r.ran.length > 0 && failed.length === 0;
    const after = mergeFingerprints(previous?.parcels ?? {}, seen);
    const events = previous ? diffSnapshots(previous.parcels, after, m.valueChangePct) : [];
    const changed = [...new Set(events.map((e) => e.propertyKey))];
    let done = false;
    return {
      monitorId: m.id,
      baseline: previous === undefined,
      parcels: model.properties.length,
      events,
      changedQueries: changed.map((key) => {
        const [countyFips, ...rest] = key.split(":");
        return { kind: "parcel", countyFips: countyFips!, apn: rest.join(":") } as ResearchQuery;
      }),
      failedConnectors: failed,
      async commit() {
        if (done) return;
        done = true;
        try {
          if (previous || canBaseline) await writeSnapshot(path, { monitorId: m.id, checkedAt, expiresAt, parcels: after });
        } finally {
          await release();
        }
      },
      async abandon() {
        if (done) return;
        done = true;
        await release();
      },
    };
  } catch (err) {
    await release();
    throw err;
  }
}


/** Scheduled cleanup shares the monitor lock; definitions and active checks are preserved. */
export async function purgeExpiredSnapshots(dir: string, now = Date.now()): Promise<number> {
  const names = await readdir(dir).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  let removed = 0;
  for (const name of names) {
    const temporary = /^([a-z0-9][a-z0-9-]{0,63})\.json\.[0-9a-f-]+\.tmp$/.exec(name);
    if (!temporary && !/^[a-z0-9][a-z0-9-]{0,63}\.json$/.test(name)) continue;
    const path = join(dir, name);
    let release: (() => Promise<void>) | undefined;
    try {
      release = await acquireMonitorLock(temporary ? join(dir, `${temporary[1]}.json`) : path);
      if (temporary) {
        if (now - (await stat(path)).mtimeMs > 3_600_000) { await unlink(path); removed++; }
        continue;
      }
      if (!(await readSnapshot(path, now))) {
        await unlink(path).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
        removed++;
      }
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith("monitor check already running")) throw error;
    } finally { if (release) await release(); }
  }
  return removed;
}
