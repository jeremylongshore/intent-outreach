/**
 * pipeline_core/routing.ts — capability routing, credit budgets, response cache.
 *
 * The provider layer's runtime controls. All three are FIXED CONFIGURATION
 * (a pack's `dataSources`, the caller's options); the LLM never chooses a
 * provider, a budget or a cache (invariant 5).
 *
 *   • ROUTING: an ordered connector list per capability with a policy:
 *       first-hit        call in order, stop at the first NON-EMPTY result
 *                        (a "waterfall": the cheapest source that has the
 *                        answer wins; later paid sources are never called)
 *       ordered-fallback call in order, stop at the first call that did not
 *                        throw, even if it found nothing
 *       all              call every connector (the default, today's behavior)
 *   • BUDGET: a per-run credit ceiling. Each paid call is charged BEFORE it
 *     runs (vendors bill attempts); a call that would cross the ceiling is not
 *     made and the run stops calling paid sources.
 *   • CACHE: a connector that declares `cacheTtlMs` has its research output
 *     cached by connector + query + targeting. A cache hit costs nothing and
 *     makes no request: never pay twice for the same lookup.
 */

import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ResearchQuery } from "./models.js";

export const CAPABILITIES = [
  "company.research",
  "people.search",
  "email.find",
  "property.search",
  "parcel",
  "skiptrace",
  "dnc",
  "entity.resolve",
  "listing.status",
  "flood",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export type RoutingPolicy = "first-hit" | "ordered-fallback" | "all";

export interface Routing {
  policy: RoutingPolicy;
  /** Ordered connector names. Absent = every eligible connector in registration order. */
  connectors?: readonly string[];
}

/** The capability a research query exercises. */
export function capabilityForQuery(query: ResearchQuery): Capability {
  switch (query.kind) {
    case "domain":
      return "company.research";
    case "area":
      return "property.search";
    case "parcel":
      return "parcel";
  }
}

/**
 * Order and filter eligible connectors by a routing list: listed names first,
 * in list order; a listed name that is not eligible is simply absent. Without a
 * list, eligibility order (= registration order) is kept.
 */
export function orderByRouting<C extends { name: string }>(eligible: readonly C[], routing?: Routing): C[] {
  if (!routing?.connectors) return [...eligible];
  const byName = new Map(eligible.map((c) => [c.name, c]));
  return routing.connectors.flatMap((n) => (byName.has(n) ? [byName.get(n)!] : []));
}

// ── budget ────────────────────────────────────────────────────────────────

export class BudgetExceededError extends Error {
  constructor(
    public readonly connector: string,
    public readonly needed: number,
    public readonly remaining: number,
  ) {
    super(`credit budget exhausted: ${connector} needs ${needed}, ${remaining} left`);
    this.name = "BudgetExceededError";
  }
}

export interface CreditSummary {
  limit: number;
  spent: number;
  exhausted: boolean;
  byConnector: Record<string, number>;
}

/** A per-run credit ceiling. Not thread-shared: one instance per run. */
export class CreditBudget {
  private spentCredits = 0;
  private exhaustedFlag = false;
  private readonly ledger = new Map<string, number>();

  constructor(public readonly limit: number) {
    if (!Number.isFinite(limit) || limit < 0) throw new Error(`credit budget must be a finite number >= 0 (got ${limit})`);
  }

  get spent(): number {
    return this.spentCredits;
  }

  get exhausted(): boolean {
    return this.exhaustedFlag;
  }

  /**
   * Charge before a call. Throws (and marks the budget exhausted) if it would
   * cross the limit. Once exhausted, every later paid call is refused too, so a
   * run never spends its remainder on whichever call happens to be cheapest.
   */
  charge(connector: string, credits: number): void {
    if (!(credits >= 0)) throw new Error(`credits must be >= 0 (got ${credits})`);
    if (credits === 0) return;
    if (this.exhaustedFlag || this.spentCredits + credits > this.limit) {
      this.exhaustedFlag = true;
      throw new BudgetExceededError(connector, credits, this.limit - this.spentCredits);
    }
    this.spentCredits += credits;
    this.ledger.set(connector, (this.ledger.get(connector) ?? 0) + credits);
  }

  summary(): CreditSummary {
    return {
      limit: this.limit,
      spent: this.spentCredits,
      exhausted: this.exhaustedFlag,
      byConnector: Object.fromEntries(this.ledger),
    };
  }
}

// ── response cache ────────────────────────────────────────────────────────

export interface ResponseCache {
  get(key: string, now: number): Promise<unknown | undefined>;
  set(key: string, value: unknown, ttlMs: number, now: number): Promise<void>;
}

/** Deterministic JSON: object keys sorted, so equal queries give equal keys. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const o = value as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(",")}}`;
}

export function cacheKey(connector: string, capability: string, subject: unknown): string {
  return createHash("sha256").update(`${connector}|${capability}|${stableStringify(subject)}`).digest("hex");
}

export class MemoryResponseCache implements ResponseCache {
  private readonly entries = new Map<string, { value: unknown; expiresAt: number }>();
  async get(key: string, now: number): Promise<unknown | undefined> {
    const e = this.entries.get(key);
    if (!e) return undefined;
    if (e.expiresAt <= now) {
      this.entries.delete(key);
      return undefined;
    }
    return e.value;
  }
  async set(key: string, value: unknown, ttlMs: number, now: number): Promise<void> {
    this.entries.set(key, { value, expiresAt: now + ttlMs });
  }
}

/**
 * On-disk cache: one JSON file per key (sha256 name) under `dir`, mode 0600 in a
 * 0700 directory, because cached vendor data can hold owner contact details. A
 * corrupt or expired entry is a miss, never an error.
 */
export class FileResponseCache implements ResponseCache {
  constructor(private readonly dir: string) {}

  async get(key: string, now: number): Promise<unknown | undefined> {
    try {
      const e = JSON.parse(await readFile(join(this.dir, `${key}.json`), "utf8")) as { value: unknown; expiresAt: number };
      return typeof e.expiresAt === "number" && e.expiresAt > now ? e.value : undefined;
    } catch {
      return undefined;
    }
  }

  async set(key: string, value: unknown, ttlMs: number, now: number): Promise<void> {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    const path = join(this.dir, `${key}.json`);
    const tmp = `${path}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify({ value, expiresAt: now + ttlMs }), { mode: 0o600 });
    await chmod(tmp, 0o600);
    await rename(tmp, path);
  }
}
