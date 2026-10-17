import { request as httpRequest } from "node:http";
import { describe, expect, it } from "vitest";
import { startMiniMaxBudgetProxy } from "../evals/jrig/minimax-budget-proxy.js";

const key = "fixture-real-key-not-a-credential";
const request = (extra = {}) => ({ model: "MiniMax-M3", messages: [{ role: "user", content: "fixture-only prompt" }], max_tokens: 4096, stream: false, ...extra });
const answer = (usage = { prompt_tokens: 40, completion_tokens: 10 }) => new Response(JSON.stringify({ model: "MiniMax-M3", choices: [{ message: { content: "fixture-only answer" } }], usage }), { status: 200 });
const deferred = () => {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
};
async function loopbackFetch(url: string, init: RequestInit) {
  if (new URL(url).hostname !== "127.0.0.1") throw new Error("test client only permits loopback");
  return new Promise<Response>((resolve, reject) => {
    const req = httpRequest(url, { method: init.method, headers: init.headers as Record<string, string> }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (part) => chunks.push(Buffer.from(part)));
      res.on("end", () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode })));
      res.on("error", reject);
    });
    const abort = () => req.destroy(new Error("client cancelled"));
    init.signal?.addEventListener("abort", abort, { once: true });
    req.on("close", () => init.signal?.removeEventListener("abort", abort));
    req.on("error", reject);
    req.end(init.body);
  });
}
async function send(proxy: Awaited<ReturnType<typeof startMiniMaxBudgetProxy>>, body = request(), token = proxy.bearer, path = "/chat/completions") {
  return loopbackFetch(proxy.baseUrl + path, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
}
async function until(check: () => boolean) {
  for (let n = 0; n < 1000 && !check(); n++) await new Promise((done) => setTimeout(done, 1));
  expect(check()).toBe(true);
}
describe("MiniMax evaluation budget proxy (scripted; no vendor traffic)", () => {
  it("authenticates only loopback and forwards exact body to one fixed no-redirect endpoint", async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const proxy = await startMiniMaxBudgetProxy(key, async (url, init) => { seen.push({ url: String(url), init }); return answer(); });
    try {
      expect(new URL(proxy.baseUrl).hostname).toBe("127.0.0.1");
      expect((await send(proxy, request(), "wrong")).status).toBe(401);
      expect((await send(proxy, request(), proxy.bearer, "/models")).status).toBe(404);
      const body = request();
      expect((await send(proxy, body)).status).toBe(200);
      expect(seen).toHaveLength(1);
      expect(seen[0]?.url).toBe("https://api.minimax.io/v1/chat/completions");
      expect(seen[0]?.init?.redirect).toBe("error");
      expect(seen[0]?.init?.headers).toMatchObject({ authorization: `Bearer ${key}` });
      expect(Buffer.from(seen[0]?.init?.body as Uint8Array).toString()).toBe(JSON.stringify(body));
      const snapshot = proxy.snapshot();
      expect(snapshot.chargedUsd).toBeCloseTo(0.000024, 10);
      expect(snapshot.reservedUsd).toBe(0);
      expect(snapshot.entries[0]).toMatchObject({ status: 200, outcome: "completed", usage: { inputTokens: 40, outputTokens: 10 } });
      for (const forbidden of [key, proxy.bearer, "fixture-only prompt", "fixture-only answer"]) expect(JSON.stringify(snapshot)).not.toContain(forbidden);
    } finally { await proxy.close(); }
  });
  it.each([{ model: "MiniMax-M3.1-Flash-Preview" }, { stream: true }, { n: 2 }, { max_tokens: 16385 }, { max_tokens: 0 }, { max_tokens: undefined }, { max_completion_tokens: 10 }, { messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "https://example.test/image" } }] }] }, { modalities: ["audio"] }])("rejects bypass %j before forwarding", async (extra) => {
    let calls = 0;
    const proxy = await startMiniMaxBudgetProxy(key, async () => { calls++; return answer(); });
    try { expect((await send(proxy, request(extra))).status).toBe(400); expect(calls).toBe(0); expect(proxy.snapshot().chargedUsd).toBe(0); }
    finally { await proxy.close(); }
  });
  it("bounds bytes before forwarding", async () => {
    let calls = 0;
    const proxy = await startMiniMaxBudgetProxy(key, async () => { calls++; return answer(); });
    try {
      expect((await send(proxy, request({ messages: [{ role: "user", content: "x".repeat(262145) }] }))).status).toBe(413);
      expect(calls).toBe(0);
    } finally { await proxy.close(); }
  });
  it("reserves root/nested concurrent calls atomically and refuses before their aggregate crosses $0.50", async () => {
    const pending: ReturnType<typeof deferred>[] = [];
    const proxy = await startMiniMaxBudgetProxy(key, async () => { const d = deferred(); pending.push(d); return d.promise; });
    try {
      const body = request({ messages: [{ role: "user", content: "x".repeat(260000) }], max_tokens: 16384 });
      const jobs = Array.from({ length: 6 }, () => send(proxy, body));
      await until(() => proxy.snapshot().entries.length === 6);
      expect(pending).toHaveLength(5);
      expect(proxy.snapshot().entries.filter((x) => x.outcome === "budget_refused")).toHaveLength(1);
      expect(proxy.snapshot().reservedUsd).toBeLessThanOrEqual(0.5);
      for (const item of pending) item.resolve(answer());
      const replies = await Promise.all(jobs);
      expect(replies.map((x) => x.status).sort()).toEqual([200, 200, 200, 200, 200, 429]);
      expect(proxy.snapshot().chargedUsd).toBeCloseTo(0.00012, 10);
    } finally { await proxy.close(); }
  });
  it("retains uncertain failure charges, sanitizes errors and never retries", async () => {
    let calls = 0;
    const proxy = await startMiniMaxBudgetProxy(key, async () => { calls++; throw new Error(key); });
    try {
      const response = await send(proxy);
      expect(response.status).toBe(502);
      expect(await response.text()).not.toContain(key);
      expect(calls).toBe(1);
      const entry = proxy.snapshot().entries[0];
      expect(entry?.chargedUsd).toBe(entry?.reservedUsd);
      expect(entry?.outcome).toBe("transport_or_usage_failure");
    } finally { await proxy.close(); }
  });
  it("sanitizes HTTP redirect/error bodies without following or retrying", async () => {
    let calls = 0;
    const proxy = await startMiniMaxBudgetProxy(key, async () => { calls++; return new Response(key, { status: 302, headers: { location: "https://evil.example.test" } }); });
    try {
      const response = await send(proxy);
      expect(response.status).toBe(302);
      expect(await response.text()).not.toContain(key);
      expect(calls).toBe(1);
      const entry = proxy.snapshot().entries[0];
      expect(entry?.outcome).toBe("provider_http_failure"); expect(entry?.chargedUsd).toBe(entry?.reservedUsd);
    } finally { await proxy.close(); }
  });
  it("does not release reservation when successful response lacks trustworthy usage", async () => {
    const proxy = await startMiniMaxBudgetProxy(key, async () => new Response(JSON.stringify({ model: "MiniMax-M3", choices: [] }), { status: 200 }));
    try {
      expect((await send(proxy)).status).toBe(502);
      const entry = proxy.snapshot().entries[0];
      expect(entry?.chargedUsd).toBe(entry?.reservedUsd); expect(entry?.outcome).toBe("transport_or_usage_failure");
    } finally { await proxy.close(); }
  });
  it("freezes admission on provider usage outside the declared reservation", async () => {
    let calls = 0;
    const proxy = await startMiniMaxBudgetProxy(key, async () => { calls++; return answer({ prompt_tokens: 1000000, completion_tokens: 10 }); });
    try {
      expect((await send(proxy)).status).toBe(502);
      expect(proxy.snapshot().boundViolation).toBe(true);
      expect((await send(proxy)).status).toBe(429);
      expect(calls).toBe(1);
    } finally { await proxy.close(); }
  });
  it("client cancellation aborts the upstream request and retains its reservation", async () => {
    let started = false;
    let aborted = false;
    const proxy = await startMiniMaxBudgetProxy(key, async (_url, init) => {
      started = true;
      return new Promise<Response>((_resolve, reject) => { init?.signal?.addEventListener("abort", () => { aborted = true; reject(new Error("cancelled")); }, { once: true }); });
    });
    try {
      const controller = new AbortController();
      const job = loopbackFetch(proxy.baseUrl + "/chat/completions", { method: "POST", headers: { authorization: `Bearer ${proxy.bearer}` }, body: JSON.stringify(request()), signal: controller.signal }).catch(() => null);
      await until(() => started); controller.abort(); await job;
      await until(() => aborted && proxy.snapshot().reservedUsd === 0);
      const entry = proxy.snapshot().entries[0];
      expect(entry?.outcome).toBe("cancelled"); expect(entry?.chargedUsd).toBe(entry?.reservedUsd);
    } finally { await proxy.close(); }
  });
  it("shutdown cancels in-flight forwarding and is idempotent", async () => {
    let started = false;
    const proxy = await startMiniMaxBudgetProxy(key, async (_url, init) => {
      started = true;
      return new Promise<Response>((_resolve, reject) => { init?.signal?.addEventListener("abort", () => reject(new Error("cancelled")), { once: true }); });
    });
    const job = send(proxy).catch(() => null);
    await until(() => started);
    await proxy.close(); await proxy.close(); await job;
    expect(proxy.snapshot().reservedUsd).toBe(0);
    expect(proxy.snapshot().entries[0]?.outcome).toBe("cancelled");
  });
});
