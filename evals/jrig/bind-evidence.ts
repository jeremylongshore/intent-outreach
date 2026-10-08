import { reasoningEffortSchema, type ReasoningEffort } from "./agent-model.js";
/** Join private J-Rig receipts to observed host sessions. Correlation, not attestation. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { auditScenario } from "./audit-scenario.js";

const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const object = z.record(z.string(), z.unknown());
const artifactSchema = z.object({ filename: z.string(), type: z.literal("text"), content: z.string(), size_bytes: z.number().int().nonnegative() });
const contextSchema = z.object({ test_case_id: z.string(), session_id: z.uuid(), sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/), size_bytes: z.number().int().nonnegative() }).strict();
const receiptSchema = z.object({
  schema: z.literal("jrig-tool-execution/v1"), run_id: z.number().int().positive(),
  phase: z.enum(["skill", "baseline"]), configuration_sha256: z.string(),
  judge_contexts: z.array(contextSchema).optional(),
  execution_parameters: z.object({ reasoning_effort: reasoningEffortSchema }).strict().optional(),
  cases: z.array(z.object({ test_case_id: z.string(), status: z.enum(["completed", "failed"]),
    output: z.object({ text: z.string(), tool_calls: z.number().int().nonnegative(), artifacts: z.array(artifactSchema) }),
  })).length(1),
});
const eventSchema = z.object({ sequence: z.number().int().positive(), kind: z.string(), data: object });
const toolSchema = z.array(z.object({ tool: z.string(), status: z.enum(["started", "completed"]), result_bytes: z.number().int().nonnegative().optional() }));
const usageSchema = z.object({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative() });

async function privateFile(path: string, root: string, limit: number) {
  assert(isAbsolute(path) && resolve(path) === path, "evidence path must be absolute and normalized");
  const local = relative(root, path);
  assert(local && local !== ".." && !local.startsWith(".." + sep) && !isAbsolute(local), "evidence path escapes run directory");
  assert.equal(await realpath(path), path, "evidence path contains a symlink");
  const info = await lstat(path);
  assert(info.isFile() && (info.mode & 0o077) === 0 && info.size <= limit, "invalid private evidence file");
  const bytes = await readFile(path);
  assert(bytes.length <= limit, "evidence file exceeds limit");
  return bytes;
}

/** Requires a fresh single-case database and a directory containing only its host homes. */
export async function bindScenarioEvidence(input: {
  dbPath: string; hostsDir: string; mcpConfigPath: string; caseId: string;
  provider: string; model: string; serverName: string; baseline: boolean; executionReasoningEffort?: ReasoningEffort;
}) {
  const root = dirname(input.dbPath);
  await privateFile(input.dbPath, root, 67108864);
  const configBytes = await privateFile(input.mcpConfigPath, root, 65536);
  const configSha = hash(configBytes);
  const config = z.object({ judgeObservations: z.boolean().optional(), limits: z.object({ maxTotalBytes: z.number().int().positive().max(4194304).optional() }).optional() }).parse(JSON.parse(configBytes.toString()));
  assert.equal(await realpath(input.hostsDir), input.hostsDir, "host directory contains a symlink");
  const hostInfo = await lstat(input.hostsDir);
  assert(hostInfo.isDirectory() && (hostInfo.mode & 0o077) === 0, "host directory must be private");
  const homes = await readdir(input.hostsDir, { withFileTypes: true });
  const traces = await Promise.all(homes.map(async (entry) => {
    assert(entry.isDirectory() && !entry.isSymbolicLink(), "unexpected host evidence entry");
    const home = join(input.hostsDir, entry.name);
    const bytes = await privateFile(join(home, "host-events.jsonl"), input.hostsDir, 8388608);
    const events = bytes.toString().trim().split("\n").map((line) => eventSchema.parse(JSON.parse(line)));
    const start = events[0];
    assert(start?.kind === "started" && start.data.caseId === input.caseId && start.data.home === home, "wrong host case or home");
    assert(start.data.provider === input.provider && start.data.model === input.model, "host model identity mismatch");
    assert.equal(start.data.executionReasoningEffort, input.executionReasoningEffort, "host reasoning effort mismatch");
    const sessionId = z.uuid().parse(start.data.executionSessionId);
    return { home, events, sessionId, traceSha256: hash(bytes) };
  }));
  assert.equal(traces.length, input.baseline ? 2 : 1, "unexpected host session count");
  assert.equal(new Set(traces.map((trace) => trace.sessionId)).size, traces.length, "duplicate host session identity");
  const database = new DatabaseSync(input.dbPath, { readOnly: true });
  let records: { run_id: number; relative_path: string; sha256: string; size_bytes: number }[];
  try {
    records = database.prepare("SELECT run_id, relative_path, sha256, size_bytes FROM artifacts WHERE artifact_type = 'tool-execution'").all() as typeof records;
  } finally { database.close(); }
  assert.equal(records.length, input.baseline ? 2 : 1, "unexpected execution receipt count");
  assert.equal(new Set(records.map((record) => record.run_id)).size, 1, "multiple runs in case database");
  const phases = new Set<string>();
  const sessions = new Set<string>();
  const bindings = [];
  for (const record of records) {
    const bytes = await privateFile(record.relative_path, root, 8388608);
    assert.equal(record.sha256, "sha256:" + hash(bytes), "execution receipt digest mismatch");
    assert.equal(record.size_bytes, bytes.length, "execution receipt size mismatch");
    const receipt = receiptSchema.parse(JSON.parse(bytes.toString()));
    assert.equal(receipt.run_id, record.run_id, "execution run identity mismatch");
    assert.deepEqual(receipt.execution_parameters, input.executionReasoningEffort !== undefined ? { reasoning_effort: input.executionReasoningEffort } : undefined, "execution reasoning effort mismatch");
    assert.equal(receipt.configuration_sha256, configSha, "MCP configuration changed");
    assert(!phases.has(receipt.phase), "duplicate execution phase");
    phases.add(receipt.phase);
    const observed = receipt.cases[0];
    assert(observed);
    assert.equal(observed.test_case_id, input.caseId, "execution case mismatch");
    const artifact = (name: string) => {
      const matches = observed.output.artifacts.filter((item) => item.filename === name);
      assert.equal(matches.length, 1, "missing or duplicate execution artifact");
      const item = matches[0];
      assert(item);
      assert.equal(item.size_bytes, Buffer.byteLength(item.content), "execution artifact size mismatch");
      return JSON.parse(item.content) as unknown;
    };
    const identity = z.object({ schema: z.literal("jrig-tool-session/v1"), session_id: z.uuid() }).parse(artifact("tool-session.json"));
    assert(!sessions.has(identity.session_id), "execution session reused across phases");
    sessions.add(identity.session_id);
    const trace = traces.find((entry) => entry.sessionId === identity.session_id);
    assert(trace, "no host trace for execution session");
    const calls = trace.events.filter((event) => event.kind === "call_started");
    const tools = toolSchema.parse(artifact("tool-events.json"));
    assert.equal(observed.output.tool_calls, tools.length, "execution call count mismatch");
    assert.equal(calls.length, tools.length, "host call count mismatch");
    for (const [index, tool] of tools.entries()) {
      const call = calls[index];
      assert(call);
      assert.equal(tool.tool, input.serverName + "__" + z.string().parse(call.data.name), "host tool order mismatch");
      if (tool.status === "completed") {
        // J-Rig completion means an MCP response arrived, including isError.
        // The independent audit still marks a host failure incomplete.
        const completed: z.infer<typeof eventSchema>[] = trace.events.filter((event) => ["call_completed", "call_failed"].includes(event.kind) && event.data.callId === call.data.callId);
        assert.equal(completed.length, 1, "completed tool lacks host receipt");
        const ended = completed[0];
        assert(ended);
        assert.equal(tool.result_bytes, Buffer.byteLength(JSON.stringify(ended.data.result)), "host tool result size mismatch");
      }
    }
    let judgeContext: z.infer<typeof contextSchema> | null = null;
    const observationRecords = observed.output.artifacts.filter((item) => item.filename === "tool-observations.json");
    if (config.judgeObservations) {
      const context = z.object({ schema: z.literal("jrig-tool-observations/v1"), session_id: z.literal(identity.session_id),
        redaction: z.literal("known-environment-credentials-and-credential-fields/v1"), calls: z.array(z.object({
          id: z.string().min(1), tool: z.string(), arguments: object, status: z.enum(["started", "completed"]), result: z.string().optional(),
        }).strict()).max(64),
      }).strict().parse(artifact("tool-observations.json"));
      const observation = observationRecords[0]; assert(observation);
      assert(observation.size_bytes <= (config.limits?.maxTotalBytes ?? 1048576), "observation context exceeds bound");
      assert.equal(context.calls.length, tools.length, "observation call count mismatch");
      assert.equal(new Set(context.calls.map((call) => call.id)).size, context.calls.length, "duplicate observation call identity");
      for (const [index, call] of context.calls.entries()) {
        assert.equal(call.tool, tools[index]?.tool, "observation tool order mismatch");
        assert.equal(call.status, tools[index]?.status, "observation tool status mismatch");
        assert.equal(typeof call.result === "string", call.status === "completed", "observation response missing or uncompleted");
      }
      if (observed.status === "completed") {
        assert(context.calls.every((call) => call.status === "completed"), "completed context contains partial call");
        judgeContext = { test_case_id: input.caseId, session_id: identity.session_id, sha256: "sha256:" + hash(Buffer.from(observation.content)), size_bytes: observation.size_bytes };
      }
      assert.deepEqual(receipt.judge_contexts, judgeContext ? [judgeContext] : [], "private judge context binding mismatch");
    } else {
      assert.equal(observationRecords.length, 0, "observations retained without opt-in");
      assert.equal(receipt.judge_contexts, undefined, "judge contexts retained without opt-in");
    }
    const audit = await auditScenario(trace.home);
    assert.equal(audit.traceSha256, trace.traceSha256, "host trace changed during audit");
    const terminal = trace.events.at(-1);
    const nestedUsage = terminal?.kind === "closed" ? usageSchema.parse(terminal.data.agentUsage) : null;
    bindings.push({ phase: receipt.phase, sessionId: identity.session_id, home: trace.home,
      receiptSha256: record.sha256, traceSha256: trace.traceSha256, status: observed.status,
      output: observed.output.text, nestedUsage, audit, judgeContext,
      ...(receipt.execution_parameters ? { executionParameters: receipt.execution_parameters } : {}),
      passed: observed.status === "completed" && tools.every((tool) => tool.status === "completed") && audit.passed,
    });
  }
  assert(phases.has("skill") && (!input.baseline || phases.has("baseline")), "missing required execution phase");
  return { scope: "correlated_structural_evidence_only", behavioralVerdict: null, tier3bPassed: false, bindings };
}

/** Verify actual routing observations independently of J-Rig's coverage label. */
export async function bindTriggerEvidence(input: {
  dbPath: string; caseId: string; expected: "should_trigger" | "should_not_trigger";
  target: string; prompt: string; siblings: string[]; summary: unknown; bundleSummary: unknown;
}) {
  const root = dirname(input.dbPath);
  await privateFile(input.dbPath, root, 67108864);
  const database = new DatabaseSync(input.dbPath, { readOnly: true });
  let records: { run_id: number; relative_path: string; sha256: string; size_bytes: number }[];
  let executionRuns: { run_id: number }[];
  try {
    records = database.prepare("SELECT run_id, relative_path, sha256, size_bytes FROM artifacts WHERE artifact_type = 'trigger-evidence'").all() as typeof records;
    executionRuns = database.prepare("SELECT DISTINCT run_id FROM artifacts WHERE artifact_type = 'tool-execution'").all() as typeof executionRuns;
  } finally { database.close(); }
  assert.equal(records.length, 1, "missing or duplicate trigger receipt");
  const record = records[0];
  assert(record);
  assert.deepEqual(executionRuns.map((entry) => entry.run_id), [record.run_id], "trigger/execution run mismatch");
  const bytes = await privateFile(record.relative_path, root, 8388608);
  assert.equal(record.size_bytes, bytes.length, "trigger receipt size mismatch");
  assert.equal(record.sha256, "sha256:" + hash(bytes), "trigger receipt digest mismatch");
  const resultSchema = z.object({ test_case_id: z.literal(input.caseId), expected: z.literal(input.expected),
    selected_skill: z.string().nullable(), outcome: z.enum(["correct_trigger", "correct_no_trigger", "false_positive", "false_negative", "sibling_confusion", "error"]),
    prompt: z.literal(input.prompt), reasoning: z.string(),
  }).passthrough();
  const receipt = z.object({ schema: z.literal("jrig-trigger-evidence/v1"), run_id: z.literal(record.run_id),
    status: z.literal("complete"), results: z.array(resultSchema).length(1), metrics: object,
  }).parse(JSON.parse(bytes.toString()));
  const result = receipt.results[0];
  assert(result);
  assert(result.selected_skill === null || [input.target, ...input.siblings].includes(result.selected_skill), "selected skill outside declared roster");
  const expectedOutcome = input.expected === "should_trigger"
    ? result.selected_skill === input.target ? "correct_trigger" : result.selected_skill === null ? "false_negative" : "sibling_confusion"
    : result.selected_skill === input.target ? "false_positive" : "correct_no_trigger";
  assert.equal(result.outcome, expectedOutcome, "trigger outcome classification mismatch");
  const tp = Number(result.outcome === "correct_trigger");
  const tn = Number(result.outcome === "correct_no_trigger");
  const fp = Number(result.outcome === "false_positive");
  const fn = Number(result.outcome === "false_negative");
  const metrics = { total_cases: 1, true_positives: tp, true_negatives: tn, false_positives: fp, false_negatives: fn,
    sibling_confusions: Number(result.outcome === "sibling_confusion"), errors: 0,
    precision: tp + fp ? tp / (tp + fp) : 1, recall: tp + fn ? tp / (tp + fn) : 1,
    false_positive_rate: fp + tn ? fp / (fp + tn) : 0, false_negative_rate: fn + tp ? fn / (fn + tp) : 0,
  };
  assert.deepEqual(receipt.metrics, metrics, "trigger metrics mismatch");
  const summary = { schema: receipt.schema, status: receipt.status, sha256: record.sha256, metrics,
    cases: [{ test_case_id: result.test_case_id, expected: result.expected, outcome: result.outcome, selected_skill: result.selected_skill }],
  };
  assert.deepEqual(input.summary, summary, "CLI trigger summary mismatch");
  assert.deepEqual(input.bundleSummary, summary, "bundle trigger summary mismatch");
  return { ...summary, passed: result.outcome === "correct_trigger" || result.outcome === "correct_no_trigger" };
}
