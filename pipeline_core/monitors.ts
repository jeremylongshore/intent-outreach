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
 * Snapshots live under `${INTENT_OUTREACH_HOME}/monitors/<id>.json` (0600) and
 * are replaced atomically. The FIRST check of a monitor records a baseline and
 * reports no events (everything would otherwise be "new"). Events are returned
 * for the caller to act on, typically a property campaign over the changed
 * parcels; the monitor itself never drafts or sends.
 */

import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
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
  listingStatus: z.string().optional(),
  distress: z.array(z.string()).optional(),
});
export type Fingerprint = z.infer<typeof FingerprintSchema>;

const SnapshotSchema = z.object({
  monitorId: z.string(),
  checkedAt: z.string().datetime(),
  parcels: z.record(z.string(), FingerprintSchema),
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

/** Reduce one parcel to the facts a monitor watches. Pure. */
export function fingerprint(property: Property, owner: Party | undefined): Fingerprint {
  const fp: Fingerprint = {};
  if (owner) {
    fp.ownerName = owner.name.trim().toUpperCase();
    fp.ownerKey = owner.key;
  }
  for (const k of VALUE_KEYS) {
    const v = property.attributes[k]?.value;
    if (typeof v === "number") {
      fp.valueCents = v;
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
    if (b.valueCents !== undefined && a.valueCents !== undefined && b.valueCents > 0) {
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
export async function readSnapshot(path: string): Promise<Snapshot | undefined> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
  const r = SnapshotSchema.safeParse(JSON.parse(text));
  if (!r.success) throw new Error(`monitor snapshot ${path} is invalid; delete it to re-baseline`);
  return r.data;
}

async function writeSnapshot(path: string, snap: Snapshot): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(snap), { mode: 0o600 });
  await chmod(tmp, 0o600);
  await rename(tmp, path);
}

export interface MonitorCheck {
  monitorId: string;
  baseline: boolean;
  parcels: number;
  events: MonitorEvent[];
  /** The changed parcels as a ready-to-run parcel query list (for runPropertyCampaign). */
  changedQueries: ResearchQuery[];
  failedConnectors: { name: string; status: number | string }[];
}

/**
 * Run one monitor check. A check whose research FAILED (a connector error and
 * no parcels) keeps the old snapshot: an outage must never look like every
 * parcel disappearing and then reappearing as "new".
 */
export async function checkMonitor(
  monitor: Monitor,
  opts: ConnectorRunOptions & { now: () => string; path?: string; icp?: string },
): Promise<MonitorCheck> {
  const m = MonitorSchema.parse(monitor);
  const path = opts.path ?? monitorPath(m.id);
  const r = await runResearchQuery(m.query, opts.icp ?? "monitor", opts);
  const model = mergePropertyModel(r);
  const failed = r.failedConnectors.map((f) => ({ name: f.name, status: f.status }));
  const parcels: Record<string, Fingerprint> = {};
  for (const p of model.properties) {
    const own = model.ownerships.find((o: Ownership) => o.propertyKey === p.key && o.role === "owner") ??
      model.ownerships.find((o: Ownership) => o.propertyKey === p.key);
    parcels[p.key] = fingerprint(p, own ? model.parties.find((x) => x.key === own.partyKey) : undefined);
  }
  const previous = await readSnapshot(path);
  if (model.properties.length === 0 && failed.length > 0) {
    return { monitorId: m.id, baseline: previous === undefined, parcels: 0, events: [], changedQueries: [], failedConnectors: failed };
  }
  const events = previous ? diffSnapshots(previous.parcels, parcels, m.valueChangePct) : [];
  await writeSnapshot(path, { monitorId: m.id, checkedAt: opts.now(), parcels });
  const changed = [...new Set(events.map((e) => e.propertyKey))];
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
  };
}
