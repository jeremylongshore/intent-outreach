/** Eval-only, one-process shared spend admission for the fixed MiniMax M3 route. */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

const ENDPOINT = "https://api.minimax.io/v1/chat/completions";
const CAP = 5_000_000; // Tenths of a micro-dollar: exactly $0.50.
const MAX_BYTES = 262144;
const MAX_OUTPUT = 16384;
const REQUEST_FIELDS = new Set(["model", "messages", "max_tokens", "stream", "n", "temperature", "top_p", "tools", "tool_choice", "parallel_tool_calls", "response_format", "reasoning_effort", "stop"]);
function textMessage(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const message = value as Record<string, unknown>;
  return Object.keys(message).every((key) => ["role", "content", "tool_calls", "tool_call_id", "name"].includes(key)) &&
    ["system", "user", "assistant", "tool"].includes(String(message.role)) &&
    (typeof message.content === "string" || message.content === null || message.content === undefined) &&
    (message.tool_calls === undefined || (Array.isArray(message.tool_calls) && message.tool_calls.length <= 16));
}
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const usd = (units: number) => units / 10_000_000;
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
export type BudgetEntry = {
  requestSha256: string; responseSha256?: string; status: number; outcome: string;
  reservedUsd: number; chargedUsd: number; usage?: { inputTokens: number; outputTokens: number };
};
export async function startMiniMaxBudgetProxy(apiKey: string, transport: typeof fetch = fetch) {
  if (apiKey.trim().length < 8) throw new Error("explicit MiniMax credential required");
  const bearer = randomBytes(32).toString("hex");
  let committed = 0;
  let reserved = 0;
  let stopped = false;
  let violated = false;
  const entries: BudgetEntry[] = [];
  const controllers = new Set<AbortController>();
  const tasks = new Set<Promise<void>>();
  const server = createServer((req, res) => {
    const task = (async () => {
      const reject = (status: number, reason: string) => {
        if (!res.destroyed) { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify({ error: { message: reason } })); }
      };
      const received = Buffer.from(req.headers.authorization ?? "");
      const expected = Buffer.from(`Bearer ${bearer}`);
      if (received.length !== expected.length || !timingSafeEqual(received, expected)) { reject(401, "budget proxy authorization required"); return; }
      if (req.method !== "POST" || req.url !== "/v1/chat/completions") { reject(404, "fixed evaluation route only"); return; }
      const chunks: Buffer[] = [];
      let bytes = 0;
      try {
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > MAX_BYTES) { reject(413, "request bound exceeded"); return; }
          chunks.push(Buffer.from(chunk));
        }
      } catch { return; }
      const body = Buffer.concat(chunks);
      const entry: BudgetEntry = { requestSha256: digest(body), status: 400, outcome: "request_refused", reservedUsd: 0, chargedUsd: 0 };
      entries.push(entry);
      let parsed: Record<string, unknown>;
      try { parsed = JSON.parse(body.toString("utf8")); } catch { reject(400, "invalid evaluation request"); return; }
      if (!parsed || Array.isArray(parsed) || parsed.model !== "MiniMax-M3" ||
          !integer(parsed.max_tokens) || parsed.max_tokens < 1 || parsed.max_tokens > MAX_OUTPUT ||
          (parsed.stream !== undefined && parsed.stream !== false) || (parsed.n !== undefined && parsed.n !== 1) ||
          "max_completion_tokens" in parsed || "best_of" in parsed || !Array.isArray(parsed.messages) ||
          !Object.keys(parsed).every((field) => REQUEST_FIELDS.has(field)) || !parsed.messages.every(textMessage) || parsed.messages.length > 128 || (parsed.tools !== undefined && (!Array.isArray(parsed.tools) || parsed.tools.length > 128 || !parsed.tools.every((tool) => tool && typeof tool === "object" && tool.type === "function")))) {
        reject(400, "model, output or framing bound invalid"); return;
      }
      // Serialized UTF-8 bytes overestimate tokenized content. Reserve additional
      // protocol framing per message/tool plus a fixed allowance; never infer a cheap tokenizer.
      const inputBound = bytes + 4096 + parsed.messages.length * 256 + (Array.isArray(parsed.tools) ? parsed.tools.length * 256 : 0);
      const reserve = inputBound * 3 + parsed.max_tokens * 12;
      // Synchronous admission before the first await: concurrent root/nested calls share this ledger.
      if (req.aborted || res.destroyed || stopped || violated || committed + reserved + reserve > CAP) {
        entry.status = 429; entry.outcome = "budget_refused"; reject(429, "evaluation budget exhausted"); return;
      }
      reserved += reserve;
      entry.reservedUsd = usd(reserve);
      const controller = new AbortController();
      controllers.add(controller);
      const cancel = () => { if (!res.writableEnded) controller.abort(); };
      res.once("close", cancel);
      const timeout = setTimeout(() => controller.abort(), 120000);
      let charge = reserve; // Uncertain failures/cancellation retain their full reservation.
      try {
        const upstream = await transport(ENDPOINT, { method: "POST", redirect: "error", signal: controller.signal,
          headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` }, body });
        entry.status = upstream.status;
        if (!upstream.body) throw new Error("missing response");
        const reader = upstream.body.getReader();
        const output: Uint8Array[] = [];
        let length = 0;
        try {
          for (;;) {
            const part = await reader.read();
            if (part.done) break;
            length += part.value.byteLength;
            if (length > 1048576) throw new Error("response bound exceeded");
            output.push(part.value);
          }
        } finally { await reader.cancel(); }
        const result = Buffer.concat(output);
        entry.responseSha256 = digest(result);
        if (upstream.ok) {
          const data = JSON.parse(result.toString("utf8"));
          if (data.model !== "MiniMax-M3" || !integer(data.usage?.prompt_tokens) || !integer(data.usage?.completion_tokens)) throw new Error("unverifiable usage");
          const input = data.usage.prompt_tokens;
          const completion = data.usage.completion_tokens;
          const actual = input * 3 + completion * 12;
          entry.usage = { inputTokens: input, outputTokens: completion };
          if (input > inputBound || completion > parsed.max_tokens || !Number.isSafeInteger(actual)) {
            violated = true; charge = Number.isSafeInteger(actual) ? Math.max(reserve, actual) : reserve; entry.outcome = "provider_bound_violation"; throw new Error("provider bound violation");
          }
          charge = actual;
          entry.outcome = "completed";
        } else { entry.outcome = "provider_http_failure"; reject(upstream.status, "bounded provider HTTP failure"); return; }
        if (!res.destroyed) { res.writeHead(upstream.status, { "content-type": "application/json" }); res.end(result); }
      } catch {
        entry.status = 502;
        if (entry.outcome !== "provider_bound_violation") entry.outcome = controller.signal.aborted ? "cancelled" : "transport_or_usage_failure";
        reject(502, "bounded evaluation transport failed");
      } finally {
        clearTimeout(timeout); res.removeListener("close", cancel); controllers.delete(controller);
        reserved -= reserve; committed += charge; entry.chargedUsd = usd(charge);
      }
    })();
    tasks.add(task); void task.finally(() => tasks.delete(task));
  });
  await new Promise<void>((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", done); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("loopback listener missing");
  let closing: Promise<void> | undefined;
  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`, bearer,
    snapshot: () => ({ schema: "minimax-eval-budget/v1", transport: "explicit_loopback_budget_proxy", provider: "minimax", model: "MiniMax-M3",
      upstream: ENDPOINT, ceilingUsd: 0.5, pricing: { inputUsdPerMillion: 0.3, outputUsdPerMillion: 1.2, source: "https://platform.minimax.io/docs/guides/pricing-paygo", verifiedDate: "2026-10-10", tier: "standard_input_up_to_512k", basis: "paygo_equivalent_not_subscription_invoice" },
      chargedUsd: usd(committed), reservedUsd: usd(reserved), boundViolation: violated, entries: structuredClone(entries) }),
    close: () => closing ??= (async () => {
      stopped = true;
      for (const controller of controllers) controller.abort();
      const closed = new Promise<void>((done) => server.close(() => done()));
      server.closeAllConnections();
      await Promise.allSettled([...tasks]); await closed;
    })(),
  };
}
