/** Run the actual case runner against scripted HTTP models, including regression and failure. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCase } from "./run-case.js";

export async function runCaseRunnerProof(jrigCli: string) {
  assert(isAbsolute(jrigCli), "absolute built J-Rig CLI required");
  const root = resolve(import.meta.dirname, "../..");
  const directory = await mkdtemp(join(tmpdir(), "outreach-case-runner-proof-"));
  let broken = false;
  let cancelling = false;
  const requests: { model: string; phase: string }[] = [];
  const errors: unknown[] = [];
  const server = createServer(async (request, response) => {
    try {
      assert.equal(request.url, "/v1/chat/completions");
      assert.equal(request.headers.authorization, "Bearer fixture-only");
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString());
      const phase = body.tools ? "execution" : body.model === "fixture-judge" ? "judge" : "trigger";
      requests.push({ model: body.model, phase });
      if (phase === "execution" && cancelling) {
        process.kill(process.pid, "SIGTERM");
        return;
      }
      if (phase === "execution" && broken) {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ choices: [], usage: { prompt_tokens: 11, completion_tokens: 5 } }));
        return;
      }
      const text = phase === "execution" ? "I cannot check current weather here; no outreach campaign was started."
        : phase === "judge" ? JSON.stringify({ verdict: "yes", confidence: 1, reasoning: "Scripted component judgment only." })
        : JSON.stringify({ selected: null, reasoning: "Scripted unrelated control." });
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: text } }], usage: { prompt_tokens: 11, completion_tokens: 5 } }));
    } catch (error) { errors.push(error); response.writeHead(500).end('{"error":"fixture contract failed"}'); }
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  try {
    const address = server.address();
    assert(address && typeof address !== "string");
    const config = { jrigCli, jrigSha256: createHash("sha256").update(await readFile(jrigCli)).digest("hex"),
      caseId: "unrelated-weather", provider: "openai", model: "fixture-execution", judgeModel: "fixture-judge",
      baseUrl: `http://127.0.0.1:${address.port}/v1`, evidenceKind: "component-test" };
    const firstDir = join(directory, "first");
    const first = await runCase({ ...config, outputDir: firstDir }, "fixture-only");
    assert.equal(first.caseResult, "pass", first.evidenceError ?? "first run failed");
    assert.equal(first.tier3bPassed, false);
    assert.equal(first.judgments.length, 4);
    const repeat = await runCase({ ...config, outputDir: join(directory, "repeat"), priorReceipt: join(firstDir, "receipt.json") }, "fixture-only");
    assert.equal(repeat.caseResult, "pass", repeat.evidenceError ?? "repeat failed");
    assert(repeat.priorReceiptSha256);
    assert(repeat.jrigResult);
    const promotion = repeat.jrigResult.promotion as { regression: { enabled: boolean } };
    assert(promotion);
    assert.equal(promotion.regression.enabled, true);
    const allIds = [...(first.evidence?.bindings ?? []), ...(repeat.evidence?.bindings ?? [])].map((entry) => entry.sessionId);
    assert.equal(new Set(allIds).size, 4);
    broken = true;
    const failed = await runCase({ ...config, outputDir: join(directory, "failed") }, "fixture-only");
    assert.equal(failed.caseResult, "incomplete");
    assert.equal(failed.processResult.code, 2);
    assert.equal(failed.jrigResult?.gate_decision, "error");
    assert.equal(failed.tier3bPassed, false);
    assert(failed.evidence?.bindings.every((entry) => entry.status === "failed" && !entry.passed && entry.audit.incomplete.length === 0));
    cancelling = true;
    const cancelled = await runCase({ ...config, outputDir: join(directory, "cancelled") }, "fixture-only");
    assert.equal(cancelled.caseResult, "incomplete");
    assert.equal(cancelled.processResult.cancelled, true);
    const cancelledPid = cancelled.processResult.pid;
    assert(cancelledPid);
    // SIGKILL delivery and orphan reaping may finish after the CLI's close event.
    let gone = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      try { process.kill(-cancelledPid, 0); }
      catch (error) { assert.equal((error as NodeJS.ErrnoException).code, "ESRCH"); gone = true; break; }
      await new Promise((done) => setTimeout(done, 50));
    }
    assert(gone, "cancelled evaluation process group survived");
    assert.deepEqual(errors, []);
    const counts = Object.fromEntries(["trigger", "execution", "judge"].map((phase) => [phase, requests.filter((item) => item.phase === phase).length]));
    assert.equal(counts.judge, 36);
    assert(requests.filter((item) => item.phase === "judge").every((item) => item.model === "fixture-judge"));
    assert(requests.filter((item) => item.phase !== "judge").every((item) => item.model === "fixture-execution"));
    const hashes = Object.fromEntries(await Promise.all(["run-case.ts", "case-runner-proof.ts"].map(async (name) => [name, createHash("sha256").update(await readFile(join(root, "evals/jrig", name))).digest("hex")])));
    return { schema: "intent-outreach-case-runner-proof/v1", scope: "scripted_actual_cli_case_runner_only", observedAt: new Date().toISOString(),
      behavioralVerdict: null, tier3bPassed: false, paidModelCalls: 0, vendorNetworkCalls: 0, messagesSent: 0,
      verified: { originalCriteriaRetained: true, explicitJudgeModel: true, threeSamples: true, distinctSkillBaselineAndRepeat: true,
        realRegressionEnabled: true, malformedExecutionHasNoVerdict: true, partialReceiptsRetained: true, cancellationStopsOwnedGroup: true, temporaryFixturesRemoved: true },
      counts, results: [first, repeat, failed, cancelled].map((item) => ({ caseResult: item.caseResult, processResult: item.processResult, priorReceiptSha256: item.priorReceiptSha256 })),
      sha256: { ...hashes, inputSpec: first.inputSpecSha256, jrigCli: config.jrigSha256 },
    };
  } finally {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
    await rm(directory, { recursive: true, force: true });
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cli = process.argv[2];
  const output = process.argv[3];
  assert(cli && output, "Usage: tsx evals/jrig/case-runner-proof.ts /absolute/jrig/dist/index.js /new/receipt.json");
  const result = await runCaseRunnerProof(cli);
  await writeFile(output, JSON.stringify(result, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  process.stdout.write(JSON.stringify(result) + "\n");
}
