import { phaseTimeoutMsSchema } from "./agent-host.js";
import { reasoningEffortSchema, type ReasoningEffort } from "./agent-model.js";
/** Scripted real-CLI association proof; no model-quality judgment or paid calls. */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { bindScenarioEvidence } from "./bind-evidence.js";
import { scenarioConfig } from "./scenario-host.js";
import { scenarios } from "./scenarios.js";

export async function runBindingProof(jrigCli: string, executionReasoningEffort?: ReasoningEffort, phaseTimeoutMs?: number) {
  assert(isAbsolute(jrigCli), "absolute built J-Rig CLI required");
  const root = resolve(import.meta.dirname, "../..");
  const home = await mkdtemp(join(tmpdir(), "outreach-binding-proof-"));
  const hostsDir = join(home, "hosts");
  await mkdir(hostsDir, { mode: 0o700 });
  const failures: unknown[] = [];
  let rootRequests = 0;
  let nestedRequests = 0;
  const completion = (text: string, name?: string, args: object = {}, id = "fixture-call") => ({
    choices: [{ finish_reason: name ? "tool_calls" : "stop", message: { content: text,
      ...(name ? { tool_calls: [{ id, type: "function", function: { name, arguments: JSON.stringify(args) } }] } : {}),
    } }], usage: { prompt_tokens: 11, completion_tokens: 5 },
  });
  const server = createServer(async (request, response) => {
    try {
      assert.equal(request.url, "/v1/chat/completions");
      assert.equal(request.headers.authorization, "Bearer fixture-only");
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString());
      assert.equal(body.model, "fixture-model");
      assert.equal(body.reasoning_effort, executionReasoningEffort);
      const tools = body.tools as { function: { name: string } }[];
      assert(tools?.length, "this component proof has no model judge or trigger calls");
      const messages = body.messages as { role: string; content: string }[];
      const outputs = messages.filter((message) => message.role === "tool");
      let result: ReturnType<typeof completion>;
      if (tools.some((tool) => tool.function.name === "research_domain")) {
        nestedRequests++;
        if (outputs.length === 0) result = completion("", "research_domain", { domain: "example.test", icp: "Developer tools" });
        else {
          assert.equal(outputs.length, 1);
          const observed = JSON.parse(outputs[0]?.content ?? "null");
          assert(!observed.isError);
          const research = JSON.parse(observed.content[0].text);
          assert.equal(research.leads[0].companyName, "Example Fixture Labs");
          result = completion(JSON.stringify(research));
        }
      } else {
        rootRequests++;
        assert(tools.some((tool) => tool.function.name === "outreach__Agent"));
        if (outputs.length) assert(!JSON.parse(outputs.at(-1)?.content ?? "null").isError);
        if (outputs.length === 0) result = completion("", "outreach__list_connectors", {}, "root-0");
        else if (outputs.length === 1) result = completion("", "outreach__Agent", { subagent_type: "outreach-researcher", prompt: "Research example.test for developer tools; return actual fixture companies and contacts." }, "root-1");
        else if (outputs.length === 2) result = completion("", "outreach__AskUserQuestion", { questions: [
          { header: "Leads", question: "Keep Example Fixture Labs and Riley Example for research-only results?" },
          { header: "Contacts", question: "Which contacts should remain in the research results?" },
          { header: "Scope", question: "Proceed beyond research?" },
        ] }, "root-2");
        else {
          assert.equal(outputs.length, 3);
          const response = JSON.parse(outputs[2]?.content ?? "null");
          const decision = scenarios["build-lead-list"]?.checkpoints[0]?.[0];
          assert(decision);
          assert.deepEqual(JSON.parse(response.content[0].text).answers, { Leads: decision, Contacts: decision, Scope: decision });
          result = completion("BINDING_COMPONENT_ONLY: Example Fixture Labs and Riley Example researched. No enrichment, drafts or saves.");
        }
      }
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(result));
    } catch (error) { failures.push(error); response.writeHead(500).end('{"error":"fixture contract failed"}'); }
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  try {
    const address = server.address();
    assert(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${address.port}/v1`;
    const hostConfig = join(home, "scenario.json");
    await writeFile(hostConfig, JSON.stringify(scenarioConfig.parse({ caseId: "build-lead-list", evidenceDir: hostsDir,
      provider: "openai", model: "fixture-model", baseUrl, executionReasoningEffort, phaseTimeoutMs, checkpoints: scenarios["build-lead-list"]?.checkpoints })), { mode: 0o600 });
    const mcpConfigPath = join(home, "mcp.json");
    await writeFile(mcpConfigPath, JSON.stringify({ judgeObservations: true, servers: { outreach: { command: process.execPath,
      args: ["--import", "tsx", join(root, "evals/jrig/scenario-host.ts"), hostConfig], cwd: root,
      env: ["JRIG_AGENT_API_KEY"], tools: ["Agent", "Read", "AskUserQuestion", "list_connectors", "save_run", "list_pending", "approve", "reject", "suppress", "list_runs", "underwrite"],
    } }, limits: { maxTurns: 6, maxCalls: 6, timeoutMs: 60000 } }), { mode: 0o600 });
    const spec = join(home, "spec.json");
    await writeFile(spec, JSON.stringify({ spec_version: "1.0", skill_name: "intent-outreach", description: "Scripted association proof, never behavioral acceptance",
      criteria: [{ id: "component-only", description: "Scripted completion marker", method: "deterministic", deterministic_check: "contains", deterministic_check_params: { value: "BINDING_COMPONENT_ONLY" } }],
      test_cases: [{ id: "build-lead-list", tier: "core", description: "Actual nested research with isolated baseline", prompt: "Research example.test for developer tools only, then ask the authored checkpoint. No enrichment, drafting or saves." }], models: ["fixture-model"],
    }), { mode: 0o600 });
    const dbPath = join(home, "jrig.db");
    // Apply the private umask only in the child; do not mutate the caller process.
    await promisify(execFile)(process.execPath, ["--input-type=module", "-e", "process.umask(0o077); process.argv = [process.execPath, ...process.argv.slice(1)]; await import(process.argv[1]);", jrigCli,
      "eval", join(root, "skills/intent-outreach"), "--spec", spec, "--provider", "openai", "--models", "fixture-model", "--samples", "1", "--no-trigger", "--baseline-check", "--mcp-config", mcpConfigPath, "--db", dbPath, "--json", ...(executionReasoningEffort !== undefined ? ["--execution-reasoning-effort", executionReasoningEffort] : [])],
    { timeout: 150000, maxBuffer: 1048576, env: { PATH: process.env.PATH, HOME: home, OPENAI_API_KEY: "fixture-only", JRIG_AGENT_API_KEY: "fixture-only", LLM_BASE_URL: baseUrl, LLM_MODEL: "fixture-model" } });
    assert.deepEqual(failures, []);
    assert.equal(rootRequests, 8);
    assert.equal(nestedRequests, 4);
    const input = { dbPath, hostsDir, mcpConfigPath, caseId: "build-lead-list", provider: "openai", model: "fixture-model", serverName: "outreach", baseline: true, executionReasoningEffort, phaseTimeoutMs };
    const result = await bindScenarioEvidence(input);
    await assert.rejects(bindScenarioEvidence({ ...input, phaseTimeoutMs: phaseTimeoutMs === 120000 ? 60000 : 120000 }), /host phase timeout mismatch/);
    assert(result.bindings.every((entry) => entry.passed && entry.judgeContext?.session_id === entry.sessionId));
    assert(result.bindings.every((entry) => entry.nestedUsage?.inputTokens === 22 && entry.nestedUsage.outputTokens === 10));
    const paths = ["bundle/server.mjs", "skills/intent-outreach/SKILL.md", "evals/jrig/bind-evidence.ts", "evals/jrig/binding-proof.ts", "evals/jrig/scenario-host.ts", "evals/jrig/scenarios.ts", "evals/jrig/agent-host.ts", "evals/jrig/agent-model.ts", "evals/jrig/audit-scenario.ts", "evals/jrig/fixture-fetch.mjs"];
    const sha256 = Object.fromEntries(await Promise.all(paths.map(async (path) => [path, createHash("sha256").update(await readFile(join(root, path))).digest("hex")])));
    return { schema: "intent-outreach-jrig-binding-proof/v1", observedAt: new Date().toISOString(), scope: "scripted_loopback_real_cli_and_nested_bundle",
      ...(executionReasoningEffort !== undefined ? { executionParameters: { reasoning_effort: executionReasoningEffort } } : {}),
      ...(phaseTimeoutMs !== undefined ? { phaseTimeoutMs } : {}),
      behavioralVerdict: null, tier3bPassed: false, paidModelCalls: 0, vendorNetworkCalls: 0, messagesSent: 0,
      checkpointQuestions: 3, authoredDecisionPreserved: true,
      rootRequests, nestedRequests, bindings: result.bindings.map(({ phase, sessionId, receiptSha256, traceSha256, nestedUsage, audit, passed, judgeContext, phaseTimeoutMs: boundPhaseTimeoutMs }) => ({ phase, sessionId, receiptSha256, traceSha256, nestedUsage, audit, passed, judgeContext, ...(boundPhaseTimeoutMs !== undefined ? { phaseTimeoutMs: boundPhaseTimeoutMs } : {}) })),
      sha256: { ...sha256, jrigCli: createHash("sha256").update(await readFile(jrigCli)).digest("hex") },
    };
  } finally {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
    await rm(home, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cli = process.argv[2];
  const output = process.argv[3];
  assert(cli && output, "Usage: tsx evals/jrig/binding-proof.ts /absolute/jrig/dist/index.js /new/receipt.json");
  const receipt = await runBindingProof(cli, reasoningEffortSchema.optional().parse(process.argv[4] === "default" ? undefined : process.argv[4]),
    phaseTimeoutMsSchema.optional().parse(process.argv[5] === undefined ? undefined : Number(process.argv[5])));
  await writeFile(output, JSON.stringify(receipt, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  process.stdout.write(JSON.stringify(receipt) + "\n");
}
