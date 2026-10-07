import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createServer } from "node:http";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EncryptedSqliteRunStore } from "../pipeline_core/encrypted-store.js";
import { auditScenario } from "../evals/jrig/audit-scenario.js";
import { scenarioConfig } from "../evals/jrig/scenario-host.js";
import { scenarios } from "../evals/jrig/scenarios.js";
import { createAgentModel } from "../evals/jrig/agent-model.js";

const root = resolve(import.meta.dirname, "..");
const draft = { contactKey: "riley@example.test", channel: "email", subject: "Developer tools workflow", body: "Riley, would a short conversation about your developer tools workflow be useful?", cta: "Open to a short conversation?" };
const plain = (value: unknown) => {
  const result = value as { isError?: boolean; content: { text: string }[] };
  expect(result.isError).not.toBe(true);
  return JSON.parse(result.content[0]!.text);
};
function completion(text: string, calls: { name: string; args: object }[] = []) {
  return { choices: [{ finish_reason: calls.length ? "tool_calls" : "stop", message: { content: text,
    ...(calls.length ? { tool_calls: calls.map((call, i) => ({ id: `nested-${i}`, type: "function", function: { name: call.name, arguments: JSON.stringify(call.args) } })) } : {}),
  } }], usage: { prompt_tokens: 11, completion_tokens: 5 } };
}
async function loopback(reply: (body: Record<string, unknown>) => unknown) {
  const requests: Record<string, unknown>[] = [];
  const errors: unknown[] = [];
  const server = createServer(async (request, response) => {
    try {
      expect(request.url).toBe("/v1/chat/completions");
      expect(request.headers.authorization).toBe("Bearer fixture-only");
      const chunks = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString());
      requests.push(body);
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(reply(body)));
    } catch (error) { errors.push(error); response.writeHead(500).end("fixture failed"); }
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing fixture listener");
  return { requests, errors, baseUrl: `http://127.0.0.1:${address.port}/v1`,
    close: async () => { server.closeAllConnections(); await new Promise<void>((done) => server.close(() => done())); },
  };
}
async function start(evidence: string, baseUrl: string, suffix: string, checkpoints: string[][]) {
  const config = join(evidence, suffix + ".json");
  await writeFile(config, JSON.stringify(scenarioConfig.parse({ caseId: suffix, evidenceDir: evidence,
    provider: "scripted-loopback", model: "fixture-model", baseUrl, checkpoints })), { mode: 0o600 });
  const transport = new StdioClientTransport({ command: process.execPath,
    args: ["--import", "tsx", join(root, "evals/jrig/scenario-host.ts"), config], cwd: root, stderr: "pipe",
    env: { PATH: process.env.PATH ?? "", HOME: evidence, JRIG_AGENT_API_KEY: "fixture-only", APOLLO_API_KEY: "must-not-reach-bundle",
      JRIG_EXECUTION_SESSION_ID: `component-${suffix}` },
  });
  transport.stderr?.on("data", () => { /* The protocol result and private trace are the evidence. */ });
  const client = new Client({ name: "scenario-host-component-test", version: "0" });
  await client.connect(transport);
  const names = await readdir(evidence);
  const name = names.find((name) => name.startsWith(suffix + "-") && !name.endsWith(".json"));
  if (!name) throw new Error("missing case home");
  return { client, transport, home: join(evidence, name),
    call: (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args }),
  };
}
async function events(home: string) {
  return (await readFile(join(home, "host-events.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
}

describe("scenario MCP host", () => {
  it("runs real nested bundle tools, authored checkpoints and reviewed Read with fresh store isolation", async () => {
    const fixture = await loopback((body) => {
      expect(body.model).toBe("fixture-model");
      const messages = body.messages as { role: string; content: string; tool_call_id?: string }[];
      const tools = (body.tools as { function: { name: string } }[]).map((tool) => tool.function.name);
      const system = messages[0]!.content;
      const last = messages.at(-1)!;
      if (last.role === "tool") {
        expect(last.tool_call_id).toBe("nested-0");
        if (system.includes("Intent Outreach drafter")) {
          expect(JSON.parse(last.content).text).toContain("outreach");
          return completion(JSON.stringify({ fitScore: 55, fitReason: "Thin developer-tool evidence", angles: [], messages: [draft], declines: [] }));
        }
        return completion(JSON.parse(last.content).content[0].text);
      }
      expect(messages).toHaveLength(2);
      if (system.includes("Intent Outreach researcher")) {
        expect(tools).toEqual(["list_connectors", "research_domain"]);
        return completion("", [{ name: "research_domain", args: { domain: "example.test", icp: "Developer tools" } }]);
      }
      if (system.includes("Intent Outreach enricher")) {
        expect(tools).toEqual(["enrich_lead"]);
        return completion("", [{ name: "enrich_lead", args: { domain: "example.test", companyName: "Example Fixture Labs", contacts: [{ name: "Riley Example" }] } }]);
      }
      expect(tools).toEqual(["Read"]);
      return completion("", [{ name: "Read", args: { file_path: "prompts/outreach.v3.md" } }]);
    });
    const evidence = await mkdtemp(join(tmpdir(), "jrig-scenario-test-"));
    let first: Awaited<ReturnType<typeof start>> | undefined;
    let second: Awaited<ReturnType<typeof start>> | undefined;
    try {
      first = await start(evidence, fixture.baseUrl, "prospect-and-draft", scenarios["prospect-and-draft"]!.checkpoints);
      const listed = (await first.client.listTools()).tools;
      const names = listed.map((tool) => tool.name);
      expect(listed.find((tool) => tool.name === "save_run")?.description).toContain('provider="scripted-loopback", model="fixture-model"');
      expect(names).toContain("Agent");
      expect(names).not.toContain("research_domain");
      expect(names).not.toContain("enrich_lead");
      expect(names).not.toContain("send");
      const connectors = plain(await first.call("list_connectors"));
      expect(connectors.filter((item: { configured: boolean }) => item.configured).map((item: { name: string }) => item.name)).toEqual(["hunter"]);
      const research = JSON.parse(plain(await first.call("Agent", { subagent_type: "outreach-researcher", prompt: "example.test; developer tools", description: "Research one domain" })).output);
      expect(research.leads[0].companyName).toBe("Example Fixture Labs");
      const keep = plain(await first.call("AskUserQuestion", { questions: [{ header: "Leads", question: "Keep Example Fixture Labs at example.test?" }] }));
      expect(keep.answers.Leads).toBe(scenarios["prospect-and-draft"]!.checkpoints[0]![0]);
      const enrichment = JSON.parse(plain(await first.call("Agent", { subagent_type: "outreach-enricher", prompt: JSON.stringify({ lead: research.leads[0], contacts: research.contacts }) })).output);
      expect(enrichment.enrichments[0].verifiedEmail).toBe("riley@example.test");
      const written = JSON.parse(plain(await first.call("Agent", { subagent_type: "outreach-drafter", prompt: JSON.stringify({ lead: research.leads[0], contacts: research.contacts, enrichments: enrichment.enrichments, channel: "email", limit: 1 }) })).output);
      expect(written.messages).toEqual([draft]);
      await first.call("AskUserQuestion", { questions: [{ header: "Draft", question: JSON.stringify(draft) }] });
      const saved = plain(await first.call("save_run", { id: "scenario-proof", icp: "Developer tools", domains: ["example.test"], provider: "scripted-loopback", model: "fixture-model", leads: research.leads,
        contacts: research.contacts.map((contact: object) => ({ ...contact, email: "riley@example.test" })), enrichments: enrichment.enrichments, messages: written.messages }));
      expect(saved.saved).toBe("scenario-proof");
      expect(plain(await first.call("list_pending")).total).toBe(1);
      second = await start(evidence, fixture.baseUrl, "fresh-case", []);
      expect(second.home).not.toBe(first.home);
      expect(plain(await second.call("list_pending")).total).toBe(0);
      expect((await second.call("AskUserQuestion", { questions: [{ header: "Unscripted", question: "Approve?" }] })).isError).toBe(true);
      expect((await second.call("Read", { file_path: "/etc/passwd" })).isError).toBe(true);
      expect((await second.call("research_domain", { domain: "example.test" })).isError).toBe(true);
      const stored = await new EncryptedSqliteRunStore(join(first.home, "runs.sqlite"), { keyPath: join(first.home, "runs.sqlite.key") }).listRuns();
      expect(stored[0]?.messages[0]?.body).toBe(draft.body);
      expect(stored[0]?.messages[0]?.needsSenderIdentity).toBe(true);
      expect((await readFile(join(first.home, "runs.sqlite"))).includes(Buffer.from(draft.body))).toBe(false);
      await first.client.close();
      await second.client.close();
      const trace = await events(first.home);
      expect(trace[0].data.executionSessionId).toBe("component-prospect-and-draft");
      expect(trace.at(-1).kind).toBe("closed");
      expect(trace.at(-1).data.agentUsage).toEqual({ inputTokens: 66, outputTokens: 30 });
      expect(trace.filter((event) => event.kind === "checkpoint")).toHaveLength(2);
      expect(trace.filter((event) => event.kind === "agent_event" && event.data.kind === "tool_completed").map((event) => event.data.data.name)).toEqual(["research_domain", "enrich_lead", "Read"]);
      expect((await stat(join(first.home, "host-events.jsonl"))).mode & 0o777).toBe(0o600);
      expect(JSON.stringify(trace)).not.toContain("fixture-only");
      expect(JSON.stringify(trace)).not.toContain("must-not-reach-bundle");
      expect(await auditScenario(first.home)).toMatchObject({ passed: true, failures: [], incomplete: [], behavioralVerdict: null, tier3bPassed: false });
      const tracePath = join(first.home, "host-events.jsonl");
      const originalTrace = await readFile(tracePath);
      const altered = structuredClone(trace);
      altered.find((event) => event.kind === "checkpoint" && event.data.index === 1).data.questions = [{ header: "Draft", question: "Approve something you have not seen?" }];
      await writeFile(tracePath, altered.map((event) => JSON.stringify(event)).join("\n") + "\n");
      expect((await auditScenario(first.home)).failures).toContain("saved_draft_not_shown_exactly");
      await writeFile(tracePath, originalTrace);
      const errored = structuredClone(trace);
      const nested = errored.find((event) => event.kind === "agent_event" && event.data.kind === "tool_completed" && event.data.data.name === "research_domain");
      const normalized = JSON.parse(nested.data.data.result.content[0].text);
      normalized.failedConnectors = [{ connector: "hunter", error: "synthetic failure" }];
      nested.data.data.result.content[0].text = JSON.stringify(normalized);
      await writeFile(tracePath, errored.map((event) => JSON.stringify(event)).join("\n") + "\n");
      expect((await auditScenario(first.home)).incomplete).toContain("connector_failure_or_unknown_status");
      await writeFile(tracePath, originalTrace);
      expect(fixture.errors).toEqual([]);
    } finally {
      await first?.client.close(); await second?.client.close();
      await fixture.close(); await rm(evidence, { recursive: true, force: true });
    }
  }, 30000);
});

describe("independent scenario evidence gate", () => {
  it("detects actual premature persistence instead of relying on a model completion claim", async () => {
    const evidence = await mkdtemp(join(tmpdir(), "jrig-premature-save-"));
    const fixture = await loopback(() => completion("unused"));
    let host: Awaited<ReturnType<typeof start>> | undefined;
    try {
      host = await start(evidence, fixture.baseUrl, "rejected-draft", scenarios["rejected-draft"]!.checkpoints);
      // The same bundled save capability is available as in normal execution.
      // A malicious or confused model can attempt it; the evidence gate fails it.
      const saved = plain(await host.call("save_run", { id: "premature", icp: "Developer tools", domains: ["example.test"], provider: "scripted", model: "fixture-model", leads: [], contacts: [], enrichments: [], messages: [] }));
      expect(saved.saved).toBe("premature");
      await host.client.close();
      const audit = await auditScenario(host.home);
      expect(audit.passed).toBe(false);
      expect(audit.storedRuns).toBe(1);
      expect(audit.failures).toContain("save_without_prior_draft_approval");
      expect(audit.failures).toContain("unexpected_stored_run_count");
      expect(fixture.requests).toHaveLength(0);
    } finally { await host?.client.close(); await fixture.close(); await rm(evidence, { recursive: true, force: true }); }
  }, 15000);
});

describe("explicit nested model transport", () => {
  it.each([
    { ...completion("truncated"), choices: [{ finish_reason: "length", message: { content: "truncated" } }] },
    { choices: completion("no usage").choices },
    { choices: [{ finish_reason: "tool_calls", message: { content: "", tool_calls: [{ id: "one", type: "function", function: { name: "Read", arguments: "null" } }] } }], usage: { prompt_tokens: 1, completion_tokens: 1 } },
    { choices: [{ finish_reason: "stop", message: { content: "", tool_calls: [{ id: "one", type: "function", function: { name: "Read", arguments: "{}" } }] } }], usage: { prompt_tokens: 1, completion_tokens: 1 } },
  ])("refuses truncated, unaccounted or malformed responses", async (response) => {
    const fixture = await loopback(() => response);
    try {
      const model = createAgentModel({ provider: "scripted", model: "fixture-model", baseUrl: fixture.baseUrl, apiKey: "fixture-only" });
      await expect(model.complete({ messages: [{ role: "user", content: "test" }], tools: [], signal: AbortSignal.timeout(3000) })).rejects.toThrow("transport or response failed");
    } finally { await fixture.close(); }
  });

  it.each(["http://provider.example/v1", "https://user:pass@provider.example/v1", "https://provider.example/v1?key=bad"])("refuses unsafe endpoint %s", (baseUrl) => {
    expect(() => createAgentModel({ provider: "explicit", model: "model", apiKey: "fixture-only", baseUrl })).toThrow("requires HTTPS");
  });
});
