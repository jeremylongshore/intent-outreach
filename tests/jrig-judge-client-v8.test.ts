import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { callEvidenceJudge, judgeModel } from "../evals/jrig/judge-client-v8.js";
const input = { criterionId: "grounded-no-fabrication", criterion: "Grounded", question: "Do not invent facts", prompt: "Wait for approval", output: "Waiting for approval.", referenceInstructions: "Wait", observations: JSON.stringify({ calls: [] }) };
afterEach(() => vi.unstubAllGlobals());
it("uses M3 default reasoning, separates reasoning, and normalizes only validated records", async () => {
  const answer = [
    { kind: "finding", outputId: "O0", assessment: "supported", evidenceIds: ["E0"], explanation: "Wait matches the request." },
    { kind: "completion", assessment: "satisfied", requirementIds: [], explanation: "Waiting needs no draft." },
    { kind: "verdict", verdict: "yes", confidence: 1, reasoning: "Honest wait." },
  ].map(row => JSON.stringify(row)).join("\n");
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ model: judgeModel,
    choices: [{ finish_reason: "stop", message: { content: answer, reasoning_content: "PRIVATE" } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 } })));
  vi.stubGlobal("fetch", fetch); const observe = vi.fn();
  const result = await callEvidenceJudge(input, { apiKey: "fixture-only", observe });
  const request = JSON.parse(fetch.mock.calls[0]![1].body);
  expect(request).toMatchObject({ model: "MiniMax-M3", reasoning_split: true, max_completion_tokens: 8192 });
  expect(request.reasoning_effort).toBeUndefined(); expect(request.tools).toBeUndefined();
  expect(JSON.parse(result.text).verdict).toBe("yes");
  expect(observe.mock.calls.at(-1)?.[0]).toMatchObject({ finalAnswer: answer,
    normalizedAnswerSha256: createHash("sha256").update(result.text).digest("hex") });
  expect(JSON.stringify(observe.mock.calls)).not.toContain("PRIVATE");
});
