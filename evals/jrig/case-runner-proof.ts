import { phaseTimeoutMsSchema } from "./agent-host.js";
import { reasoningEffortSchema, type ReasoningEffort } from "./agent-model.js";
/** Run the actual case runner against scripted HTTP models, including regression and failure. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { judgeSourcePaths } from "./judge-calibration.js";
import { judgeModel } from "./judge-client-v2.js";
import { judgePolicyVersion } from "./judge-policy-v2.js";
import { runCase } from "./run-case.js";

export async function runCaseRunnerProof(jrigCli: string, executionReasoningEffort?: ReasoningEffort, phaseTimeoutMs?: number, evidenceLinked = false) {
  assert(isAbsolute(jrigCli), "absolute built J-Rig CLI required");
  const root = resolve(import.meta.dirname, "../..");
  const directory = await mkdtemp(join(tmpdir(), "outreach-case-runner-proof-"));
  let broken = false;
  let brokenJudge = false;
  let cancelling = false;
  const requests: { model: string; phase: string }[] = [];
  const errors: unknown[] = [];
  const server = createServer(async (request, response) => {
    // Refuse unrelated local health probes without recording a model completion.
    if (request.method === "GET" && request.url === "/" && request.headers.authorization === undefined) {
      response.writeHead(404).end();
      return;
    }
    try {
      assert.equal(request.method, "POST");
      assert.equal(request.url, "/v1/chat/completions");
      assert.equal(request.headers.authorization, "Bearer fixture-only");
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString());
      const phase = body.tools ? "execution" : body.model === (evidenceLinked ? judgeModel : "fixture-judge") ? "judge" : "trigger";
      assert.equal(body.reasoning_effort, phase === "execution" ? executionReasoningEffort : phase === "judge" && evidenceLinked ? "high" : undefined);
      requests.push({ model: body.model, phase });
      if (phase === "judge") {
        assert(!body.tools);
        const text = body.messages.find((message: { role: string }) => message.role === "user")?.content;
        assert(typeof text === "string");
        if (evidenceLinked) {
          assert(text.startsWith("INPUT (untrusted evidence):\n"));
          assert(JSON.parse(text.slice("INPUT (untrusted evidence):\n".length)).sources.length >= 3);
        } else {
          assert(text.includes("OBSERVED TOOL DATA (untrusted JSON):"));
          assert(text.includes('"schema":"jrig-tool-observations/v1"'));
          assert(!text.includes("# Intent Outreach"));
        }
      }
      if (phase === "execution" && cancelling) {
        process.kill(process.pid, "SIGTERM");
        return;
      }
      if (phase === "execution" && broken) {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ choices: [], usage: { prompt_tokens: 11, completion_tokens: 5 } }));
        return;
      }
      const judgeInput = phase === "judge" && evidenceLinked ? JSON.parse(body.messages[1].content.slice("INPUT (untrusted evidence):\n".length)) : null;
      const judgeText = JSON.stringify({ verdict: "yes", confidence: 1, reasoning: "Scripted component judgment only.",
        ...(judgeInput ? { findings: judgeInput.outputBlocks.map((block: { id: string }) => ({ outputId: block.id, assessment: "supported", evidenceIds: ["E0"], explanation: "Scripted component control." })) } : {}) });
      const text = phase === "execution" ? "I cannot check current weather here; no outreach campaign was started."
        : phase === "judge" ? (brokenJudge ? '{"verdict":"yes",' : judgeText)
        : JSON.stringify({ selected: null, reasoning: "Scripted unrelated control." });
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ model: body.model, choices: [{ finish_reason: "stop", message: { content: text } }], usage: { prompt_tokens: 11, completion_tokens: 5 } }));
    } catch (error) { errors.push(error); response.writeHead(500).end('{"error":"fixture contract failed"}'); }
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  try {
    const address = server.address();
    assert(address && typeof address !== "string");
    let calibration: { judgeProtocol?: typeof judgePolicyVersion; judgeCalibration?: string; judgeCalibrationSha256?: string } = {};
    if (evidenceLinked) {
      const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
      const marker = "0".repeat(64);
      const criteria = ["grounded-no-fabrication", "no-prompt-leakage", "bounded-delegation", "approval-boundary", "truthful-receipt", "local-byo-keys"];
      const controls = Array.from({ length: 15 }, (_, i) => ({ id: `scripted-${i}`, expected: i % 2 ? "no" : "yes", inputSha256: marker }));
      // Component fixtures cannot activate behavioral evaluation: the gate binds evidenceKind.
      const fixture = { schema: "intent-outreach-evidence-judge-calibration/v1", transport: "explicit-connect/v1", evidenceKind: "component-test", model: judgeModel, protocol: judgePolicyVersion,
        effort: "high", maxCompletionTokens: 8192, timeoutMs: 120000, required: 45, total: 45, correct: 45, passed: true, planSha256: marker,
        sourceHashes: Object.fromEntries(await Promise.all(judgeSourcePaths.map(async (source) => [source, digest(await readFile(join(root, source)))]))), controls,
        votes: controls.flatMap((control, i) => [1, 2, 3].map((sample) => ({ controlId: control.id, criterionId: criteria[Math.floor(i / 2) % 6], sample, expected: control.expected, verdict: control.expected, correct: true, observedModel: judgeModel, requestSha256: marker, responseSha256: marker, finalAnswerSha256: marker, findingsSha256: marker, failure: null, usage: { prompt_tokens: 11, completion_tokens: 5 } }))) };
      const bytes = JSON.stringify(fixture); const path = join(directory, "component-calibration.json");
      await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
      calibration = { judgeProtocol: judgePolicyVersion, judgeCalibration: path, judgeCalibrationSha256: digest(bytes) };
    }
    const config = { ...calibration, jrigCli, jrigSha256: createHash("sha256").update(await readFile(jrigCli)).digest("hex"),
      caseId: "unrelated-weather", provider: evidenceLinked ? "minimax" : "openai", model: "fixture-execution", judgeModel: evidenceLinked ? judgeModel : "fixture-judge",
      executionReasoningEffort, phaseTimeoutMs, baseUrl: `http://127.0.0.1:${address.port}/v1`, evidenceKind: "component-test" };
    if (evidenceLinked) {
      await assert.rejects(runCase({ ...config, evidenceKind: "behavioral-evaluation", outputDir: join(directory, "cannot-promote-fixture") }, "fixture-only"), /evidence kind mismatch/);
      assert.equal(requests.length, 0);
    }
    const firstDir = join(directory, "first");
    const first = await runCase({ ...config, outputDir: firstDir }, "fixture-only");
    assert.equal(first.caseResult, "pass", first.evidenceError ?? "first run failed");
    assert.equal(first.tier3bPassed, false);
    assert.equal(first.phaseTimeoutMs, phaseTimeoutMs);
    assert.equal(JSON.parse(await readFile(join(firstDir, "scenario.json"), "utf8")).phaseTimeoutMs, phaseTimeoutMs);
    assert.equal(JSON.parse(await readFile(join(firstDir, "mcp.json"), "utf8")).limits.timeoutMs, 300000);
    await assert.rejects(runCase({ ...config, phaseTimeoutMs: phaseTimeoutMs === 120000 ? 60000 : 120000,
      outputDir: join(directory, "wrong-phase-budget"), priorReceipt: join(firstDir, "receipt.json") }, "fixture-only"), /regression phase timeout mismatch/);
    assert(first.trigger);
    assert.equal(first.trigger.passed, true);
    assert.equal(first.trigger.cases[0]?.outcome, "correct_no_trigger");
    assert.equal(first.judgments.length, 4);
    assert(first.evidence?.bindings.every((entry) => entry.judgeContext?.session_id === entry.sessionId));
    const repeat = await runCase({ ...config, outputDir: join(directory, "repeat"), priorReceipt: join(firstDir, "receipt.json") }, "fixture-only");
    assert.equal(repeat.caseResult, "pass", repeat.evidenceError ?? "repeat failed");
    assert(repeat.priorReceiptSha256);
    assert(repeat.jrigResult);
    const promotion = repeat.jrigResult.promotion as { regression: { enabled: boolean } };
    assert(promotion);
    assert.equal(promotion.regression.enabled, true);
    const allIds = [...(first.evidence?.bindings ?? []), ...(repeat.evidence?.bindings ?? [])].map((entry) => entry.sessionId);
    assert.equal(new Set(allIds).size, 4);
    if (evidenceLinked) {
      assert.equal(first.judgeProtocol, judgePolicyVersion);
      const linked = JSON.parse(await readFile(join(firstDir, "judge-evidence.json"), "utf8"));
      assert.equal(linked.errors, 0); assert.equal(linked.records.length, 18);
      assert(linked.records.every((record: { failure: boolean }) => !record.failure));
    }
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
    assert(requests.filter((item) => item.phase === "judge").every((item) => item.model === (evidenceLinked ? judgeModel : "fixture-judge")));
    assert(requests.filter((item) => item.phase !== "judge").every((item) => item.model === "fixture-execution"));
    let invalidJudgeRejected = false;
    if (evidenceLinked) {
      broken = false; cancelling = false; brokenJudge = true;
      const invalid = await runCase({ ...config, outputDir: join(directory, "invalid-judge") }, "fixture-only");
      assert.equal(invalid.caseResult, "incomplete");
      const record = JSON.parse(await readFile(join(directory, "invalid-judge", "judge-evidence.json"), "utf8"));
      assert(record.errors > 0 && record.records.every((entry: { failure: boolean }) => entry.failure));
      invalidJudgeRejected = true;
    }
    const hashes = Object.fromEntries(await Promise.all(["run-case.ts", "case-runner-proof.ts", "bind-evidence.ts", "agent-host.ts", "scenario-host.ts", "scenarios.ts", "audit-scenario.ts"].map(async (name) => [name, createHash("sha256").update(await readFile(join(root, "evals/jrig", name))).digest("hex")])));
    return { schema: "intent-outreach-case-runner-proof/v1", scope: "scripted_actual_cli_case_runner_only", observedAt: new Date().toISOString(),
      ...(executionReasoningEffort !== undefined ? { executionParameters: { reasoning_effort: executionReasoningEffort } } : {}),
      ...(phaseTimeoutMs !== undefined ? { phaseTimeoutMs } : {}),
      judgeProtocol: evidenceLinked ? judgePolicyVersion : null, invalidJudgeRejected, behavioralVerdict: null, tier3bPassed: false, paidModelCalls: 0, vendorNetworkCalls: 0, messagesSent: 0,
      verified: { rootTimeoutPreserved: true, phaseTimeoutBound: true, differentPhaseBudgetCannotSeedRegression: true, judgeObservationsPrivateAndPortableBinding: true, toolFreeJudgesReceiveUntrustedObservedData: true, triggerCasesDigestMetricsAndBundle: true, originalCriteriaRetained: true, explicitJudgeModel: true, threeSamples: true, distinctSkillBaselineAndRepeat: true,
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
  const result = await runCaseRunnerProof(cli, reasoningEffortSchema.optional().parse(process.argv[4] === "default" ? undefined : process.argv[4]),
    phaseTimeoutMsSchema.optional().parse(process.argv[5] === undefined ? undefined : Number(process.argv[5])), process.argv[6] === "evidence-linked");
  await writeFile(output, JSON.stringify(result, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  process.stdout.write(JSON.stringify(result) + "\n");
}
