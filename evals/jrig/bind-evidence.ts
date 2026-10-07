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
const receiptSchema = z.object({
  schema: z.literal("jrig-tool-execution/v1"), run_id: z.number().int().positive(),
  phase: z.enum(["skill", "baseline"]), configuration_sha256: z.string(),
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
  provider: string; model: string; serverName: string; baseline: boolean;
}) {
  const root = dirname(input.dbPath);
  await privateFile(input.dbPath, root, 67108864);
  const configSha = hash(await privateFile(input.mcpConfigPath, root, 65536));
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
        const completed: z.infer<typeof eventSchema>[] = trace.events.filter((event) => event.kind === "call_completed" && event.data.callId === call.data.callId);
        assert.equal(completed.length, 1, "completed tool lacks host receipt");
        const ended = completed[0];
        assert(ended);
        assert.equal(tool.result_bytes, Buffer.byteLength(JSON.stringify(ended.data.result)), "host tool result size mismatch");
      }
    }
    const audit = await auditScenario(trace.home);
    assert.equal(audit.traceSha256, trace.traceSha256, "host trace changed during audit");
    const terminal = trace.events.at(-1);
    const nestedUsage = terminal?.kind === "closed" ? usageSchema.parse(terminal.data.agentUsage) : null;
    bindings.push({ phase: receipt.phase, sessionId: identity.session_id, home: trace.home,
      receiptSha256: record.sha256, traceSha256: trace.traceSha256, status: observed.status,
      output: observed.output.text, nestedUsage, audit,
      passed: observed.status === "completed" && tools.every((tool) => tool.status === "completed") && audit.passed,
    });
  }
  assert(phases.has("skill") && (!input.baseline || phases.has("baseline")), "missing required execution phase");
  return { scope: "correlated_structural_evidence_only", behavioralVerdict: null, tier3bPassed: false, bindings };
}
