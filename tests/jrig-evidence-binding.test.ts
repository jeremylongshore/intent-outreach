import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { bindScenarioEvidence, bindTriggerEvidence } from "../evals/jrig/bind-evidence.js";

const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "jrig-binding-test-"));
  const dbPath = join(root, "jrig.db");
  const hostsDir = join(root, "hosts");
  const mcpConfigPath = join(root, "mcp.json");
  await mkdir(hostsDir, { mode: 0o700 });
  await writeFile(mcpConfigPath, "{}", { mode: 0o600 });
  const db = new DatabaseSync(dbPath);
  db.exec("CREATE TABLE artifacts (run_id INTEGER, artifact_type TEXT, relative_path TEXT, sha256 TEXT, size_bytes INTEGER)");
  await chmod(dbPath, 0o600);
  const sessions = [randomUUID(), randomUUID()];
  const artifacts = (id: string) => [
    { filename: "tool-events.json", type: "text", content: "[]", size_bytes: 2 },
    { filename: "tool-session.json", type: "text", content: JSON.stringify({ schema: "jrig-tool-session/v1", session_id: id }), size_bytes: 0 },
  ].map((item) => ({ ...item, size_bytes: Buffer.byteLength(item.content) }));
  const receipts = sessions.map((id, index) => ({ schema: "jrig-tool-execution/v1", run_id: 1,
    phase: index ? "baseline" : "skill", configuration_sha256: hash("{}"),
    cases: [{ test_case_id: "unrelated-weather", status: "completed", output: { text: "I cannot check current weather here.", tool_calls: 0, artifacts: artifacts(id) } }],
  }));
  const traces: { sequence: number; kind: string; data: Record<string, unknown> }[][] = sessions.map((id, index) => [
    { sequence: 1, kind: "started", data: { caseId: "unrelated-weather", home: join(hostsDir, String(index)),
      provider: "fixture", model: "fixture-model", executionSessionId: id, fixtureOnly: true, checkpoints: [], sha256: { resources: {} } } },
    { sequence: 2, kind: "closed", data: { bundleStopped: true, calls: 0, checkpointsUsed: 0, agentUsage: { inputTokens: 0, outputTokens: 0 } } },
  ]);
  const save = async () => {
    db.exec("DELETE FROM artifacts");
    for (const [index, receipt] of receipts.entries()) {
      const home = join(hostsDir, String(index));
      await mkdir(home, { recursive: true, mode: 0o700 });
      await writeFile(join(home, "host-events.jsonl"), traces[index]!.map((event) => JSON.stringify(event)).join("\n") + "\n", { mode: 0o600 });
      const path = join(root, `${index}.json`);
      const bytes = JSON.stringify(receipt);
      await writeFile(path, bytes, { mode: 0o600 });
      db.prepare("INSERT INTO artifacts VALUES (?, ?, ?, ?, ?)").run(1, "tool-execution", path, "sha256:" + hash(bytes), Buffer.byteLength(bytes));
    }
  };
  await save();
  return { root, db, receipts, traces, save, input: { dbPath, hostsDir, mcpConfigPath, caseId: "unrelated-weather", provider: "fixture", model: "fixture-model", serverName: "outreach", baseline: true },
    close: async () => { db.close(); await rm(root, { recursive: true, force: true }); },
  };
}

describe("private execution evidence binding", () => {
  it("joins skill and baseline by distinct identity and keeps structural scope explicit", async () => {
    const f = await fixture();
    try {
      const result = await bindScenarioEvidence(f.input);
      expect(result).toMatchObject({ behavioralVerdict: null, tier3bPassed: false });
      expect(result.bindings.map((entry) => [entry.phase, entry.passed])).toEqual([["skill", true], ["baseline", true]]);
      expect(new Set(result.bindings.map((entry) => entry.sessionId)).size).toBe(2);
      expect(result.bindings[0]!.nestedUsage).toEqual({ inputTokens: 0, outputTokens: 0 });
    } finally { await f.close(); }
  });
  for (const defect of ["digest", "missing-identity", "duplicate-host", "duplicate-phase", "wrong-model", "wrong-config", "unmatched-session", "unobserved-call"]) {
    it(`refuses ${defect} even when other case evidence looks complete`, async () => {
      const f = await fixture();
      try {
        const first = f.receipts[0]!;
        if (defect === "missing-identity") first.cases[0]!.output.artifacts.pop();
        if (defect === "duplicate-host") f.traces[1]![0]!.data.executionSessionId = f.traces[0]![0]!.data.executionSessionId;
        if (defect === "duplicate-phase") f.receipts[1]!.phase = "skill";
        if (defect === "wrong-model") f.traces[0]![0]!.data.model = "different-model";
        if (defect === "wrong-config") first.configuration_sha256 = hash("different config");
        if (defect === "unmatched-session") f.traces[0]![0]!.data.executionSessionId = randomUUID();
        if (defect === "unobserved-call") first.cases[0]!.output.tool_calls = 1;
        await f.save();
        if (defect === "digest") {
          const path = join(f.root, "0.json");
          await writeFile(path, (await readFile(path, "utf8")) + " ");
        }
        await expect(bindScenarioEvidence(f.input)).rejects.toThrow();
      } finally { await f.close(); }
    });
  }
  it("retains failed execution with a valid association without turning it into a pass", async () => {
    const f = await fixture();
    try {
      f.receipts[0]!.cases[0]!.status = "failed";
      await f.save();
      const result = await bindScenarioEvidence(f.input);
      expect(result.bindings[0]).toMatchObject({ status: "failed", passed: false, audit: { passed: true } });
    } finally { await f.close(); }
  });
  it("correlates an MCP error response as a host failure rather than losing the association", async () => {
    const f = await fixture();
    try {
      const result = { isError: true, content: [{ type: "text", text: '{"error":"scenario tool failed; inspect private trace"}' }] };
      f.traces[0]!.splice(1, 0,
        { sequence: 2, kind: "call_started", data: { callId: 1, name: "Agent", arguments: {} } },
        { sequence: 3, kind: "call_failed", data: { callId: 1, name: "Agent", result } });
      f.traces[0]![3]!.sequence = 4;
      f.traces[0]![3]!.data.calls = 1;
      const output = f.receipts[0]!.cases[0]!.output;
      output.tool_calls = 1;
      const events = JSON.stringify([{ tool: "outreach__Agent", status: "completed", result_bytes: Buffer.byteLength(JSON.stringify(result)) }]);
      output.artifacts[0]!.content = events;
      output.artifacts[0]!.size_bytes = Buffer.byteLength(events);
      await f.save();
      const bound = await bindScenarioEvidence(f.input);
      expect(bound.bindings[0]?.passed).toBe(false);
      expect(bound.bindings[0]?.audit.incomplete).toContain("host_call_failed");
      expect(bound.bindings[0]?.audit.incomplete).toContain("bundled_tool_error");
    } finally { await f.close(); }
  });
});


describe("private trigger evidence binding", () => {
  it.each(["correct", "incorrect", "digest", "metrics", "classification", "missing", "wrong-run", "bundle", "incomplete", "wrong-prompt", "unknown-skill"])("verifies actual routing and refuses corrupted evidence (%s)", async (defect) => {
    const f = await fixture();
    try {
      const incorrect = defect === "incorrect";
      const metrics = { total_cases: 1, true_positives: 0, true_negatives: Number(!incorrect), false_positives: Number(incorrect), false_negatives: 0,
        sibling_confusions: 0, errors: 0, precision: incorrect ? 0 : 1, recall: 1, false_positive_rate: Number(incorrect), false_negative_rate: 0 };
      const result = { test_case_id: "unrelated-weather", expected: "should_not_trigger", selected_skill: incorrect ? "intent-outreach" : null,
        outcome: incorrect ? "false_positive" : "correct_no_trigger", prompt: "private prompt", reasoning: "private rationale" };
      const receipt = { schema: "jrig-trigger-evidence/v1", run_id: 1, status: defect === "incomplete" ? "incomplete" : "complete", results: [result], metrics };
      const portable = { ...result } as Record<string, unknown>; delete portable.prompt; delete portable.reasoning;
      if (defect === "metrics") receipt.metrics.true_negatives = 0;
      if (defect === "classification") receipt.results[0]!.outcome = "false_negative";
      if (defect === "wrong-prompt") receipt.results[0]!.prompt = "different private case";
      if (defect === "unknown-skill") receipt.results[0]!.selected_skill = "not-in-roster";
      const bytes = JSON.stringify(receipt);
      const path = join(f.root, "trigger.json"); await writeFile(path, bytes, { mode: 0o600 });
      const digest = "sha256:" + hash(bytes);
      const summary = { schema: receipt.schema, status: receipt.status, sha256: digest, metrics: receipt.metrics, cases: [portable] };
      if (defect !== "missing") f.db.prepare("INSERT INTO artifacts VALUES (?, ?, ?, ?, ?)").run(defect === "wrong-run" ? 2 : 1, "trigger-evidence", path,
        defect === "digest" ? "sha256:" + "0".repeat(64) : digest, Buffer.byteLength(bytes));
      const input = { dbPath: f.input.dbPath, caseId: "unrelated-weather", expected: "should_not_trigger" as const, target: "intent-outreach", prompt: "private prompt", siblings: [], summary,
        bundleSummary: defect === "bundle" ? {} : summary };
      if (["correct", "incorrect"].includes(defect)) {
        expect(await bindTriggerEvidence(input)).toMatchObject({ passed: !incorrect, metrics, cases: [portable] });
      } else await expect(bindTriggerEvidence(input)).rejects.toThrow();
    } finally { await f.close(); }
  });
});
