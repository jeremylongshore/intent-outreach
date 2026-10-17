/** Scripted transport proof only. Never a model-quality or Tier 3B verdict. */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { EncryptedSqliteRunStore } from "../../pipeline_core/encrypted-store.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fixture = join(root, "evals/jrig/fixture-fetch.mjs");
const bundle = join(root, "bundle/server.mjs");
const skill = join(root, "skills/intent-outreach");
const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const names = ["list_connectors", "research_domain", "enrich_lead", "save_run", "list_pending"];
interface ToolResult { content: { type: string; text?: string }[]; isError?: boolean }
interface ModelRequest { tools?: unknown[]; messages: { role: string; content: string; tool_call_id?: string }[] }
const domain = "example.test";
const email = "riley@example.test";
const draft = { contactKey: email, channel: "email", subject: "Developer onboarding", body: "Riley, would a short discussion about developer onboarding be useful?", cta: "Open to a short discussion?" };

export async function runOfflineWiring(jrigCli: string) {
  assert(jrigCli?.startsWith("/"), "supply an absolute path to a built J-Rig CLI with --mcp-config");
  const home = await mkdtemp(join(tmpdir(), "outreach-jrig-wiring-"));
  const payloads: unknown[] = [];
  const calls: string[] = [];
  let failure: unknown;
  let research: { leads: Record<string, unknown>[]; contacts: Record<string, unknown>[] };
  let enrich: { enrichments: Record<string, unknown>[] };
  const server = createServer(async (request, response) => {
    try {
      assert.equal(request.url, "/chat/completions");
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString()) as ModelRequest;
      assert(body.tools, "this fixture expects only functional execution, no judge or trigger requests");
      const results = body.messages.filter((message) => message.role === "tool");
      const index = results.length;
      assert.equal(index, calls.length, "missing or repeated continuation");
      if (index) {
        const outer = JSON.parse(results.at(-1)?.content ?? "") as ToolResult;
        assert(!outer.isError, "bundled MCP tool returned an error");
        const value: unknown = JSON.parse(outer.content[0]?.text ?? "");
        payloads.push(value);
        if (index === 1) {
          const rows = value as { name: string; configured: boolean }[];
          assert.deepEqual(rows.filter((row) => row.configured).map((row) => row.name), ["hunter"]);
        }
        if (index === 2) {
          research = value as typeof research;
          assert.equal(research.leads[0]?.companyName, "Example Fixture Labs");
          assert.equal(research.contacts[0]?.name, "Riley Example");
        }
        if (index === 3) {
          enrich = value as typeof enrich;
          assert.equal(enrich.enrichments[0]?.verifiedEmail, email);
        }
        if (index === 4) assert.equal((value as { saved: string }).saved, "jrig-wiring");
        if (index === 5) {
          const pending = value as { total: number; pending: { digest: string; body: string }[] };
          assert.equal(pending.total, 1);
          assert.match(pending.pending[0]?.digest ?? "", /^[a-f0-9]{12}$/);
          assert.equal(pending.pending[0]?.body, draft.body);
        }
      }
      // This is a SCRIPTED client, not an evaluated model. Approved synthetic
      // fixture text is supplied here; no human approval behavior is inferred.
      const args = [
        {},
        { domain, icp: "Developer tools" },
        { domain, companyName: "Example Fixture Labs", contacts: [{ name: "Riley Example" }] },
        index === 3 ? {
          id: "jrig-wiring", icp: "Developer tools", domains: [domain], provider: "scripted-fixture", model: "no-model",
          leads: research.leads, contacts: research.contacts.map((contact) => ({ ...contact, email })),
          enrichments: enrich.enrichments, messages: [draft],
        } : {},
        { limit: 10 },
      ][index];
      const name = names[index];
      if (name) calls.push(name);
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ choices: [{ finish_reason: name ? "tool_calls" : "stop", message: name ? {
        content: "", tool_calls: [{ id: `call-${index}`, type: "function", function: { name: `outreach__${name}`, arguments: JSON.stringify(args) } }],
      } : { content: "OFFLINE_WIRING_ONLY: five actual bundled MCP calls completed; no behavioral verdict." } }], usage: { prompt_tokens: 0, completion_tokens: 0 } }));
    } catch (error) {
      failure = error;
      response.writeHead(500).end('{"error":"fixture contract failed"}');
    }
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  try {
    const address = server.address();
    assert(address && typeof address !== "string");
    const config = join(home, "mcp.json");
    await writeFile(config, JSON.stringify({ servers: { outreach: {
      command: process.execPath, args: ["--import", fixture, bundle], cwd: root,
      env: ["HOME", "INTENT_OUTREACH_HOME", "INTENT_OUTREACH_SECRETS_FILE", "INTENT_OUTREACH_PUBLIC_RECORDS", "HUNTER_API_KEY"], tools: names,
    } }, limits: { maxTurns: 6, maxCalls: 5, timeoutMs: 30000 } }), { mode: 0o600 });
    await writeFile(join(home, "secrets.json"), "{}", { mode: 0o600 });
    const spec = join(home, "wiring.yaml");
    await writeFile(spec, `spec_version: "1.0"\nskill_name: intent-outreach\ndescription: Scripted transport wiring only; never a behavioral verdict\ncriteria:\n  - id: wiring-output\n    description: Scripted transport returned its completion marker, not a model-quality verdict\n    method: deterministic\n    deterministic_check: contains\n    deterministic_check_params:\n      value: OFFLINE_WIRING_ONLY\ntest_cases:\n  - id: wiring-only\n    description: Scripted MCP transport integration only\n    tier: core\n    prompt: Exercise the five bundled tools against synthetic fixtures.\nmodels: [wiring-fixture]\n`);
    await promisify(execFile)(process.execPath, [jrigCli, "eval", skill, "--spec", spec, "--provider", "openai", "--models", "wiring-fixture", "--no-trigger", "--mcp-config", config, "--db", join(home, "jrig.db"), "--json"], {
      timeout: 45000, maxBuffer: 1048576,
      env: { PATH: process.env.PATH, HOME: home, INTENT_OUTREACH_HOME: home, INTENT_OUTREACH_SECRETS_FILE: join(home, "secrets.json"),
        INTENT_OUTREACH_PUBLIC_RECORDS: "0", HUNTER_API_KEY: "jrig-offline-fixture", OPENAI_API_KEY: "jrig-loopback-only",
        LLM_BASE_URL: `http://127.0.0.1:${address.port}`, LLM_MODEL: "wiring-fixture" },
    });
    if (failure) throw failure;
    assert.deepEqual(calls, names);
    assert.equal(payloads.length, 5);
    const evidenceDb = new DatabaseSync(join(home, "jrig.db"), { readOnly: true });
    let toolEvents: { tool: string; status: string }[];
    try {
      const records = evidenceDb.prepare("SELECT relative_path, sha256 FROM artifacts WHERE artifact_type = 'tool-execution'").all() as { relative_path: string; sha256: string }[];
      assert.equal(records.length, 1);
      const record = records[0];
      assert(record);
      const bytes = await readFile(record.relative_path);
      assert.equal(record.sha256, "sha256:" + hash(bytes));
      const receipt = JSON.parse(bytes.toString()) as { cases: { output: { tool_calls: number; artifacts: { filename: string; content: string }[] } }[] };
      const output = receipt.cases[0]?.output;
      assert.equal(output?.tool_calls, 5);
      toolEvents = JSON.parse(output?.artifacts.find((artifact) => artifact.filename === "tool-events.json")?.content ?? "null");
      assert.deepEqual(toolEvents.map((event) => event.tool), names.map((name) => `outreach__${name}`));
      assert(toolEvents.every((event) => event.status === "completed"));
    } finally { evidenceDb.close(); }
    const runs = await new EncryptedSqliteRunStore(join(home, "runs.sqlite"), { keyPath: join(home, "runs.sqlite.key") }).listRuns();
    assert.equal(runs.length, 1);
    assert.equal(runs[0]?.messages.length, 1);
    assert.equal(runs[0]?.messages[0]?.body, draft.body);
    assert.equal(runs[0]?.messages[0]?.needsSenderIdentity, true);
    assert.equal(runs[0]?.contacts[0]?.email, email);
    assert(!((await readFile(join(home, "runs.sqlite"))).includes(Buffer.from(draft.body))));
    const requests = (await readFile(join(home, "fetches.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line) as { path: string });
    assert.deepEqual(requests.map((request) => request.path), ["/v2/domain-search", "/v2/email-finder"]);
    const pid = Number(await readFile(join(home, "mcp.pid"), "utf8"));
    assert.throws(() => process.kill(pid, 0), "MCP child must have exited");
    return {
      schema: "intent-outreach-jrig-wiring/v1", observed_at: new Date().toISOString(),
      scope: "scripted_loopback_model_and_fixture_vendor_transport", behavioral_verdict: null, tier3b_passed: false,
      production_changed: false, paid_model_calls: 0, vendor_network_calls: 0, messages_sent: 0,
      observed_mcp_calls: calls, fixture_http_paths: requests.map((request) => request.path),
      tool_events: toolEvents,
      verified: { actual_bundle: true, research_and_enrichment: true, validated_encrypted_save: true, jrig_receipt_matches: true, pending_exact_draft: true, missing_sender_flagged: true, child_stopped: true },
      sha256: { bundle: hash(await readFile(bundle)), skill: hash(await readFile(join(skill, "SKILL.md"))), jrig_cli: hash(await readFile(jrigCli)), fixture: hash(await readFile(fixture)), harness: hash(await readFile(fileURLToPath(import.meta.url))) },
    };
  } finally {
    server.closeAllConnections();
    await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()));
    await rm(home, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const jrigCli = process.argv[2];
  const output = process.argv[3];
  if (!jrigCli) throw new Error("Usage: tsx evals/jrig/offline-wiring.ts /absolute/jrig/dist/index.js [receipt.json]");
  const receipt = JSON.stringify(await runOfflineWiring(jrigCli), null, 2) + "\n";
  if (output) await writeFile(output, receipt, { flag: "wx", mode: 0o600 });
  process.stdout.write(receipt);
}
