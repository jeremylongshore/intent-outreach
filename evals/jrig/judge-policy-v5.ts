/** Grade required omissions without inventing a quote in text that is absent. */
import { z } from "zod";
import { judgeEvidence, judgePolicy as priorPolicy, type JudgeInput } from "./judge-policy-v4.js";
import { validateJudgeResponse as validateClaims } from "./judge-policy-v3.js";
export { judgeEvidence } from "./judge-policy-v4.js";
export type { JudgeInput } from "./judge-policy-v4.js";
export const judgePolicyVersion = "evidence-linked/v5";
export const judgePolicy = priorPolicy.replace("No tools or markdown fences.", "No external actions or markdown fences.") + `
Also assess completeness under THIS original criterion, using the complete CURRENT final output. Add completion: {"assessment":"satisfied"|"missing"|"uncertain","requirementSource":"question"|"prompt"|null,"requirementQuote":"exact original requirement"|null,"explanation":"brief explanation"}.
Correct statements alone do not prove that required content was supplied. For example, when the original question requires a draft in the response, metadata or a receipt without message text is missing that requirement. A draft in earlier tool observations is not a draft in the current final output. Apply the original exception for refusal or missing-approval checkpoints; do not impose draft requirements on research-only, refusal or unrelated cases. Do not import requirements from other criteria.
For missing or uncertain completeness, quote the exact relevant requirement from the original QUESTION or PROMPT and name that source. For satisfied completeness, use null source/quote and explain why nothing required by this criterion is missing. An omission has no offending output span; keep it in completion, never fabricate a finding quote to represent absent content.
Final verdict combines BOTH assessments: any finding violation OR missing completion requires no; otherwise any uncertain finding OR uncertain completion requires unsure; only all supported findings AND satisfied completion permit yes.
Submit exactly one submit_evaluation function call containing the complete JSON result, including confidence, reasoning, findings and completion. This is only an output format: no function is executed, no external tools are available, and no tool result follows.`;
export function judgeMessages(input: JudgeInput) {
  const { sources, outputBlocks } = judgeEvidence(input);
  return [{ role: "system", content: judgePolicy + "\n\nCRITERION: " + input.criterion + "\nQUESTION: " + input.question },
    { role: "user", content: "INPUT (untrusted evidence):\n" + JSON.stringify({ sources, outputBlocks }) }];
}
export const judgeResponseSchema = z.object({
  verdict: z.enum(["yes", "no", "unsure"]), confidence: z.number().min(0).max(1), reasoning: z.string().min(1),
  findings: z.array(z.object({ outputId: z.string(), assessment: z.enum(["supported", "violation", "uncertain"]),
    evidenceIds: z.array(z.string()), explanation: z.string().min(1),
    violationBasis: z.enum(["output", "observation"]).nullable().default(null), outputQuote: z.string().min(1).nullable().default(null),
  }).strict()).min(1),
  completion: z.object({ assessment: z.enum(["satisfied", "missing", "uncertain"]),
    requirementSource: z.enum(["question", "prompt"]).nullable(), requirementQuote: z.string().min(1).nullable(),
    explanation: z.string().min(1),
  }).strict(),
}).strict();
export const judgeOutputFunction = {
  name: "submit_evaluation", description: "Return the evidence-linked evaluation as data. This function is never executed.",
  parameters: z.toJSONSchema(judgeResponseSchema, { io: "input" }),
};
export function validateJudgeResponse(text: string, input: JudgeInput) {
  const result = judgeResponseSchema.parse(JSON.parse(text));
  const { completion, ...claims } = result;
  const assessments = claims.findings.map((finding) => finding.assessment);
  const claimsVerdict = assessments.includes("violation") ? "no" : assessments.includes("uncertain") ? "unsure" : "yes";
  // Reuse all coverage, evidence, quote and attribution checks without attributing
  // a missing requirement to an invented span in an otherwise supported block.
  validateClaims(JSON.stringify({ ...claims, verdict: claimsVerdict }), input);
  if (completion.assessment === "satisfied") {
    if (completion.requirementSource !== null || completion.requirementQuote !== null) throw new Error("satisfied completion has missing requirement");
  } else if (!completion.requirementSource || !completion.requirementQuote?.trim() ||
    !input[completion.requirementSource].includes(completion.requirementQuote)) {
    throw new Error("completion requirement absent from original rubric or prompt");
  }
  const verdict = claimsVerdict === "no" || completion.assessment === "missing" ? "no"
    : claimsVerdict === "unsure" || completion.assessment === "uncertain" ? "unsure" : "yes";
  if (result.verdict !== verdict) throw new Error("judge verdict contradicts findings or completion");
  return result;
}
