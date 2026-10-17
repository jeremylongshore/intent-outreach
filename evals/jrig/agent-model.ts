/** Explicit OpenAI-compatible transport for nested evaluation agents only. */
import { z } from "zod";
import type { AgentMessage, AgentModel, AgentTurn } from "./agent-host.js";

export const reasoningEffortSchema = z.enum(["none", "low", "medium", "high", "max"]);
export type ReasoningEffort = z.infer<typeof reasoningEffortSchema>;

const responseSchema = z.object({
  choices: z.array(z.object({
    finish_reason: z.enum(["stop", "tool_calls"]),
    message: z.object({
      content: z.string().nullable().optional(),
      tool_calls: z.array(z.object({
        id: z.string().min(1), type: z.literal("function"),
        function: z.object({ name: z.string().min(1), arguments: z.string() }),
      })).max(16).optional(),
    }),
  })).length(1),
  usage: z.object({ prompt_tokens: z.number().int().nonnegative(), completion_tokens: z.number().int().nonnegative() }),
});
function message(value: AgentMessage) {
  if (value.role === "tool") return { role: "tool", tool_call_id: value.callId, content: value.content };
  if (value.role === "assistant") return {
    role: value.role, content: value.content,
    ...(value.calls.length ? { tool_calls: value.calls.map((call) => ({
      id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(call.arguments) },
    })) } : {}),
  };
  return value;
}
async function readBounded(response: Response): Promise<unknown> {
  if (!response.body) throw new Error("missing agent model body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1048576) throw new Error("agent model response exceeds limit");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { await reader.cancel(); }
}

export function createAgentModel(config: { provider: string; model: string; baseUrl: string; apiKey: string; reasoningEffort?: ReasoningEffort }): AgentModel {
  const reasoningEffort = reasoningEffortSchema.optional().parse(config.reasoningEffort);
  const url = new URL(config.baseUrl);
  if (url.username || url.password || url.search || url.hash ||
      !(url.protocol === "https:" || (url.protocol === "http:" && ["127.0.0.1", "[::1]"].includes(url.hostname)))) {
    throw new Error("agent model requires HTTPS or explicit loopback, without URL credentials");
  }
  if (!config.provider.trim() || !config.model.trim() || !config.apiKey.trim()) throw new Error("explicit agent model credentials required");
  const endpoint = config.baseUrl.replace(/\/$/, "") + "/chat/completions";
  return {
    provider: config.provider, model: config.model,
    async complete(request): Promise<AgentTurn> {
      // No retries or provider fallback: failed/partial execution stays visible.
      // The caller owns the deadline and accounts every returned usage record.
      try {
        const response = await fetch(endpoint, {
          method: "POST", redirect: "error", signal: request.signal,
          headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
          body: JSON.stringify({ model: config.model, temperature: 0, max_tokens: 4096, stream: false,
            ...(reasoningEffort !== undefined ? { reasoning_effort: reasoningEffort } : {}),
            messages: request.messages.map(message), tools: request.tools.map((tool) => ({
              type: "function", function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
            })),
          }),
        });
        if (!response.ok) { await response.body?.cancel(); throw new Error("agent model HTTP failure"); }
        const parsed = responseSchema.parse(await readBounded(response));
        const choice = parsed.choices[0];
        if (!choice) throw new Error("missing agent model choice");
        const calls = choice.message.tool_calls ?? [];
        if ((choice.finish_reason === "tool_calls") !== (calls.length > 0)) throw new Error("inconsistent agent model finish reason");
        return {
          text: choice.message.content ?? "",
          calls: calls.map((call) => ({ id: call.id, name: call.function.name,
            arguments: z.record(z.string(), z.unknown()).parse(JSON.parse(call.function.arguments)),
          })),
          usage: { inputTokens: parsed.usage.prompt_tokens, outputTokens: parsed.usage.completion_tokens },
        };
      } catch {
        // Neither a provider response body nor an exception containing credentials
        // becomes model-visible text or an evaluation artifact.
        throw new Error(request.signal.aborted ? "agent model cancelled" : "agent model transport or response failed");
      }
    },
  };
}
