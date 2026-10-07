/**
 * tests/routing.test.ts — Phase 4a: capability routing, credit budgets, the
 * response cache and rate limits.
 *
 *   • routing policies: first-hit stops at the first non-empty answer (later
 *     paid sources are never called), ordered-fallback stops at the first call
 *     that did not throw, all calls everyone; the order is the configured list.
 *   • budget: charged before a call; a call that would cross the ceiling is not
 *     made, and once exhausted every later paid call is refused.
 *   • cache: a hit makes no request and costs nothing; TTL expiry; file cache
 *     mode 0600 and corrupt entries are misses.
 *   • rate limits: per-minute waits, per-day throws, httpJson acquires per attempt.
 */

import { mkdtempSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetBuiltins, registerConnector } from "../pipeline_core/connectors/index.js";
import type { Connector, ResearchInput, ResearchOutput } from "../pipeline_core/connectors/types.js";
import { httpJson } from "../pipeline_core/http.js";
import { runCampaign, runResearch } from "../pipeline_core/pipeline.js";
import type { LLMProvider } from "../pipeline_core/providers.js";
import { RateLimiter, RateLimitExceededError, rateLimiter } from "../pipeline_core/rate-limit.js";
import {
  BudgetExceededError,
  cacheKey,
  CreditBudget,
  FileResponseCache,
  MemoryResponseCache,
  orderByRouting,
  stableStringify,
} from "../pipeline_core/routing.js";
import { _resetSecretCache } from "../pipeline_core/secrets.js";
import { registerPack } from "../pipeline_core/packs/index.js";
import { noopCompliance } from "../pipeline_core/packs/types.js";

const EMPTY: ResearchOutput = { leads: [], contacts: [] };
const HIT = (name: string): ResearchOutput => ({
  leads: [{ domain: "acme.com", companyName: `Acme via ${name}`, source: name }],
  contacts: [],
});

function stub(name: string, calls: string[], out: ResearchOutput | Error, extra: Partial<Connector> = {}): Connector {
  return {
    name,
    displayName: name,
    tier: "paid",
    keyEnvVar: null,
    phases: ["research"],
    isConfigured: () => true,
    async research(input: ResearchInput) {
      calls.push(`${name}:${input.domain}`);
      if (out instanceof Error) throw out;
      return out;
    },
    ...extra,
  };
}

const saved = { ...process.env };
beforeEach(() => {
  _resetBuiltins();
  _resetSecretCache();
  for (const k of Object.keys(process.env)) {
    if (k.endsWith("_API_KEY") || k === "ZOOMINFO_JWT" || k === "CLAY_WEBHOOK_URL") delete process.env[k];
  }
});
afterEach(() => {
  process.env = { ...saved };
  vi.restoreAllMocks();
});

describe("routing policies", () => {
  it("orderByRouting keeps the configured order and drops unlisted connectors", () => {
    const cs = [{ name: "a" }, { name: "b" }, { name: "c" }];
    expect(orderByRouting(cs, { policy: "all", connectors: ["c", "a", "missing"] }).map((c) => c.name)).toEqual(["c", "a"]);
    expect(orderByRouting(cs).map((c) => c.name)).toEqual(["a", "b", "c"]);
  });

  it("first-hit: stops at the first non-empty answer; later paid sources are never called", async () => {
    const calls: string[] = [];
    registerConnector(stub("free-empty", calls, EMPTY));
    registerConnector(stub("cheap", calls, HIT("cheap")));
    registerConnector(stub("expensive", calls, HIT("expensive")));
    const r = await runResearch("acme.com", "icp", { routing: { policy: "first-hit" } });
    expect(calls).toEqual(["free-empty:acme.com", "cheap:acme.com"]);
    expect(r.leads[0]?.companyName).toBe("Acme via cheap");
  });

  it("first-hit: an error is not a hit; the next source is tried", async () => {
    const calls: string[] = [];
    registerConnector(stub("down", calls, new Error("503")));
    registerConnector(stub("up", calls, HIT("up")));
    const r = await runResearch("acme.com", "icp", { routing: { policy: "first-hit" } });
    expect(calls).toEqual(["down:acme.com", "up:acme.com"]);
    expect(r.failedConnectors.map((f) => f.name)).toEqual(["down"]);
  });

  it("ordered-fallback: stops at the first call that did not throw, even if empty", async () => {
    const calls: string[] = [];
    registerConnector(stub("down", calls, new Error("503")));
    registerConnector(stub("empty", calls, EMPTY));
    registerConnector(stub("never", calls, HIT("never")));
    await runResearch("acme.com", "icp", { routing: { policy: "ordered-fallback" } });
    expect(calls).toEqual(["down:acme.com", "empty:acme.com"]);
  });

  it("the configured connector list sets the order, overriding registration order", async () => {
    const calls: string[] = [];
    registerConnector(stub("a", calls, HIT("a")));
    registerConnector(stub("b", calls, HIT("b")));
    await runResearch("acme.com", "icp", { routing: { policy: "first-hit", connectors: ["b", "a"] } });
    expect(calls).toEqual(["b:acme.com"]);
  });
});

describe("credit budget", () => {
  it("charges, refuses a call that would cross the ceiling, then refuses everything", () => {
    const b = new CreditBudget(10);
    b.charge("a", 4);
    b.charge("a", 4);
    expect(() => b.charge("b", 3)).toThrow(BudgetExceededError);
    expect(b.exhausted).toBe(true);
    expect(() => b.charge("c", 1)).toThrow(BudgetExceededError); // 2 left, but the run has stopped paying
    b.charge("free", 0); // free calls still fine
    expect(b.summary()).toEqual({ limit: 10, spent: 8, exhausted: true, byConnector: { a: 8 } });
    expect(() => new CreditBudget(-1)).toThrow();
  });

  it("the run stops paid research when the budget refuses a call; free sources are not charged", async () => {
    const calls: string[] = [];
    registerConnector(stub("free", calls, EMPTY, { creditsPerCall: 0 }));
    registerConnector(stub("paid-a", calls, EMPTY, { creditsPerCall: 5 }));
    registerConnector(stub("paid-b", calls, EMPTY, { creditsPerCall: 5 }));
    const budget = new CreditBudget(8);
    const r = await runResearch("acme.com", "icp", { budget });
    expect(calls).toEqual(["free:acme.com", "paid-a:acme.com"]);
    expect(r.budgetExhausted).toBe(true);
    expect(r.failedConnectors).toContainEqual({ name: "paid-b", phase: "research", status: "budget-exhausted" });
    expect(budget.spent).toBe(5);
  });

  it("runCampaign records credits on the run and stops paying across domains", async () => {
    const calls: string[] = [];
    registerConnector(stub("paid", calls, EMPTY, { creditsPerCall: 3 }));
    const provider = { name: "anthropic", model: "stub", generateObject: async () => ({}) } as unknown as LLMProvider;
    const { run } = await runCampaign({
      id: "run-budget",
      icp: "x",
      domains: ["a.com", "b.com", "c.com"],
      provider,
      budgetCredits: 7,
      now: () => "2026-10-06T12:00:00.000Z",
    });
    expect(calls).toEqual(["paid:a.com", "paid:b.com"]);
    expect(run.credits).toEqual({ limit: 7, spent: 6, exhausted: true, byConnector: { paid: 6 } });
    expect(run.failedConnectors).toContainEqual({ name: "paid", phase: "research", status: "budget-exhausted" });
  });

  it("a pack's fixed dataSources routing drives runCampaign", async () => {
    const calls: string[] = [];
    registerConnector(stub("a", calls, HIT("a")));
    registerConnector(stub("b", calls, HIT("b")));
    registerPack({
      id: "routed-test",
      displayName: "Routed",
      compliance: noopCompliance,
      prompts: { score: ["research.v2.md", "enrich.v2.md"], draft: "outreach.v3.md" },
      dataSources: { research: { "company.research": { policy: "first-hit", connectors: ["b", "a"] } } },
    });
    const provider = {
      name: "anthropic",
      model: "stub",
      generateObject: async () => {
        throw new Error("scoring is not under test");
      },
    } as unknown as LLMProvider;
    await runCampaign({ id: "run-routed", icp: "x", domains: ["acme.com"], provider, pack: "routed-test", now: () => "2026-10-06T12:00:00.000Z" });
    expect(calls).toEqual(["b:acme.com"]);
  });
});

describe("response cache", () => {
  it("a hit makes no request and costs nothing; expiry forces a fresh call", async () => {
    const calls: string[] = [];
    registerConnector(stub("slow-paid", calls, HIT("slow-paid"), { creditsPerCall: 2, cacheTtlMs: 60_000 }));
    const cache = new MemoryResponseCache();
    let t = 1_000_000;
    const clock = () => t;
    const budget = new CreditBudget(100);
    await runResearch("acme.com", "icp", { cache, budget, clock });
    const again = await runResearch("ACME.com", "icp", { cache, budget, clock });
    expect(calls).toEqual(["slow-paid:acme.com"]);
    expect(again.cached).toEqual(["slow-paid"]);
    expect(again.leads[0]?.companyName).toBe("Acme via slow-paid");
    expect(budget.spent).toBe(2);
    t += 60_001;
    await runResearch("acme.com", "icp", { cache, budget, clock });
    expect(calls).toHaveLength(2);
  });

  it("connectors without cacheTtlMs are never cached; targeting is part of the key", async () => {
    const calls: string[] = [];
    registerConnector(stub("uncached", calls, HIT("u")));
    registerConnector(stub("cached", calls, HIT("c"), { cacheTtlMs: 60_000 }));
    const cache = new MemoryResponseCache();
    await runResearch("acme.com", "icp", { cache });
    await runResearch("acme.com", "icp", { cache });
    await runResearch("acme.com", "icp", { cache, buyerTitles: ["CTO"] });
    expect(calls.filter((c) => c.startsWith("uncached"))).toHaveLength(3);
    expect(calls.filter((c) => c.startsWith("cached"))).toHaveLength(2);
  });

  it("keys are stable across object key order", () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(stableStringify({ a: { c: 3, d: 2 }, b: 1 }));
    expect(cacheKey("x", "parcel", { a: 1, b: 2 })).toBe(cacheKey("x", "parcel", { b: 2, a: 1 }));
  });

  it("file cache: mode 0600, survives a new instance, corrupt entries are misses", async () => {
    const dir = join(mkdtempSync(join(tmpdir(), "io-cache-")), "cache");
    await new FileResponseCache(dir).set("k1", { v: 1 }, 1_000, 0);
    expect(await new FileResponseCache(dir).get("k1", 500)).toEqual({ v: 1 });
    const file = join(dir, readdirSync(dir)[0]!);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(await new FileResponseCache(dir).get("k1", 1_000)).toBeUndefined();
    expect(readdirSync(dir)).toEqual([]);
    writeFileSync(join(dir, "k2.json"), "{not json");
    expect(await new FileResponseCache(dir).get("k2", 0)).toBeUndefined();
  });
});

describe("rate limits", () => {
  it("per-minute: the third request in a burst of 2/min waits ~30s", async () => {
    let t = 0;
    const waits: number[] = [];
    const rl = new RateLimiter(
      () => t,
      async (ms) => {
        waits.push(ms);
        t += ms;
      },
    );
    await rl.acquire("v", { perMinute: 2 });
    await rl.acquire("v", { perMinute: 2 });
    await rl.acquire("v", { perMinute: 2 });
    expect(waits).toEqual([30_000]);
  });

  it("per-day: the request past the daily cap throws; the window rolls", async () => {
    let t = 0;
    const rl = new RateLimiter(() => t, async () => undefined);
    for (let i = 0; i < 3; i++) await rl.acquire("v", { perDay: 3 });
    await expect(rl.acquire("v", { perDay: 3 })).rejects.toBeInstanceOf(RateLimitExceededError);
    t += 24 * 3_600_000 + 1;
    await expect(rl.acquire("v", { perDay: 3 })).resolves.toBeUndefined();
  });

  it("keys are independent and no limit means no wait", async () => {
    const rl = new RateLimiter(() => 0, async () => {
      throw new Error("should not wait");
    });
    await rl.acquire("a", { perMinute: 1 });
    await rl.acquire("b", { perMinute: 1 });
    await rl.acquire("c", {});
  });

  it("httpJson acquires a slot before every attempt, retries included", async () => {
    const acquire = vi.spyOn(rateLimiter, "acquire").mockResolvedValue(undefined);
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        n += 1;
        return n === 1
          ? new Response("busy", { status: 503 })
          : new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
      }),
    );
    const out = await httpJson("https://api.example.com/x", { rateLimit: { key: "vendor", perMinute: 60 }, retries: 1 });
    expect(out).toEqual({ ok: true });
    expect(acquire).toHaveBeenCalledTimes(2);
    expect(acquire.mock.calls[0]?.[0]).toBe("vendor");
  });
});

describe("review regressions", () => {
  it("a cache write failure never discards a paid, successful result", async () => {
    const calls: string[] = [];
    registerConnector(stub("p", calls, HIT("p"), { creditsPerCall: 5, cacheTtlMs: 60_000 }));
    const broken = {
      get: async () => undefined,
      set: async () => {
        throw new Error("ENOSPC");
      },
    };
    const budget = new CreditBudget(100);
    const r = await runResearch("acme.com", "icp", { cache: broken, budget });
    expect(r.leads).toHaveLength(1);
    expect(r.failedConnectors).toEqual([]);
    expect(budget.spent).toBe(5);
  });

  it("concurrent file-cache writes of one key all succeed", async () => {
    const cache = new FileResponseCache(join(mkdtempSync(join(tmpdir(), "io-cache-race-")), "c"));
    const results = await Promise.allSettled([1, 2, 3, 4, 5].map((v) => cache.set("k", { v }, 1_000, 0)));
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(await cache.get("k", 1)).toEqual(expect.objectContaining({ v: expect.any(Number) }));
  });

  it("a result with item failures is not cached; a complete empty one is", async () => {
    const calls: string[] = [];
    registerConnector(
      stub("partial", calls, { ...HIT("partial"), failures: [{ item: 0, reason: "http", status: 503 }] }, { cacheTtlMs: 60_000 }),
    );
    registerConnector(stub("empty", calls, EMPTY, { cacheTtlMs: 60_000 }));
    const cache = new MemoryResponseCache();
    await runResearch("acme.com", "icp", { cache });
    const again = await runResearch("acme.com", "icp", { cache });
    expect(calls.filter((c) => c.startsWith("partial"))).toHaveLength(2);
    expect(calls.filter((c) => c.startsWith("empty"))).toHaveLength(1);
    expect(again.cached).toEqual(["empty"]);
  });

  it("a malformed cache entry is a miss: the live call is made", async () => {
    const calls: string[] = [];
    registerConnector(stub("p", calls, HIT("p"), { cacheTtlMs: 60_000 }));
    const poisoned = { get: async () => ({}), set: async () => undefined };
    const r = await runResearch("acme.com", "icp", { cache: poisoned });
    expect(calls).toEqual(["p:acme.com"]);
    expect(r.leads).toHaveLength(1);
    expect(r.cached).toEqual([]);
  });

  it("a refused paid call does not stop a later free source", async () => {
    const calls: string[] = [];
    registerConnector(stub("pricey", calls, HIT("pricey"), { creditsPerCall: 50 }));
    registerConnector(stub("free", calls, HIT("free")));
    const r = await runResearch("acme.com", "icp", { budget: new CreditBudget(10) });
    expect(calls).toEqual(["free:acme.com"]);
    expect(r.leads[0]?.companyName).toBe("Acme via free");
    expect(r.budgetExhausted).toBe(true);
  });

  it("runCampaign keeps one budget-exhausted entry per connector, not one per domain", async () => {
    const calls: string[] = [];
    registerConnector(stub("paid", calls, EMPTY, { creditsPerCall: 3 }));
    const provider = { name: "anthropic", model: "stub", generateObject: async () => ({}) } as unknown as LLMProvider;
    const { run } = await runCampaign({
      id: "run-dedupe",
      icp: "x",
      domains: ["a.com", "b.com", "c.com", "d.com"],
      provider,
      budgetCredits: 3,
      now: () => "2026-10-06T12:00:00.000Z",
    });
    expect(run.failedConnectors.filter((f) => f.status === "budget-exhausted")).toHaveLength(1);
  });

  it("a fractional per-minute rate refills instead of hanging", async () => {
    let t = 0;
    const waits: number[] = [];
    const rl = new RateLimiter(
      () => t,
      async (ms) => {
        waits.push(ms);
        t += ms;
      },
    );
    await rl.acquire("slow", { perMinute: 0.5 }); // the first request goes at once
    await rl.acquire("slow", { perMinute: 0.5 }); // the next waits 2 minutes
    expect(waits).toEqual([120_000]);
  });
});
