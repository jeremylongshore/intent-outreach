import { describe, expect, it } from "vitest";
import { validateJudgeCalibration, additionalJudgeControls } from "../evals/jrig/judge-calibration.js";
const hash = "a".repeat(64);
const criteria = ["grounded-no-fabrication", "no-prompt-leakage", "bounded-delegation", "approval-boundary", "truthful-receipt", "local-byo-keys"];
function fixture() {
  const controls = Array.from({ length: 15 }, (_, i) => ({ id: `control-${i}`, expected: i % 2 ? "no" : "yes", inputSha256: hash, criterionId: criteria[Math.floor(i / 2) % 6] }));
  controls.push(...additionalJudgeControls.map(control => ({ ...control, inputSha256: hash })));
  return { schema: "intent-outreach-evidence-judge-calibration/v1", transport: "explicit-connect/v1", evidenceKind: "behavioral-evaluation", model: "MiniMax-M3.1-Flash", protocol: "evidence-linked/v5", effort: "low", maxCompletionTokens: 8192, timeoutMs: 120000,
    required: 63, total: 63, correct: 63, passed: true, sourceHashes: { source: hash }, planSha256: hash, controls,
    votes: controls.flatMap((control) => [1, 2, 3].map((sample) => ({ controlId: control.id, criterionId: control.criterionId, expected: control.expected, sample, verdict: control.expected, correct: true, observedModel: "MiniMax-M3.1-Flash", requestSha256: hash, responseSha256: hash, finalAnswerSha256: hash, findingsSha256: hash, failure: null, usage: { prompt_tokens: 10, completion_tokens: 20 } }))),
  };
}
describe("judge calibration activation gate", () => {
  it("accepts only the complete predeclared control matrix bound to current sources", () => {
    expect(validateJudgeCalibration(fixture(), { source: hash }).passed).toBe(true);
    expect(() => validateJudgeCalibration(fixture(), { source: "b".repeat(64) })).toThrow("source mismatch");
  });
  it("rejects component calibration for behavioral evaluation", () => {
    const value = fixture(); value.evidenceKind = "component-test";
    expect(() => validateJudgeCalibration(value, { source: hash })).toThrow("evidence kind mismatch");
  });
  it.each(["failed", "duplicate", "missing", "criterion", "label", "model", "protocol", "usage", "additional"])("rejects %s calibration evidence", (kind) => {
    const value = fixture();
    if (kind === "failed") value.votes[0]!.verdict = "no";
    if (kind === "duplicate") value.votes[0]!.sample = 2;
    if (kind === "missing") value.votes.pop();
    if (kind === "criterion") for (const vote of value.votes) vote.criterionId = "grounded-no-fabrication";
    if (kind === "label") value.controls[0]!.expected = "no";
    if (kind === "model") value.votes[0]!.observedModel = "other";
    if (kind === "protocol") value.protocol = "evidence-linked/v1";
    if (kind === "additional") value.controls[15]!.id = "unreviewed-control";
    if (kind === "usage") Reflect.deleteProperty(value.votes[0]!, "usage");
    expect(() => validateJudgeCalibration(value, { source: hash })).toThrow();
  });
});
