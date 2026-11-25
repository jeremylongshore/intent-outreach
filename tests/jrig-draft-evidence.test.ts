import { describe, expect, it } from "vitest";
import { draftedMessages } from "../evals/jrig/audit-scenario.js";

const draft = { contactKey: "riley@example.test", channel: "email", subject: "Workflow", body: "A grounded fixture.", cta: "Discuss?" };
const section = (heading = "messages", boundary = "declines", payload: unknown = [draft]) => `**${heading}**:\n\n\`\`\`json\n${JSON.stringify(payload)}\n\`\`\`\n\n**${boundary}**: []`;

describe("explicit drafter evidence sections", () => {
  it.each([['messages', 'declines'], ['messages[]', 'declines[]'], ['messages', 'declines[]'], ['messages[]', 'declines']])("accepts the unambiguous %s array with %s boundary", (heading, boundary) => {
    expect(draftedMessages(section(heading, boundary))).toEqual([draft]);
  });
  it("reads only final evidence after a closed leading reasoning block", () => {
    const decoy = section("messages", "declines", [{ ...draft, body: "Reasoning decoy" }]);
    expect(draftedMessages(`<think>\n${decoy}\n</think>\n${section()}`)).toEqual([draft]);
    expect(() => draftedMessages(`<think>\n${decoy}\n</think>\nNo final evidence.`)).toThrow();
    expect(() => draftedMessages(`<think>\n${decoy}`)).toThrow();
    expect(() => draftedMessages(`${section()}\n<think>decoy</think>`)).toThrow();
    expect(() => draftedMessages(`<think><think>decoy</think>\n${section()}`)).toThrow();
    expect(() => draftedMessages(`<think><think>decoy</think></think>\n${section()}`)).toThrow();
    expect(() => draftedMessages(`<think>decoy</think></think>\n${section()}`)).toThrow();
  });
  it.each([
    section() + "\n**messages[]**",
    section() + "\n**messages**:",
    section() + "\n```json\n{}\n```",
    "```json\n{}\n```\n" + section(),
    section().replace("**messages**:", "**messages**: unexplained prose"),
    section().replace("**messages**:", "Messages"),
    section().replace("\n**declines**", "\n```json\n{}\n```\n**declines**"),
    section().replace("**messages**:", "**Return value**\n**messages**:"),
    section("messages", "declines", [{ ...draft, body: null }]),
    section("messages", "declines", { messages: [draft] }),
  ])("refuses ambiguous or invalid final evidence", (output) => {
    expect(() => draftedMessages(output)).toThrow();
  });
  it("retains all message fields exactly for independent comparison", () => {
    for (const field of ["contactKey", "channel", "subject", "body", "cta"] as const) {
      const changed = { ...draft, [field]: "changed" };
      expect(draftedMessages(section("messages", "declines", [changed]))).toEqual([changed]);
    }
  });
});
