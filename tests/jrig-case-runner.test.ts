import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { caseRunConfig, inspectCaseVotes, selectCaseSpec, invokeCaseProcess } from "../evals/jrig/run-case.js";
import { scenarios } from "../evals/jrig/scenarios.js";

const original = () => ({ spec_version: "1.0", skill_name: "intent-outreach", description: "retain the reviewed description",
  criteria: [{ id: "nonempty", method: "deterministic", deterministic_check: "not_empty", blocker: true },
    { id: "grounded", method: "judge", judge_prompt: "Retain the full exact rubric", blocker: true, baseline_sensitive: true }],
  test_cases: Object.keys(scenarios).map((id) => ({ id, prompt: "Retain exact case prompt " + id, tier: "core", trigger_expectation: "should_trigger", criteria_ids: ["nonempty", "grounded"] })),
  models: ["configured-non-anthropic-model"], samples: 3, execution_temperature: 0, judge_temperature: 0, min_blocker_agreement: 1,
  tags: ["draft", "needs-review"],
});
describe("single-case spec and judgment boundaries", () => {
  it("preserves every criterion, case field, policy and review tag while selecting only case/model", () => {
    const input = original();
    const snapshot = structuredClone(input);
    const { spec } = selectCaseSpec(input, "rejected-draft", "explicit-model");
    expect(spec).toEqual({ ...snapshot, test_cases: [snapshot.test_cases.find((item) => item.id === "rejected-draft")], models: ["explicit-model"] });
    expect(input).toEqual(snapshot);
  });
  it("refuses omitted scenarios, unknown criteria and reduced sampling", () => {
    const missing = original(); missing.test_cases.pop();
    expect(() => selectCaseSpec(missing, "rejected-draft", "model")).toThrow();
    const unknown = original(); unknown.test_cases[0]!.criteria_ids = ["invented"];
    expect(() => selectCaseSpec(unknown, "scope-checkpoint", "model")).toThrow();
    expect(() => selectCaseSpec({ ...original(), samples: 1 }, "scope-checkpoint", "model")).toThrow();
  });
  it.each(["scope-checkpoint", "adversarial-injection"])("rejects missing or invalid routing for %s before selecting a case", (caseId) => {
    for (const trigger_expectation of [undefined, "not_applicable", "", null]) {
      const input = original();
      const cases = input.test_cases.map((item) => item.id === caseId ? { ...item, trigger_expectation } : item);
      expect(() => selectCaseSpec({ ...input, test_cases: cases }, "scope-checkpoint", "model")).toThrow();
    }
  });
  it("retains explicit negative routing expectations", () => {
    const input = original();
    input.test_cases.find((item) => item.id === "adversarial-injection")!.trigger_expectation = "should_not_trigger";
    const { spec } = selectCaseSpec(input, "adversarial-injection", "model");
    expect(spec.test_cases[0]?.trigger_expectation).toBe("should_not_trigger");
  });
  it("requires every applicable judgment and all three actual sample verdicts", () => {
    const { expected } = selectCaseSpec(original(), "scope-checkpoint", "model");
    const votes = [
      { criterion_id: "nonempty", test_case_id: "scope-checkpoint", method: "deterministic", verdict: "yes" },
      { criterion_id: "grounded", test_case_id: "scope-checkpoint", method: "judge", verdict: "yes", samples: 3, sample_verdicts: ["yes", "yes", "yes"] },
    ];
    expect(inspectCaseVotes(votes, expected, "scope-checkpoint")).toEqual(votes);
    expect(() => inspectCaseVotes(votes.slice(0, 1), expected, "scope-checkpoint")).toThrow();
    expect(() => inspectCaseVotes([votes[0], { ...votes[1], sample_verdicts: ["yes"] }], expected, "scope-checkpoint")).toThrow();
    expect(() => inspectCaseVotes([votes[0], { ...votes[1], test_case_id: "wrong-case" }], expected, "scope-checkpoint")).toThrow();
    expect(() => inspectCaseVotes([...votes, votes[1]], expected, "scope-checkpoint")).toThrow();
  });
  it("requires explicit identities and rejects credentials embedded in config", () => {
    expect(caseRunConfig.safeParse({}).success).toBe(false);
    const config = { jrigCli: "/tmp/cli.js", jrigSha256: "a".repeat(64), outputDir: "/tmp/new-case", caseId: "scope-checkpoint",
      provider: "groq", model: "execution", judgeModel: "judge", baseUrl: "https://example.test/v1", evidenceKind: "behavioral-evaluation" };
    expect(caseRunConfig.safeParse(config).success).toBe(true);
    expect(caseRunConfig.safeParse({ ...config, phaseTimeoutMs: 120000 }).success).toBe(true);
    for (const phaseTimeoutMs of [0, -1, 1.5, 120001]) expect(caseRunConfig.safeParse({ ...config, phaseTimeoutMs }).success).toBe(false);
    expect(caseRunConfig.safeParse({ ...config, executionReasoningEffort: "none" }).success).toBe(true);
    expect(caseRunConfig.safeParse({ ...config, executionReasoningEffort: "unreviewed" }).success).toBe(false);
    expect(caseRunConfig.safeParse({ ...config, apiKey: "not-in-config" }).success).toBe(false);
    expect(caseRunConfig.safeParse({ ...config, provider: "stub" }).success).toBe(false);
  });
});

describe("owned case-process cancellation", () => {
  it("does not spawn when setup was already cancelled", async () => {
    const directory = await mkdtemp(join(tmpdir(), "io-case-preabort-"));
    try {
      const controller = new AbortController(); controller.abort();
      const result = await invokeCaseProcess("/does-not-exist.mjs", [], { PATH: process.env.PATH }, directory, controller.signal);
      expect(result).toMatchObject({ pid: undefined, cancelled: true, timedOut: false });
      expect((await readFile(join(directory, "jrig.stdout.json"))).length).toBe(0);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it("kills the owned root and nested process group after cancellation even when SIGTERM is ignored", async () => {
    const directory = await mkdtemp(join(tmpdir(), "io-case-abort-"));
    let controller: AbortController | undefined;
    try {
      const fixture = join(directory, "fixture.mjs");
      await writeFile(fixture, `import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
process.on('SIGTERM', () => {});
const nested = spawn(process.execPath, ['--input-type=module', '-e', "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], { stdio: 'ignore' });
await writeFile(process.argv[2], JSON.stringify({ root: process.pid, nested: nested.pid }));
setInterval(()=>{},1000);
`);
      controller = new AbortController();
      const job = invokeCaseProcess(fixture, [join(directory, "pids.json")], { PATH: process.env.PATH }, directory, controller.signal);
      let pids: { root: number; nested: number } | undefined;
      for (let n = 0; n < 100 && !pids; n++) {
        try { pids = JSON.parse(await readFile(join(directory, "pids.json"), "utf8")); } catch { await new Promise((done) => setTimeout(done, 20)); }
      }
      expect(pids).toBeDefined();
      controller.abort();
      const result = await job;
      expect(result).toMatchObject({ cancelled: true, timedOut: false, signal: "SIGKILL" });
      expect(() => process.kill(pids!.root, 0)).toThrow();
      // An adopted child can briefly remain a zombie; it must never be running.
      let state = "gone";
      try { state = (await readFile(`/proc/${pids!.nested}/stat`, "utf8")).split(") ")[1]!.charAt(0); } catch { /* Reaped. */ }
      expect(["gone", "Z"]).toContain(state);
    } finally { controller?.abort(); await rm(directory, { recursive: true, force: true }); }
  }, 10000);
});
