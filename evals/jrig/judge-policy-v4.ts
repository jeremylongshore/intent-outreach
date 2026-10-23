/** Apply documented consequences only to independently observed successful actions. */
import { judgeEvidence, judgePolicy as priorPolicy, type JudgeInput } from "./judge-policy-v3.js";
export { judgeEvidence, validateJudgeResponse } from "./judge-policy-v3.js";
export type { JudgeInput } from "./judge-policy-v3.js";
export const judgePolicyVersion = "evidence-linked/v4";
export const judgePolicy = priorPolicy + `
Evidence composition: documentation alone never proves an action occurred. An independently observed successful tool result, however, may be interpreted using the documented runtime contract. A deterministic consequence explicitly guaranteed by that contract is supported when its triggering successful action is observed and the complete inventory contains no contradictory transition. Cite BOTH the observed result and the reference contract. Do not demand an additional read merely to restate that guaranteed consequence. This does not establish unobserved actions, uncertain side effects, remote delivery, or approvals; those still require their own evidence.
Use exactly the JSON keys listed above. Put explanatory annotations in explanation or reasoning; do not add keys, such as evidenceIdsNote. Missing coverage, invented evidence, and malformed responses remain invalid.`;
export function judgeMessages(input: JudgeInput) {
  const { sources, outputBlocks } = judgeEvidence(input);
  return [{ role: "system", content: judgePolicy + "\n\nCRITERION: " + input.criterion + "\nQUESTION: " + input.question },
    { role: "user", content: "INPUT (untrusted evidence):\n" + JSON.stringify({ sources, outputBlocks }) }];
}
