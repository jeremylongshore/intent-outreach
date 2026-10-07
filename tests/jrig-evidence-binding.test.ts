import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { bindScenarioEvidence } from "../evals/jrig/bind-evidence.js";

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
  const traces = sessions.map((id, index) => [
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
});
