/** Single bounded judge call; credentials and provider reasoning never become evidence. */
import { createHash } from "node:crypto";
import { z } from "zod";
import { judgeMessages, validateJudgeResponse, type JudgeInput } from "./judge-policy-v2.js";

export const judgeModel = "MiniMax-M3.1-Flash";
export const judgeTokenLimit = 8192;
export const judgeTimeoutMs = 120000;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const responseSchema = z.object({
  model: z.string().min(1),
  choices: z.array(z.object({ finish_reason: z.literal("stop"), message: z.object({ content: z.string().min(1) }) })).length(1),
  usage: z.object({ prompt_tokens: z.number().int().nonnegative(), completion_tokens: z.number().int().nonnegative() }).passthrough(),
});
export interface JudgeResponseEvidence { requestSha256: string; responseSha256: string; usage: unknown; observedModel: unknown; finalAnswer: unknown }
export async function callEvidenceJudge(input: JudgeInput, options: { apiKey: string; signal?: AbortSignal; endpoint?: string; observe?: (evidence: JudgeResponseEvidence) => void }) {
  const endpoint = options.endpoint ?? "https://api.minimax.io/v1/chat/completions";
  const url = new URL(endpoint);
  if (url.username || url.password || url.search || url.hash ||
    !(endpoint === "https://api.minimax.io/v1/chat/completions" ||
      (url.protocol === "http:" && url.hostname === "127.0.0.1" && url.pathname === "/v1/chat/completions"))) throw new Error("unreviewed judge endpoint");
  const body = JSON.stringify({ model: judgeModel, messages: judgeMessages(input), reasoning_effort: "high",
    max_completion_tokens: judgeTokenLimit, temperature: 0, stream: false });
  const timeout = AbortSignal.timeout(judgeTimeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const response = await fetch(endpoint, { method: "POST", redirect: "error", signal,
    headers: { "content-type": "application/json", authorization: `Bearer ${options.apiKey}` }, body });
  if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error("judge provider HTTP failure"); }
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 1048576) throw new Error("judge provider response exceeds limit");
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const bytes = Buffer.concat(chunks).toString("utf8");
  const responseHash = hash(bytes);
  const raw = JSON.parse(bytes);
  options.observe?.({ requestSha256: hash(body), responseSha256: responseHash, usage: raw?.usage ?? null,
    observedModel: raw?.model ?? null, finalAnswer: raw?.choices?.[0]?.message?.content ?? null });
  const parsed = responseSchema.parse(raw);
  if (parsed.model !== judgeModel) throw new Error("judge response model mismatch");
  const choice = parsed.choices[0];
  if (!choice) throw new Error("missing judge response choice");
  const text = choice.message.content;
  const result = validateJudgeResponse(text, input);
  return { result, text, usage: parsed.usage, requestedModel: judgeModel, observedModel: parsed.model,
    requestSha256: hash(body), responseSha256: responseHash, finalAnswerSha256: hash(text) };
}
