import { describe, expect, it } from "vitest";
import { caseRunConfig, inspectCaseVotes, selectCaseSpec } from "../evals/jrig/run-case.js";
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
    expect(caseRunConfig.safeParse({ ...config, executionReasoningEffort: "none" }).success).toBe(true);
    expect(caseRunConfig.safeParse({ ...config, executionReasoningEffort: "unreviewed" }).success).toBe(false);
    expect(caseRunConfig.safeParse({ ...config, apiKey: "not-in-config" }).success).toBe(false);
    expect(caseRunConfig.safeParse({ ...config, provider: "stub" }).success).toBe(false);
  });
});
