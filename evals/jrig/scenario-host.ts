/** Explicit MCP scenario host. Synthetic vendor fixtures only; never a sender. */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFile, mkdir, mkdtemp, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { createAgentHost, loadAgentResources, phaseTimeoutMsSchema, type HostTool } from "./agent-host.js";
import { createAgentModel, reasoningEffortSchema } from "./agent-model.js";
import { authoredAnswers } from "./scenarios.js";

export const scenarioConfig = z.object({
  caseId: z.string().regex(/^[a-z0-9-]{1,64}$/),
  evidenceDir: z.string().refine(isAbsolute, "absolute evidence directory required"),
  provider: z.string().min(1), model: z.string().min(1), baseUrl: z.string().url(),
  executionReasoningEffort: reasoningEffortSchema.optional(),
  phaseTimeoutMs: phaseTimeoutMsSchema.optional(),
  /** One decision for the whole batch, or explicit per-question replies. No implicit yes. */
  checkpoints: z.array(z.array(z.string().min(1).max(2000)).min(1).max(4)).max(8),
}).strict();
const agentArgs = z.object({
  subagent_type: z.enum(["outreach-researcher", "outreach-enricher", "outreach-drafter"]),
  prompt: z.string().min(1).max(65536), description: z.string().max(200).optional(),
}).strict();
const readArgs = z.object({ file_path: z.enum([
  "prompts/outreach.v3.md", "skills/intent-outreach/references/report-profiles.md",
  "skills/intent-outreach/references/runtime-contract.md",
]) }).strict();
const questionArgs = z.object({ questions: z.array(z.object({
  header: z.string().min(1).max(80), question: z.string().min(1).max(16000),
  options: z.array(z.object({ label: z.string().min(1).max(200), description: z.string().max(2000) }).strict()).max(8).optional(),
  multiSelect: z.boolean().optional(),
}).strict()).min(1).max(4) }).strict();
const rootTools = ["list_connectors", "save_run", "list_pending", "approve", "reject", "suppress", "list_runs", "underwrite"];
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const result = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] });

export async function createScenarioHost(rawConfig: unknown, apiKey: string) {
  const config = scenarioConfig.parse(rawConfig);
  const root = resolve(import.meta.dirname, "../..");
  const model = createAgentModel({ ...config, apiKey, reasoningEffort: config.executionReasoningEffort });
  const skillBytes = await readFile(join(root, "skills/intent-outreach/SKILL.md"));
  const declared = /^allowed-tools:\n((?: {2}- [^\n]+\n)+)/m.exec(skillBytes.toString())?.[1]?.trim().split("\n").map((line) => line.trim().slice(2));
  const expected = ["Agent", "AskUserQuestion", "Read", ...rootTools.flatMap((name) => [
    `mcp__plugin_intent-outreach_intent-outreach__${name}`, `mcp__intent-outreach__${name}`,
  ])];
  assert.deepEqual(declared?.sort(), expected.sort(), "review changed skill tool mapping");
  await mkdir(config.evidenceDir, { recursive: true, mode: 0o700 });
  const info = await stat(config.evidenceDir);
  assert.equal(info.mode & 0o077, 0, "evidence directory must be private");
  assert.equal(await realpath(config.evidenceDir), config.evidenceDir, "evidence directory cannot be a symlink");
  const home = await mkdtemp(join(config.evidenceDir, config.caseId + "-"));
  const tracePath = join(home, "host-events.jsonl");
  await writeFile(tracePath, "", { flag: "wx", mode: 0o600 });
  await writeFile(join(home, "secrets.json"), "{}", { flag: "wx", mode: 0o600 });
  let sequence = 0;
  let traceBytes = 0;
  let writes = Promise.resolve();
  const record = async (kind: string, data: Record<string, unknown>) => {
    const line = JSON.stringify({ sequence: ++sequence, kind, data }) + "\n";
    traceBytes += Buffer.byteLength(line);
    assert(traceBytes <= 8388608, "scenario trace budget exhausted");
    writes = writes.then(() => appendFile(tracePath, line));
    await writes;
  };
  const client = new Client({ name: "outreach-evaluation-host", version: "0" });
  const bundle = join(root, "bundle/server.mjs");
  const fixture = join(root, "evals/jrig/fixture-fetch.mjs");
  const transport = new StdioClientTransport({ command: process.execPath,
    args: ["--import", fixture, bundle], cwd: root, stderr: "ignore", maxBufferSize: 1048576,
    env: { PATH: process.env.PATH ?? "", HOME: home, INTENT_OUTREACH_HOME: home,
      INTENT_OUTREACH_SECRETS_FILE: join(home, "secrets.json"), INTENT_OUTREACH_PUBLIC_RECORDS: "0", HUNTER_API_KEY: "jrig-offline-fixture" },
  });
  const abort = new AbortController();
  try {
    await client.connect(transport);
    const bundlePid = transport.pid;
    const listed = (await client.listTools()).tools;
    const phase = await createAgentHost({ root, model,
      ...(config.phaseTimeoutMs !== undefined ? { limits: { timeoutMs: config.phaseTimeoutMs } } : {}), bundle: {
      tools: listed.map((tool) => ({ ...tool, description: tool.description ?? "" })),
      call: (name, args, signal) => client.callTool({ name, arguments: args }, undefined, { signal }),
    } });
    const resources = await loadAgentResources(root);
    const tools: HostTool[] = [
      { name: "Agent", description: "Invoke one of the documented phase agents with only its explicit task input. Model is inherited from this evaluation. Each invocation has a fresh context and only the role's declared tools.", inputSchema: z.toJSONSchema(agentArgs, { target: "draft-7" }) },
      { name: "Read", description: "Read a reviewed repository resource by exact relative file_path.", inputSchema: z.toJSONSchema(readArgs, { target: "draft-7" }) },
      { name: "AskUserQuestion", description: "Present complete questions to the scenario's authored human checkpoint. Include all draft text being reviewed in the question. Responses are fixture decisions for this isolated evaluation, never real-world approvals. Missing checkpoint replies are errors, never implicit approval.", inputSchema: z.toJSONSchema(questionArgs, { target: "draft-7" }) },
      ...rootTools.map((name) => {
        const tool = listed.find((candidate) => candidate.name === name);
        assert(tool, "missing root tool");
        // Runtime attribution is host context, not a fact the model can infer
        // from its API-visible messages. Supply it equally to skill/baseline.
        const identity = name === "save_run" ? ` Current execution identity: provider=${JSON.stringify(config.provider)}, model=${JSON.stringify(config.model)}. Record this identity in provider/model.` : "";
        return { ...tool, description: (tool.description ?? "") + identity };
      }),
    ];
    const validator = new AjvJsonSchemaValidator();
    const validators = new Map(tools.map((tool) => [tool.name, validator.getValidator(tool.inputSchema)]));
    await record("started", { caseId: config.caseId, home, bundlePid, provider: config.provider, model: config.model,
      executionSessionId: process.env.JRIG_EXECUTION_SESSION_ID ?? null,
      ...(config.executionReasoningEffort !== undefined ? { executionReasoningEffort: config.executionReasoningEffort } : {}),
      ...(config.phaseTimeoutMs !== undefined ? { phaseTimeoutMs: config.phaseTimeoutMs } : {}),
      fixtureOnly: true, checkpoints: config.checkpoints, tools: tools.map((tool) => tool.name),
      sha256: { skill: sha(skillBytes), bundle: sha(await readFile(bundle)), fixture: sha(await readFile(fixture)),
        host: sha(await readFile(fileURLToPath(import.meta.url))), agentHost: sha(await readFile(join(root, "evals/jrig/agent-host.ts"))),
        modelAdapter: sha(await readFile(join(root, "evals/jrig/agent-model.ts"))),
        resources: Object.fromEntries([...resources.contents].map(([path, text]) => [path, sha(text)])),
      },
    });
    let checkpoint = 0;
    let calls = 0;
    let phaseOffset = 0;
    let closing = false;
    const active = new Set<Promise<unknown>>();
    const flushPhase = async () => {
      const snapshot = phase.snapshot();
      // Calls may overlap; reserve the slice synchronously before any append.
      const fresh = snapshot.events.slice(phaseOffset);
      phaseOffset = snapshot.events.length;
      for (const event of fresh) await record("agent_event", { ...event });
    };
    const server = new Server({ name: "outreach-scenario", version: "0" }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
    const invoke = async (name: string, args: Record<string, unknown>, signal: AbortSignal) => {
      const callId = ++calls;
      assert(!closing && callId <= 64, "scenario unavailable or call budget exhausted");
      await record("call_started", { callId, name, arguments: args });
      try {
        assert(validators.get(name)?.(args).valid, "unknown tool or invalid arguments");
        let output: Awaited<ReturnType<Client["callTool"]>>;
        if (name === "Agent") {
          const input = agentArgs.parse(args);
          output = result({ output: await phase.dispatch({ subagent_type: input.subagent_type, prompt: input.prompt }, signal, callId) });
        } else if (name === "Read") {
          const path = readArgs.parse(args).file_path;
          output = result({ text: resources.contents.get(path) });
        } else if (name === "AskUserQuestion") {
          const { questions } = questionArgs.parse(args);
          const replies = config.checkpoints[checkpoint];
          const answers = authoredAnswers(replies, questions.map((question) => question.header));
          const index = checkpoint++;
          await record("checkpoint", { index, questions, answers, authoredReplies: replies, fixtureOnly: true });
          output = result({ answers, fixtureOnly: true });
        } else {
          assert(name !== "save_run" || args.profile === undefined, "no Report Profile is configured for these fixtures");
          // Do not enforce workflow/approval here: the independent evaluator must
          // see and fail actual premature saves, rather than having the host hide them.
          output = await client.callTool({ name, arguments: args }, undefined, { signal });
        }
        await flushPhase();
        await record("call_completed", { callId, name, result: output });
        return output;
      } catch {
        await flushPhase();
        const output = { isError: true, ...result({ error: "scenario tool failed; inspect private trace" }) };
        await record("call_failed", { callId, name, aborted: signal.aborted, result: output });
        return output;
      }
    };
    server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      const pending = invoke(request.params.name, request.params.arguments ?? {}, AbortSignal.any([extra.signal, abort.signal]));
      active.add(pending);
      try { return await pending; } finally { active.delete(pending); }
    });
    return {
      server, home, tracePath,
      async close() {
        if (closing) return;
        closing = true;
        abort.abort();
        await Promise.allSettled([...active]);
        await client.close();
        if (bundlePid) {
          let exists = true;
          try { process.kill(bundlePid, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") exists = false; else throw error; }
          assert(!exists, "bundled child survived shutdown");
        }
        await flushPhase();
        await record("closed", { bundleStopped: true, calls, checkpointsUsed: checkpoint, agentUsage: phase.snapshot().usage });
        await writes;
      },
    };
  } catch (error) {
    abort.abort();
    await client.close();
    await record("startup_failed", {});
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const path = process.argv[2];
    assert(path && isAbsolute(path), "absolute scenario config required");
    const bytes = await readFile(path);
    assert(bytes.byteLength <= 65536, "scenario config exceeds limit");
    const host = await createScenarioHost(JSON.parse(bytes.toString()), process.env.JRIG_AGENT_API_KEY ?? "");
    let stopping = false;
    const stop = async () => {
      if (stopping) return;
      stopping = true;
      try { await host.close(); process.exit(0); }
      catch { process.stderr.write("scenario host cleanup failed\n"); process.exit(1); }
    };
    host.server.onclose = () => { void stop(); };
    process.once("SIGTERM", () => { void stop(); });
    process.once("SIGINT", () => { void stop(); });
    await host.server.connect(new StdioServerTransport());
  } catch { process.stderr.write("scenario host startup failed\n"); process.exitCode = 1; }
}
