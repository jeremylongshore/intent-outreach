/**
 * pipeline_core/key-quotas.ts — several keys per connector, with monthly quotas.
 *
 * A connector's key may come in labelled variants: `APOLLO_API_KEY` (default)
 * plus `APOLLO_API_KEY__TEAM`, `APOLLO_API_KEY__PERSONAL`, ... Optional
 * monthly credit quotas per variant live in `${INTENT_OUTREACH_HOME}/quotas.json`:
 *
 *     { "APOLLO_API_KEY__TEAM": { "monthlyCredits": 1000 } }
 *
 * `useKey(name, credits)` picks the FIRST variant (default first, then labels
 * in order) with room for the call, charges it BEFORE the call (vendors bill
 * attempts) in a month-scoped ledger (`key-usage.json`, 0600, locked), and
 * returns its value. A variant with no quota is unlimited. When every variant
 * is out of quota it throws KeyQuotaExhaustedError, so the connector is
 * recorded as failed and the run goes on. Crossing 80% of a quota queues a
 * warning that the campaign loops add to the run (`drainQuotaWarnings`).
 */

import { randomUUID } from "node:crypto";
import { constants, mkdir, open, readFile, rename, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { registerSecretForRedaction } from "./http.js";
import { getSecret, intentOutreachHome, secretVariants } from "./secrets.js";

export const ALERT_RATIO = 0.8;

const QuotasSchema = z.record(z.string(), z.object({ monthlyCredits: z.number().positive() }));
const LedgerSchema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), used: z.record(z.string(), z.number().nonnegative()) });
type Ledger = z.infer<typeof LedgerSchema>;

export class KeyQuotaExhaustedError extends Error {
  constructor(public readonly key: string) {
    super(`${key}: every configured key is out of its monthly quota`);
    this.name = "KeyQuotaExhaustedError";
  }
}

const quotasPath = () => join(intentOutreachHome(), "quotas.json");
const ledgerPath = () => join(intentOutreachHome(), "key-usage.json");

const warnings: string[] = [];

/** Quota warnings raised since the last drain (the campaign loops add them to the run). */
export function drainQuotaWarnings(): string[] {
  return warnings.splice(0, warnings.length);
}

async function readJson<T>(path: string, schema: z.ZodType<T>, fallback: T): Promise<T> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw err;
  }
  const r = schema.safeParse(JSON.parse(text));
  if (!r.success) throw new Error(`${path} is invalid; fix or remove it`);
  return r.data;
}

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const lockPath = `${ledgerPath()}.lock`;
  await mkdir(intentOutreachHome(), { recursive: true, mode: 0o700 });
  const deadline = Date.now() + 10_000;
  for (;;) {
    try {
      const fh = await open(lockPath, "wx", 0o600);
      await fh.close();
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      const age = await stat(lockPath).then((s) => Date.now() - s.mtimeMs).catch(() => 0);
      if (age > 30_000) await unlink(lockPath).catch(() => undefined);
      if (Date.now() > deadline) throw new Error("key-usage: timed out waiting for the ledger lock");
      await new Promise((r) => setTimeout(r, 20));
    }
  }
  try {
    return await fn();
  } finally {
    await unlink(lockPath).catch(() => undefined);
  }
}

async function writeLedger(ledger: Ledger): Promise<void> {
  const tmp = `${ledgerPath()}.${randomUUID()}.tmp`;
  const fh = await open(tmp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
  try {
    await fh.write(JSON.stringify(ledger));
    await fh.sync();
  } finally {
    await fh.close();
  }
  await rename(tmp, ledgerPath());
}

export interface UsedKey {
  value: string;
  envName: string;
  label: string;
}

/**
 * Pick and charge a key for a call costing `credits`. Throws MissingSecret-style
 * when no variant is configured, KeyQuotaExhaustedError when all are spent.
 */
export async function useKey(name: string, credits = 0, now: Date = new Date()): Promise<UsedKey> {
  const variants = secretVariants(name);
  if (variants.length === 0) {
    getSecret(name); // throws the standard "set NAME" error
  }
  const quotas = await readJson(quotasPath(), QuotasSchema, {});
  const month = now.toISOString().slice(0, 7);
  return withLock(async () => {
    const stored = await readJson(ledgerPath(), LedgerSchema, { month, used: {} });
    const ledger: Ledger = stored.month === month ? stored : { month, used: {} };
    for (const v of variants) {
      const quota = quotas[v.envName]?.monthlyCredits;
      const before = ledger.used[v.envName] ?? 0;
      if (quota !== undefined && before + credits > quota) continue;
      const after = before + credits;
      if (credits > 0) {
        ledger.used[v.envName] = after;
        await writeLedger(ledger);
      }
      if (quota !== undefined && before < quota * ALERT_RATIO && after >= quota * ALERT_RATIO) {
        warnings.push(`quota: ${v.envName} has used ${after} of ${quota} monthly credits (${Math.round((after / quota) * 100)}%)`);
      }
      const value = getSecret(v.envName);
      registerSecretForRedaction(value);
      return { value, envName: v.envName, label: v.label };
    }
    throw new KeyQuotaExhaustedError(name);
  });
}

/** Current usage per configured variant of `name`, for `intent-outreach keys`. */
export async function keyStatus(name: string, now: Date = new Date()) {
  const quotas = await readJson(quotasPath(), QuotasSchema, {});
  const stored = await readJson(ledgerPath(), LedgerSchema, { month: now.toISOString().slice(0, 7), used: {} });
  const sameMonth = stored.month === now.toISOString().slice(0, 7);
  return secretVariants(name).map((v) => ({
    envName: v.envName,
    label: v.label,
    used: sameMonth ? (stored.used[v.envName] ?? 0) : 0,
    monthlyCredits: quotas[v.envName]?.monthlyCredits,
  }));
}
