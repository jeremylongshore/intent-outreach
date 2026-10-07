import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createAgentHost, loadAgentResources, type AgentBundle, type AgentModel, type AgentTurn } from "../evals/jrig/agent-host.js";

const root = resolve(import.meta.dirname, "..");
const usage = { inputTokens: 7, outputTokens: 3 };
const turn = (calls: AgentTurn["calls"] = [], text = "finished"): AgentTurn => ({ text, calls, usage });
const call = (name: string, args: Record<string, unknown> = {}, id = "one") => ({ id, name, arguments: args });
function fixture(responses: unknown[], bundle?: AgentBundle, limits?: Parameters<typeof createAgentHost>[0]["limits"]) {
  const complete = vi.fn<AgentModel["complete"]>().mockImplementation(async () => {
    if (!responses.length) throw new Error("script exhausted");
    return responses.shift();
  });
  const invoke = vi.fn<AgentBundle["call"]>().mockResolvedValue({ content: [{ type: "text", text: "fixture-data" }] });
  const model = { provider: "scripted-component-test", model: "no-real-model", complete };
  return { complete, invoke, host: createAgentHost({ root, model, bundle: bundle ?? {
    tools: ["list_connectors", "research_domain", "enrich_lead", "save_run"].map((name) => ({ name, description: name, inputSchema: { type: "object" } })),
    call: invoke,
  }, limits }) };
}

describe("evaluation phase-agent host", () => {
  it("uses unchanged agent bodies, separate contexts, exact tool results and explicit model identity", async () => {
    const f = fixture([turn([call("research_domain", { domain: "example.test", icp: "tools" })]), turn([], "research-output"), turn([], "enrich-output")]);
    const host = await f.host;
    expect(await host.dispatch({ subagent_type: "outreach-researcher", prompt: "ONLY RESEARCH INPUT" })).toBe("research-output");
    await host.dispatch({ subagent_type: "outreach-enricher", prompt: "ONLY ENRICH INPUT" });
    const source = await readFile(join(root, "agents/outreach-researcher.md"), "utf8");
    expect(f.complete.mock.calls[0]![0].messages).toEqual([
      { role: "system", content: source.split(/\n---\n/)[1] }, { role: "user", content: "ONLY RESEARCH INPUT" },
    ]);
    expect(f.complete.mock.calls[1]![0].messages.at(-1)).toEqual({ role: "tool", callId: "one", name: "research_domain", content: JSON.stringify({ content: [{ type: "text", text: "fixture-data" }] }) });
    expect(f.complete.mock.calls[2]![0].messages).toHaveLength(2);
    expect(JSON.stringify(f.complete.mock.calls[2]![0].messages)).not.toContain("ONLY RESEARCH INPUT");
    expect(f.complete.mock.calls[0]![0].tools.map((t) => t.name)).toEqual(["list_connectors", "research_domain"]);
    expect(f.complete.mock.calls[2]![0].tools.map((t) => t.name)).toEqual(["enrich_lead"]);
    expect(host.snapshot().usage).toEqual({ inputTokens: 21, outputTokens: 9 });
    expect(host.snapshot().events[0]?.data).toMatchObject({ provider: "scripted-component-test", model: "no-real-model", definitionSha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
    const copy = host.snapshot();
    copy.events.length = 0;
    expect(host.snapshot().events.length).toBeGreaterThan(0);
  });

  it.each([
    ["outreach-researcher", "enrich_lead"], ["outreach-enricher", "research_domain"],
    ["outreach-drafter", "save_run"], ["outreach-drafter", "Agent"],
  ])("refuses %s calling %s", async (role, name) => {
    const f = fixture([turn([call(name)])]);
    const host = await f.host;
    await expect(host.dispatch({ subagent_type: role, prompt: "try forbidden tool" })).rejects.toThrow("outside its role");
    expect(f.invoke).not.toHaveBeenCalled();
    expect(host.snapshot().events.at(-1)?.kind).toBe("failed");
  });

  it.each([
    [call("research_domain"), call("save_run", {}, "two")],
    [call("research_domain"), call("research_domain")],
  ])("validates a whole multi-call turn before any invocation", async (...calls) => {
    const f = fixture([turn(calls)]);
    const host = await f.host;
    await expect(host.dispatch({ subagent_type: "outreach-researcher", prompt: "test" })).rejects.toThrow();
    expect(f.invoke).not.toHaveBeenCalled();
  });

  it.each([null, [], "{}"])("refuses non-object arguments %j before invocation", async (args) => {
    const f = fixture([{ ...turn(), calls: [{ id: "one", name: "research_domain", arguments: args }] }]);
    await expect((await f.host).dispatch({ subagent_type: "outreach-researcher", prompt: "test" })).rejects.toThrow();
    expect(f.invoke).not.toHaveBeenCalled();
  });

  it("validates every bundled input schema before the first tool in a turn", async () => {
    const invoke = vi.fn<AgentBundle["call"]>();
    const f = fixture([turn([call("list_connectors"), call("research_domain", { domain: 42 }, "two")])], {
      tools: ["list_connectors", "research_domain", "enrich_lead"].map((name) => ({ name, description: name,
        inputSchema: { type: "object", properties: { domain: { type: "string" } } } })), call: invoke,
    });
    await expect((await f.host).dispatch({ subagent_type: "outreach-researcher", prompt: "test" })).rejects.toThrow("bundled schema");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("reserves shared call capacity before concurrent dispatches can exceed it", async () => {
    let release: () => void = () => {};
    let started: () => void = () => {};
    const pending = new Promise<void>((done) => { release = done; });
    const observed = new Promise<void>((done) => { started = done; });
    const f = fixture([turn([call("research_domain")]), turn([call("research_domain")]), turn()], undefined, { maxCalls: 1 });
    f.invoke.mockImplementation(async () => { started(); await pending; return {}; });
    const host = await f.host;
    const first = host.dispatch({ subagent_type: "outreach-researcher", prompt: "first" });
    await observed;
    try {
      await expect(host.dispatch({ subagent_type: "outreach-researcher", prompt: "second" })).rejects.toThrow("tool budget");
    } finally { release(); }
    await first;
    expect(f.invoke).toHaveBeenCalledTimes(1);
  });

  it("refuses changed agent permissions and resource symlinks outside the reviewed root", async () => {
    const temp = await mkdtemp(join(tmpdir(), "jrig-resource-boundary-"));
    const copied = join(temp, "repo");
    try {
      for (const name of ["agents/outreach-researcher.md", "agents/outreach-enricher.md", "agents/outreach-drafter.md", "prompts/outreach.v3.md", "skills/intent-outreach/references/report-profiles.md", "skills/intent-outreach/references/runtime-contract.md"]) {
        await mkdir(dirname(join(copied, name)), { recursive: true });
        await copyFile(join(root, name), join(copied, name));
      }
      const agentPath = join(copied, "agents/outreach-drafter.md");
      const original = await readFile(agentPath, "utf8");
      await writeFile(agentPath, original.replace("  - Read", "  - Read\n  - Bash"));
      await expect(loadAgentResources(copied)).rejects.toThrow("metadata changed");
      await writeFile(agentPath, original);
      const promptPath = join(copied, "prompts/outreach.v3.md");
      const outside = join(temp, "unreviewed.txt");
      await writeFile(outside, "unreviewed resource");
      await rm(promptPath);
      await symlink(outside, promptPath);
      await expect(loadAgentResources(copied)).rejects.toThrow("escapes repository");
    } finally { await rm(temp, { recursive: true, force: true }); }
  });

  it("returns the canonical prompt through Read and records its exact bytes", async () => {
    const f = fixture([turn([call("Read", { file_path: "prompts/outreach.v3.md" })]), turn([], "draft")]);
    const host = await f.host;
    await host.dispatch({ subagent_type: "outreach-drafter", prompt: "ONLY DRAFT INPUT" });
    expect(f.invoke).not.toHaveBeenCalled();
    expect(f.complete.mock.calls[0]![0].tools.map((tool) => tool.name)).toEqual(["Read"]);
    expect(JSON.parse((f.complete.mock.calls[1]![0].messages.at(-1) as { content: string }).content)).toEqual({ text: await readFile(join(root, "prompts/outreach.v3.md"), "utf8") });
  });

  it.each([".env", "../../.ssh/id_ed25519", "/etc/passwd", "prompts/../.env"])("refuses arbitrary Read %s", async (file_path) => {
    const f = fixture([turn([call("Read", { file_path })])]);
    const host = await f.host;
    await expect(host.dispatch({ subagent_type: "outreach-drafter", prompt: "read" })).rejects.toThrow();
    expect(host.snapshot().calls).toBe(0);
  });

  it("retains partial evidence and distinguishes MCP error results from success", async () => {
    const f = fixture([turn([call("research_domain")]), turn([], "tool failed")]);
    f.invoke.mockResolvedValue({ isError: true, content: [{ type: "text", text: "fixture research error" }] });
    const host = await f.host;
    await host.dispatch({ subagent_type: "outreach-researcher", prompt: "research" });
    expect(host.snapshot().events.find((event) => event.kind === "tool_completed")?.data.result).toMatchObject({ isError: true });
    expect(JSON.stringify(f.complete.mock.calls[1]![0].messages)).toContain("fixture research error");
  });

  it("retains attempted-call evidence on transport failure without journaling its raw exception", async () => {
    const f = fixture([turn([call("research_domain")])]);
    f.invoke.mockRejectedValue(new Error("sensitive-provider-error"));
    const host = await f.host;
    await expect(host.dispatch({ subagent_type: "outreach-researcher", prompt: "test" })).rejects.toThrow();
    expect(host.snapshot().calls).toBe(1);
    expect(host.snapshot().events.map((e) => e.kind)).toEqual(["started", "model", "tool_started", "failed"]);
    expect(JSON.stringify(host.snapshot())).not.toContain("sensitive-provider-error");
  });

  it("enforces shared invocation/tool budgets and fails instead of truncating successful work", async () => {
    const f = fixture([turn([call("research_domain"), call("list_connectors", {}, "two")])], undefined, { maxCalls: 1, maxInvocations: 1 });
    const host = await f.host;
    await expect(host.dispatch({ subagent_type: "outreach-researcher", prompt: "test" })).rejects.toThrow("tool budget");
    expect(f.invoke).not.toHaveBeenCalled();
    await expect(host.dispatch({ subagent_type: "outreach-researcher", prompt: "test" })).rejects.toThrow("invocation budget");
  });

  it("does not dispatch tools after model cancellation", async () => {
    const controller = new AbortController();
    const f = fixture([]);
    f.complete.mockImplementation(async () => { controller.abort(); return turn([call("research_domain")]); });
    const host = await f.host;
    await expect(host.dispatch({ subagent_type: "outreach-researcher", prompt: "test" }, controller.signal)).rejects.toThrow();
    expect(f.invoke).not.toHaveBeenCalled();
    expect(host.snapshot().events.at(-1)?.data.aborted).toBe(true);
  });

  it("refuses empty completions and exhausted turn/byte limits", async () => {
    const empty = fixture([turn([], " ")]);
    await expect((await empty.host).dispatch({ subagent_type: "outreach-drafter", prompt: "test" })).rejects.toThrow("empty");
    const turns = fixture([turn([call("research_domain")])], undefined, { maxTurns: 1 });
    await expect((await turns.host).dispatch({ subagent_type: "outreach-researcher", prompt: "test" })).rejects.toThrow("turn budget");
    const bytes = fixture([], undefined, { maxBytes: 1 });
    await expect((await bytes.host).dispatch({ subagent_type: "outreach-researcher", prompt: "test" })).rejects.toThrow("byte budget");
    expect(bytes.complete).not.toHaveBeenCalled();
  });

  it("executes actual research and enrichment in the shipped bundle with isolated synthetic transport", async () => {
    const home = await mkdtemp(join(tmpdir(), "jrig-agents-"));
    const client = new Client({ name: "jrig-agent-component-test", version: "0" });
    const transport = new StdioClientTransport({ command: process.execPath,
      args: ["--import", join(root, "evals/jrig/fixture-fetch.mjs"), join(root, "bundle/server.mjs")],
      env: { PATH: process.env.PATH ?? "", HOME: home, INTENT_OUTREACH_HOME: home, INTENT_OUTREACH_SECRETS_FILE: join(home, "secrets.json"), INTENT_OUTREACH_PUBLIC_RECORDS: "0", HUNTER_API_KEY: "jrig-offline-fixture" }, stderr: "pipe" });
    let pid: number | undefined;
    try {
      await writeFile(join(home, "secrets.json"), "{}", { mode: 0o600 });
      await client.connect(transport);
      pid = transport.pid ?? undefined;
      const tools = (await client.listTools()).tools.map((t) => ({ ...t, description: t.description ?? "" }));
      const f = fixture([
        turn([call("research_domain", { domain: "example.test", icp: "tools" })]), turn([], "research complete"),
        turn([call("enrich_lead", { domain: "example.test", companyName: "Example Fixture Labs", contacts: [{ name: "Riley Example" }] })]), turn([], "enrich complete"),
      ], { tools, call: (name, args, signal) => client.callTool({ name, arguments: args }, undefined, { signal }) });
      const host = await f.host;
      await host.dispatch({ subagent_type: "outreach-researcher", prompt: "example.test; tools" });
      await host.dispatch({ subagent_type: "outreach-enricher", prompt: "Example Fixture Labs; Riley Example" });
      const actualResults = host.snapshot().events.filter((e) => e.kind === "tool_completed").map((e) => e.data.result as { isError?: boolean; content: { text: string }[] });
      expect(actualResults).toHaveLength(2);
      expect(actualResults.every((r) => !r.isError)).toBe(true);
      expect(JSON.parse(actualResults[0]!.content[0]!.text).leads[0].companyName).toBe("Example Fixture Labs");
      expect(JSON.parse(actualResults[1]!.content[0]!.text).enrichments[0].verifiedEmail).toBe("riley@example.test");
      await expect(readFile(join(home, "runs.sqlite"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await client.close();
      await rm(home, { recursive: true, force: true });
    }
    expect(pid).toBeTypeOf("number");
    expect(() => process.kill(pid!, 0)).toThrow();
  }, 15000);
});
