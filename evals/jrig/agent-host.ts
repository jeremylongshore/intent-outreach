/** Evaluation-only phase-agent host. No model is selected or called by default. */
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { z } from "zod";

const roles = ["outreach-researcher", "outreach-enricher", "outreach-drafter"] as const;
type Role = typeof roles[number];
const roleTools: Record<Role, string[]> = {
  "outreach-researcher": ["list_connectors", "research_domain"],
  "outreach-enricher": ["enrich_lead"],
  "outreach-drafter": ["Read"],
};
const resources = [
  "prompts/outreach.v3.md",
  "skills/intent-outreach/references/report-profiles.md",
  "skills/intent-outreach/references/runtime-contract.md",
] as const;
const object = z.record(z.string(), z.unknown());
const callSchema = z.object({ id: z.string().min(1).max(200), name: z.string().min(1), arguments: object }).strict();
const turnSchema = z.object({
  text: z.string(), calls: z.array(callSchema).max(16),
  usage: z.object({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative() }).strict(),
}).strict();
export type AgentTurn = z.infer<typeof turnSchema>;
export interface HostTool { name: string; description: string; inputSchema: Record<string, unknown> }
export type AgentMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; calls: AgentTurn["calls"] }
  | { role: "tool"; callId: string; name: string; content: string };
export interface AgentModel {
  /** Explicit identity, recorded even for scripted component tests. */
  provider: string;
  model: string;
  complete(request: { messages: AgentMessage[]; tools: HostTool[]; signal: AbortSignal }): Promise<unknown>;
}
export interface AgentBundle {
  tools: HostTool[];
  call(name: string, args: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
}
export interface HostEvent {
  sequence: number; invocation: number; kind: string; role: Role;
  data: Record<string, unknown>;
}
const readTool: HostTool = {
  name: "Read", description: "Read a reviewed repository resource by its exact relative file_path.",
  inputSchema: { type: "object", properties: { file_path: { type: "string", enum: [...resources] } }, required: ["file_path"], additionalProperties: false },
};
const readArgs = z.object({ file_path: z.enum(resources) }).strict();
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

/** Snapshot exact reviewed resources once. Reject symlink escapes and metadata drift. */
export async function loadAgentResources(root: string) {
  const base = await realpath(root);
  const contents = new Map<string, string>();
  for (const path of [...roles.map((role) => `agents/${role}.md`), ...resources]) {
    const actual = await realpath(resolve(base, path));
    if (!actual.startsWith(base + sep)) throw new Error("agent resource escapes repository");
    if (actual !== resolve(base, path)) throw new Error("agent resource path is not reviewed");
    const text = await readFile(actual, "utf8");
    if (Buffer.byteLength(text) > 65536) throw new Error("agent resource exceeds size limit");
    contents.set(path, text);
  }
  const definitions = new Map<Role, { body: string; sha256: string }>();
  for (const role of roles) {
    const source = contents.get(`agents/${role}.md`);
    assert(source, "missing agent source");
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(source);
    const metadata = match?.[1];
    const body = match?.[2];
    if (!metadata || !body || !new RegExp(`^name: ${role}$`, "m").test(metadata)) throw new Error("invalid agent definition");
    for (const declaration of ["model: inherit", "background: false", "skills: []", "disallowedTools: []"]) {
      if (!metadata.split("\n").includes(declaration)) throw new Error("agent execution metadata changed; review host contract");
    }
    const tools = /^tools:\n((?: {2}- [^\n]+\n)+)/m.exec(metadata + "\n")?.[1];
    if (!tools) throw new Error("missing agent tools");
    const declared = tools.trim().split("\n").map((line) => line.trim().slice(2));
    const expected = roleTools[role].flatMap((name) => name === "Read" ? [name] : [
      `mcp__plugin_intent-outreach_intent-outreach__${name}`, `mcp__intent-outreach__${name}`,
    ]);
    if (JSON.stringify(declared.sort()) !== JSON.stringify(expected.sort())) throw new Error("agent tool metadata changed; review host mapping");
    definitions.set(role, { body, sha256: sha(source) });
  }
  return { definitions, contents };
}

/**
 * Each dispatch gets only the unchanged role body and its explicit prompt.
 * The transport adapter must honor AbortSignal and supply actual token usage.
 * This component neither invents agent outputs nor makes approval decisions.
 */
export async function createAgentHost(options: {
  root: string; model: AgentModel; bundle: AgentBundle;
  limits?: { maxInvocations?: number; maxTurns?: number; maxCalls?: number; maxBytes?: number; timeoutMs?: number };
}) {
  const limits = z.object({
    maxInvocations: z.number().int().min(1).max(32).default(12),
    maxTurns: z.number().int().min(1).max(16).default(6),
    maxCalls: z.number().int().min(1).max(64).default(24),
    maxBytes: z.number().int().min(1).max(4194304).default(1048576),
    timeoutMs: z.number().int().min(1).max(300000).default(60000),
  }).strict().parse(options.limits ?? {});
  if (!options.model.provider || !options.model.model) throw new Error("explicit agent model identity required");
  const { definitions, contents } = await loadAgentResources(options.root);
  const bundleTools = new Map(options.bundle.tools.map((tool) => [tool.name, structuredClone(tool)]));
  if (bundleTools.size !== options.bundle.tools.length) throw new Error("duplicate bundled tool name");
  for (const name of ["list_connectors", "research_domain", "enrich_lead"]) {
    if (!bundleTools.has(name)) throw new Error(`missing bundled tool: ${name}`);
  }
  const validator = new AjvJsonSchemaValidator();
  const validators = new Map([...bundleTools.values(), readTool].map((tool) => [tool.name, validator.getValidator(tool.inputSchema)]));
  const events: HostEvent[] = [];
  let invocations = 0;
  let calls = 0;
  let reservedCalls = 0;
  let bytes = 0;
  const usage = { inputTokens: 0, outputTokens: 0 };
  const record = (invocation: number, role: Role, kind: string, data: Record<string, unknown>) => {
    events.push({ sequence: events.length + 1, invocation, role, kind, data: structuredClone(data) });
  };
  const account = (value: unknown) => {
    const text = JSON.stringify(value);
    bytes += Buffer.byteLength(text);
    if (bytes > limits.maxBytes) throw new Error("agent byte budget exhausted");
    return text;
  };
  return {
    snapshot: () => structuredClone({ events, invocations, calls, bytes, usage }),
    async dispatch(input: { subagent_type: string; prompt: string }, parentSignal?: AbortSignal, correlationCallId?: number): Promise<string> {
      const { subagent_type: role, prompt } = z.object({
        subagent_type: z.enum(roles), prompt: z.string().min(1).max(65536),
      }).strict().parse(input);
      if (invocations >= limits.maxInvocations) throw new Error("agent invocation budget exhausted");
      const invocation = ++invocations;
      const definition = definitions.get(role);
      assert(definition, "missing role definition");
      const signal = AbortSignal.any([AbortSignal.timeout(limits.timeoutMs), ...(parentSignal ? [parentSignal] : [])]);
      const available = roleTools[role].map((name) => {
        const tool = name === "Read" ? readTool : bundleTools.get(name);
        assert(tool, "missing role tool");
        return tool;
      });
      const messages: AgentMessage[] = [{ role: "system", content: definition.body }, { role: "user", content: prompt }];
      const ids = new Set<string>();
      record(invocation, role, "started", { correlationCallId, prompt, definitionSha256: definition.sha256, provider: options.model.provider, model: options.model.model, tools: available.map((tool) => tool.name) });
      try {
        account(messages);
        for (let turnIndex = 0; turnIndex < limits.maxTurns; turnIndex++) {
          signal.throwIfAborted();
          const response = await options.model.complete({ messages: structuredClone(messages), tools: structuredClone(available), signal });
          signal.throwIfAborted();
          const turn = turnSchema.parse(response);
          usage.inputTokens += turn.usage.inputTokens;
          usage.outputTokens += turn.usage.outputTokens;
          account(turn);
          record(invocation, role, "model", { turn: turnIndex, ...turn });
          // Validate the ENTIRE turn before invoking any tool from it.
          for (const call of turn.calls) {
            if (ids.has(call.id)) throw new Error("duplicate agent tool call id");
            ids.add(call.id);
            if (!roleTools[role].includes(call.name)) throw new Error("agent called a tool outside its role");
            if (!validators.get(call.name)?.(call.arguments).valid) throw new Error("agent tool arguments violate bundled schema");
          }
          if (reservedCalls + turn.calls.length > limits.maxCalls) throw new Error("agent tool budget exhausted");
          reservedCalls += turn.calls.length;
          if (!turn.calls.length) {
            if (!turn.text.trim()) throw new Error("empty agent completion");
            record(invocation, role, "completed", { output: turn.text });
            return turn.text;
          }
          messages.push({ role: "assistant", content: turn.text, calls: turn.calls });
          for (const call of turn.calls) {
            signal.throwIfAborted();
            calls++;
            record(invocation, role, "tool_started", { ...call });
            const result: unknown = call.name === "Read"
              ? { text: contents.get(readArgs.parse(call.arguments).file_path) }
              : await options.bundle.call(call.name, structuredClone(call.arguments), signal);
            signal.throwIfAborted();
            const content = account(result);
            record(invocation, role, "tool_completed", { id: call.id, name: call.name, result });
            messages.push({ role: "tool", callId: call.id, name: call.name, content });
          }
        }
        throw new Error("agent turn budget exhausted");
      } catch (error) {
        // Raw provider error strings can contain credentials. Preserve outcome,
        // partial counts and prior evidence without copying those strings.
        record(invocation, role, "failed", { aborted: signal.aborted });
        throw error;
      }
    },
  };
}
