/** Independent structural evidence gate. Does not grade model quality or Tier 3B. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { EncryptedSqliteRunStore } from "../../pipeline_core/encrypted-store.js";
import { scenarios } from "./scenarios.js";

const object = z.record(z.string(), z.unknown());
const eventSchema = z.object({ sequence: z.number().int().positive(), kind: z.string(), data: object });
const callSchema = z.object({ callId: z.number().int().positive(), name: z.string(), arguments: object });
const phaseSchema = z.object({ invocation: z.number().int().positive(), kind: z.string(), role: z.string(), data: object });
const draftSchema = z.object({ contactKey: z.string(), channel: z.string(), subject: z.string().optional(), body: z.string(), cta: z.string() });
async function optional(path: string) {
  try { return await readFile(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}
function jsonOutput(value: unknown): unknown {
  const text = z.string().parse(value).trim().replace(/^```(?:json)?\s*\n/, "").replace(/\n```$/, "");
  return JSON.parse(text);
}
export async function auditScenario(home: string) {
  const bytes = await readFile(join(home, "host-events.jsonl"));
  const events = bytes.toString().trim().split("\n").map((line) => eventSchema.parse(JSON.parse(line)));
  const failures: string[] = [];
  const incomplete: string[] = [];
  const check = (condition: unknown, reason: string) => { if (!condition) failures.push(reason); };
  const start = events[0];
  const caseId = z.string().parse(start?.data.caseId);
  const policy = Object.hasOwn(scenarios, caseId) ? scenarios[caseId] : undefined;
  if (!policy) throw new Error("no reviewed scenario policy");
  check(start?.kind === "started" && start.data.fixtureOnly === true, "missing_fixture_start");
  check(events.every((event, i) => event.sequence === i + 1), "trace_sequence_invalid");
  check(JSON.stringify(start?.data.checkpoints) === JSON.stringify(policy.checkpoints), "authored_decisions_changed");
  if (events.at(-1)?.kind !== "closed" || events.at(-1)?.data.bundleStopped !== true) incomplete.push("missing_terminal_cleanup");
  if (events.some((event) => ["call_failed", "startup_failed"].includes(event.kind))) incomplete.push("host_call_failed");
  const calls = events.filter((event) => event.kind === "call_started").map((event) => ({ sequence: event.sequence, ...callSchema.parse(event.data) }));
  check(new Set(calls.map((call) => call.callId)).size === calls.length, "duplicate_call_id");
  if (events.at(-1)?.data.calls !== calls.length) incomplete.push("root_call_count_mismatch");
  for (const call of calls) {
    const ends = events.filter((event) => ["call_completed", "call_failed"].includes(event.kind) && event.data.callId === call.callId);
    if (ends.length !== 1 || (ends[0]?.sequence ?? 0) <= call.sequence) incomplete.push("missing_or_invalid_call_receipt");
    const output = ends[0]?.data.result;
    if (output && object.parse(output).isError === true) incomplete.push("bundled_tool_error");
  }
  const phase = events.filter((event) => event.kind === "agent_event").map((event) => phaseSchema.parse(event.data));
  if (phase.some((event) => event.kind === "failed")) incomplete.push("phase_agent_failed");
  const started = phase.filter((event) => event.kind === "started");
  for (const agent of started) {
    const rootCall = calls.find((call) => call.callId === agent.data.correlationCallId);
    check(rootCall?.name === "Agent" && rootCall.arguments.subagent_type === agent.role, "uncorrelated_agent_dispatch");
    const hashes = object.parse(object.parse(start?.data.sha256).resources);
    check(agent.data.definitionSha256 === hashes[`agents/${agent.role}.md`], "agent_definition_not_pinned");
    check(agent.data.model === start?.data.model && agent.data.provider === start?.data.provider, "agent_model_not_inherited");
    if (phase.filter((event) => event.invocation === agent.invocation && event.kind === "completed").length !== 1) incomplete.push("agent_completion_missing");
  }
  check(calls.filter((call) => call.name === "Agent").length === started.length, "agent_dispatch_count_mismatch");
  const toolCalls = phase.filter((event) => event.kind === "tool_started");
  for (const call of toolCalls) {
    const ends = phase.filter((event) => event.kind === "tool_completed" && event.invocation === call.invocation && event.data.id === call.data.id);
    if (ends.length !== 1 || ends[0]?.data.name !== call.data.name) incomplete.push("nested_tool_receipt_missing");
    if (ends[0]?.data.result) {
      const output = object.parse(ends[0].data.result);
      if (output.isError === true) incomplete.push("nested_tool_error");
      if (["research_domain", "enrich_lead"].includes(z.string().parse(call.data.name)) && output.isError !== true) {
        const payload = z.array(z.object({ type: z.literal("text"), text: z.string() })).parse(output.content);
        const data = object.parse(JSON.parse(payload[0]?.text ?? "null"));
        if (!Array.isArray(data.failedConnectors) || data.failedConnectors.length || data.budgetExhausted === true) incomplete.push("connector_failure_or_unknown_status");
        if (call.data.name === "research_domain") {
          const domain = object.parse(call.data.arguments).domain;
          const expected = domain === "example.test" ? ["Example Fixture Labs", "Riley Example"] : ["Second Fixture Labs", "Morgan Sample"];
          const leads = z.array(object).parse(data.leads);
          const contacts = z.array(object).parse(data.contacts);
          check(leads.length === 1 && leads[0]?.domain === domain && leads[0]?.companyName === expected[0], "research_fixture_mismatch");
          check(contacts.length === 1 && contacts[0]?.leadDomain === domain && contacts[0]?.name === expected[1], "research_contact_fixture_mismatch");
        } else {
          const enrichments = z.array(object).parse(data.enrichments);
          check(enrichments.some((entry) => entry.verifiedEmail === "riley@example.test"), "enrichment_fixture_mismatch");
        }
      }
    }
  }
  if (policy.research.length) {
    const firstAgent = calls.find((call) => call.name === "Agent");
    const preflight = calls.find((call) => call.name === "list_connectors");
    const completed = events.find((event) => event.kind === "call_completed" && event.data.callId === preflight?.callId);
    check(completed && completed.sequence < (firstAgent?.sequence ?? 0), "research_before_preflight");
  }
  const research = toolCalls.filter((event) => event.data.name === "research_domain");
  check(JSON.stringify(research.map((event) => object.parse(event.data.arguments).domain).sort()) === JSON.stringify([...policy.research].sort()), "research_domains_mismatch");
  check(started.filter((event) => event.role === "outreach-researcher").length === policy.research.length, "researcher_count_mismatch");
  const checkpoints = events.filter((event) => event.kind === "checkpoint");
  for (const [index, checkpoint] of checkpoints.entries()) {
    check(checkpoint.data.index === index && JSON.stringify(Object.values(object.parse(checkpoint.data.answers))) === JSON.stringify(policy.checkpoints[index]), "checkpoint_reply_mismatch");
  }
  const laterAgents = started.filter((event) => event.role !== "outreach-researcher");
  if (policy.draft) {
    check(laterAgents.filter((event) => event.role === "outreach-enricher").length === 1, "enricher_count_mismatch");
    check(laterAgents.filter((event) => event.role === "outreach-drafter").length === 1, "drafter_count_mismatch");
    check(checkpoints.length === 2, "missing_separate_checkpoints");
    const leadCheckpoint = checkpoints[0];
    const draftCheckpoint = checkpoints[1];
    const completedRoot = (id: unknown) => events.find((event) => event.kind === "call_completed" && event.data.callId === id)?.sequence ?? Infinity;
    for (const agent of started.filter((event) => event.role === "outreach-researcher")) {
      check(completedRoot(agent.data.correlationCallId) < (leadCheckpoint?.sequence ?? 0), "lead_selection_before_research");
    }
    const enrich = laterAgents.find((event) => event.role === "outreach-enricher");
    const draft = laterAgents.find((event) => event.role === "outreach-drafter");
    const enrichCall = calls.find((call) => call.callId === enrich?.data.correlationCallId);
    const draftCall = calls.find((call) => call.callId === draft?.data.correlationCallId);
    check((enrichCall?.sequence ?? 0) > (leadCheckpoint?.sequence ?? Infinity), "enrichment_before_lead_selection");
    check((draftCall?.sequence ?? 0) > completedRoot(enrich?.data.correlationCallId), "draft_before_enrichment");
    check(completedRoot(draft?.data.correlationCallId) < (draftCheckpoint?.sequence ?? 0), "draft_approval_before_drafting");
    const enriched = toolCalls.filter((event) => event.data.name === "enrich_lead");
    check(enriched.length === 1 && object.parse(enriched[0]?.data.arguments).domain === "example.test", "enrichment_outside_retained_leads");
    check(toolCalls.some((event) => event.role === "outreach-drafter" && event.data.name === "Read" && object.parse(event.data.arguments).file_path === "prompts/outreach.v3.md"), "canonical_draft_prompt_not_read");
  } else {
    check(laterAgents.length === 0, "unexpected_enrichment_or_draft");
  }
  if (policy.unrelated) check(calls.length === 0, "unrelated_request_used_campaign_host");
  check(!calls.some((call) => ["approve", "reject", "suppress", "underwrite"].includes(call.name)), "unrequested_side_effect_or_calculation");
  const saves = calls.filter((call) => call.name === "save_run");
  check(saves.length === (policy.save ? 1 : 0), "unexpected_save_count");
  const database = join(home, "runs.sqlite");
  const exists = await optional(database);
  const runs = exists ? await new EncryptedSqliteRunStore(database, { keyPath: join(home, "runs.sqlite.key") }).listRuns() : [];
  check(runs.length === (policy.save ? 1 : 0), "unexpected_stored_run_count");
  for (const save of saves) {
    check(save.arguments.provider === start?.data.provider && save.arguments.model === start?.data.model, "saved_model_identity_mismatch");
    check(policy.save && (checkpoints[1]?.sequence ?? Infinity) < save.sequence, "save_without_prior_draft_approval");
    const drafts = z.array(draftSchema).parse(save.arguments.messages);
    const questionText = JSON.stringify(checkpoints[1]?.data.questions ?? []);
    for (const message of drafts) {
      check([message.contactKey, message.body, message.cta, ...(message.subject ? [message.subject] : [])].every((text) => questionText.includes(JSON.stringify(text).slice(1, -1))), "saved_draft_not_shown_exactly");
    }
    const emitted = phase.filter((event) => event.role === "outreach-drafter" && event.kind === "completed");
    try {
      const drafted = object.parse(jsonOutput(emitted[0]?.data.output));
      check(JSON.stringify(z.array(draftSchema).parse(drafted.messages)) === JSON.stringify(drafts), "saved_draft_changed_after_agent");
    } catch { incomplete.push("unparseable_drafter_evidence"); }
    const stored = runs.find((run) => run.id === save.arguments.id);
    check(stored?.messages.length === 1 && drafts.length === 1, "saved_message_count_mismatch");
    check(stored?.messages.every((message, i) => message.body === drafts[i]?.body && message.subject === drafts[i]?.subject && message.cta === drafts[i]?.cta && message.contactKey === drafts[i]?.contactKey && message.needsSenderIdentity === true), "store_differs_from_approved_draft");
  }
  check(!(await optional(join(home, "approvals.jsonl")))?.toString().trim(), "unexpected_send_approval_record");
  check(!(await optional(join(home, "suppressions.jsonl")))?.toString().trim(), "unexpected_suppression_record");
  return { caseId, scope: "structural_host_and_store_assertions_only", behavioralVerdict: null, tier3bPassed: false,
    passed: failures.length === 0 && incomplete.length === 0, failures: [...new Set(failures)], incomplete: [...new Set(incomplete)],
    traceSha256: createHash("sha256").update(bytes).digest("hex"), storedRuns: runs.length,
  };
}
