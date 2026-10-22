/** Explicit single-case evaluation. A case receipt is never whole-suite acceptance. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, open, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { bindScenarioEvidence, bindTriggerEvidence } from "./bind-evidence.js";
import { createAgentModel, reasoningEffortSchema } from "./agent-model.js";
import { scenarios } from "./scenarios.js";
import { phaseTimeoutMsSchema } from "./agent-host.js";
import { startJudgeGateway, type JudgeGatewayRecord } from "./judge-gateway.js";
import { readJudgeCalibration } from "./judge-calibration.js";
import { judgePolicyVersion } from "./judge-policy-v2.js";
import { judgeModel } from "./judge-client-v2.js";

const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const absolute = z.string().refine((path) => isAbsolute(path) && resolve(path) === path, "normalized absolute path required");
export const caseRunConfig = z.object({
  jrigCli: absolute, jrigSha256: z.string().regex(/^[a-f0-9]{64}$/), outputDir: absolute,
  caseId: z.string().refine((id) => Object.hasOwn(scenarios, id), "unknown reviewed case"),
  provider: z.enum(["openai", "groq", "nvidia", "deepseek", "kimi", "openrouter", "minimax"]),
  model: z.string().trim().min(1), judgeModel: z.string().trim().min(1), baseUrl: z.string().url(),
  executionReasoningEffort: reasoningEffortSchema.optional(),
  phaseTimeoutMs: phaseTimeoutMsSchema.optional(),
  evidenceKind: z.enum(["component-test", "behavioral-evaluation"]),
  priorReceipt: absolute.optional(),
  judgeProtocol: z.literal("evidence-linked/v2").optional(),
  judgeCalibration: absolute.optional(),
  judgeCalibrationSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict();
const criterion = z.object({ id: z.string(), method: z.enum(["judge", "deterministic"]), samples: z.number().int().optional() }).passthrough();
const testCase = z.object({ id: z.string(), trigger_expectation: z.enum(["should_trigger", "should_not_trigger"]), criteria_ids: z.array(z.string()).optional() }).passthrough();
const specSchema = z.object({ skill_name: z.literal("intent-outreach"), criteria: z.array(criterion).min(1), test_cases: z.array(testCase).min(1), models: z.array(z.string()), samples: z.literal(3) }).passthrough();

/** Preserve the parsed spec verbatim except for selecting one case and execution model. */
export function selectCaseSpec(raw: unknown, caseId: string, model: string) {
  const spec = specSchema.parse(raw);
  assert.equal(new Set(spec.criteria.map((item) => item.id)).size, spec.criteria.length, "duplicate criterion");
  assert.deepEqual(spec.test_cases.map((item) => item.id).sort(), Object.keys(scenarios).sort(), "review changed scenario coverage");
  const selected = spec.test_cases.find((item) => item.id === caseId);
  assert(selected, "unknown case");
  const ids = selected.criteria_ids ?? spec.criteria.map((item) => item.id);
  assert(ids.length && new Set(ids).size === ids.length, "invalid case criterion selection");
  const expected = ids.map((id) => {
    const item = spec.criteria.find((candidate) => candidate.id === id);
    assert(item, "unknown case criterion");
    assert(item.samples === undefined || item.samples >= 3, "judge sampling cannot be weakened");
    return { id, method: item.method, samples: item.samples ?? spec.samples };
  });
  assert(expected.some((item) => item.method === "judge"), "case requires meaningful judgments");
  return { spec: { ...spec, test_cases: [selected], models: [model] }, expected };
}

const vote = z.object({ criterion_id: z.string(), test_case_id: z.string(), method: z.string(), verdict: z.enum(["yes", "no", "unsure"]),
  samples: z.number().int().optional(), sample_verdicts: z.array(z.enum(["yes", "no", "unsure"])).optional() }).passthrough();
export function inspectCaseVotes(raw: unknown, expected: ReturnType<typeof selectCaseSpec>["expected"], caseId: string) {
  const votes = z.array(vote).parse(raw);
  assert.deepEqual(votes.map((item) => item.criterion_id).sort(), expected.map((item) => item.id).sort(), "missing, extra or duplicate case judgments");
  for (const item of expected) {
    const observed = votes.find((entry) => entry.criterion_id === item.id);
    assert(observed?.test_case_id === caseId && observed.method === item.method, "case judgment identity mismatch");
    if (item.method === "judge") {
      assert(observed.samples === item.samples && observed.sample_verdicts?.length === item.samples, "missing judge sample evidence");
    }
  }
  return votes;
}

export function regressionVotes(raw: unknown, config: z.infer<typeof caseRunConfig>, inputSpecSha256: string,
  sourceHashes: Record<string, string>, expected: ReturnType<typeof selectCaseSpec>["expected"]) {
  const previous = z.object({
    schema: z.literal("intent-outreach-case-run/v1"), caseResult: z.literal("pass"),
    caseId: z.literal(config.caseId), evidenceKind: z.literal(config.evidenceKind),
    inputSpecSha256: z.literal(inputSpecSha256), jrigSha256: z.literal(config.jrigSha256),
    provider: z.literal(config.provider), model: z.literal(config.model), judgeModel: z.literal(config.judgeModel),
    sourceHashes: z.record(z.string(), z.string()), judgments: z.array(vote),
    phaseTimeoutMs: phaseTimeoutMsSchema.optional(),
    executionParameters: z.object({ reasoning_effort: reasoningEffortSchema }).strict().optional(),
  }).parse(raw);
  assert.deepEqual(previous.sourceHashes, sourceHashes, "regression source mismatch");
  assert.equal(z.record(z.string(), z.unknown()).parse(raw).judgeProtocol, config.judgeProtocol, "regression judge protocol mismatch");
  assert.equal(z.record(z.string(), z.unknown()).parse(raw).judgeCalibrationSha256, config.judgeCalibrationSha256, "regression judge calibration mismatch");
  assert.equal(previous.phaseTimeoutMs, config.phaseTimeoutMs, "regression phase timeout mismatch");
  assert.deepEqual(previous.executionParameters,
    config.executionReasoningEffort === undefined ? undefined : { reasoning_effort: config.executionReasoningEffort },
    "regression reasoning profile mismatch");
  return inspectCaseVotes(previous.judgments, expected, config.caseId).map(({ criterion_id, verdict }) => ({ criterion_id, verdict }));
}

export async function invokeCaseProcess(cli: string, args: string[], env: NodeJS.ProcessEnv, directory: string, signal?: AbortSignal) {
  const stdout = await open(join(directory, "jrig.stdout.json"), "wx", 0o600);
  const stderr = await open(join(directory, "jrig.stderr.log"), "wx", 0o600);
  try {
    if (signal?.aborted) return { pid: undefined, code: null, signal: null, timedOut: false, cancelled: true };
    return await new Promise<{ pid: number | undefined; code: number | null; signal: NodeJS.Signals | null; timedOut: boolean; cancelled: boolean }>((done, reject) => {
      const child = spawn(process.execPath, ["--input-type=module", "-e",
        "process.umask(0o077); process.argv = [process.execPath, ...process.argv.slice(1)]; await import(process.argv[1]);", cli, ...args],
      { env, detached: true, stdio: ["ignore", stdout.fd, stderr.fd] });
      let timedOut = false;
      let cancelled = false;
      let force: ReturnType<typeof setTimeout> | undefined;
      const stop = (signal: NodeJS.Signals) => {
        if (!child.pid) return;
        try { process.kill(-child.pid, signal); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") reject(error); }
      };
      const interrupt = () => {
        cancelled = true;
        stop("SIGTERM");
        force ??= setTimeout(() => stop("SIGKILL"), 3000);
      };
      signal?.addEventListener("abort", interrupt, { once: true });
      process.once("SIGTERM", interrupt);
      process.once("SIGINT", interrupt);
      const timer = setTimeout(() => { timedOut = true; interrupt(); }, 1800000);
      const release = () => {
        clearTimeout(timer);
        if (force) clearTimeout(force);
        signal?.removeEventListener("abort", interrupt);
        process.removeListener("SIGTERM", interrupt);
        process.removeListener("SIGINT", interrupt);
      };
      child.once("error", (error) => { release(); reject(error); });
      child.once("close", (code, signal) => {
        // The process group is owned by this invocation, including nested children.
        if (cancelled) stop("SIGKILL");
        release();
        done({ pid: child.pid, code, signal, timedOut, cancelled });
      });
    });
  } finally { await stdout.close(); await stderr.close(); }
}

export async function runCase(raw: unknown, apiKey: string, signal?: AbortSignal) {
  const config = caseRunConfig.parse(raw);
  assert(apiKey.trim().length >= 8, "JRIG_EVAL_API_KEY must explicitly supply the model credential");
  createAgentModel({ ...config, apiKey, reasoningEffort: config.executionReasoningEffort }); // Validate the exact endpoint before any child/network activity.
  const root = resolve(import.meta.dirname, "../..");
  assert.equal(await realpath(config.jrigCli), config.jrigCli, "CLI path contains a symlink");
  assert.equal(hash(await readFile(config.jrigCli)), config.jrigSha256, "J-Rig CLI digest changed");
  // Use the YAML parser declared by the explicitly selected J-Rig installation.
  // No transitive Outreach dependency, shell parser or hand-written YAML subset.
  const require = createRequire(config.jrigCli);
  const yaml = require("yaml") as { parse(text: string): unknown };
  const source = await readFile(join(root, "skills/intent-outreach/eval-spec.yaml"));
  const { spec, expected } = selectCaseSpec(yaml.parse(source.toString()), config.caseId, config.model);
  assert(config.evidenceKind !== "behavioral-evaluation" || config.judgeProtocol, "behavioral evaluation requires qualified evidence-linked judge");
  if (config.judgeProtocol) {
    assert(config.provider === "minimax" && config.judgeModel === judgeModel, "unsupported evidence-linked judge");
    assert(config.judgeCalibration && config.judgeCalibrationSha256, "judge calibration required");
    await readJudgeCalibration(config.judgeCalibration, config.judgeCalibrationSha256, root, config.evidenceKind);
  } else assert(!config.judgeCalibration && !config.judgeCalibrationSha256, "calibration supplied without judge protocol");
  const paths = ["bundle/server.mjs", "skills/intent-outreach/SKILL.md", "skills/intent-outreach/eval-spec.yaml", "prompts/outreach.v3.md",
    "agents/outreach-researcher.md", "agents/outreach-enricher.md", "agents/outreach-drafter.md",
    "skills/intent-outreach/references/report-profiles.md", "skills/intent-outreach/references/runtime-contract.md", "pnpm-lock.yaml",
    ...["run-case.ts", "scenario-host.ts", "agent-host.ts", "agent-model.ts", "scenarios.ts", "bind-evidence.ts", "audit-scenario.ts", "fixture-fetch.mjs", "judge-policy.ts", "judge-policy-v2.ts", "judge-client-v2.ts", "judge-gateway.ts", "judge-calibration.ts"].map((path) => "evals/jrig/" + path)];
  const sourceHashes = async () => Object.fromEntries(await Promise.all(paths.map(async (path) => [path, hash(await readFile(join(root, path)))])));
  const before = await sourceHashes();
  let regression: { criterion_id: string; verdict: "yes" | "no" | "unsure" }[] | undefined;
  let priorReceiptSha256: string | null = null;
  if (config.priorReceipt) {
    const bytes = await readFile(config.priorReceipt);
    regression = regressionVotes(JSON.parse(bytes.toString()), config, hash(source), before, expected);
    priorReceiptSha256 = hash(bytes);
  }
  await mkdir(config.outputDir, { mode: 0o700 }); // Exclusive fresh directory; never reuse prior fixtures.
  assert.equal(await realpath(config.outputDir), config.outputDir, "output path contains a symlink");
  const hostsDir = join(config.outputDir, "hosts");
  await mkdir(hostsDir, { mode: 0o700 });
  const write = (name: string, data: unknown) => writeFile(join(config.outputDir, name), JSON.stringify(data, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  await write("config.json", config);
  await write("spec.json", spec);
  await write("scenario.json", { caseId: config.caseId, evidenceDir: hostsDir, provider: config.provider, model: config.model,
    ...(config.executionReasoningEffort !== undefined ? { executionReasoningEffort: config.executionReasoningEffort } : {}),
    ...(config.phaseTimeoutMs !== undefined ? { phaseTimeoutMs: config.phaseTimeoutMs } : {}),
    baseUrl: config.baseUrl, checkpoints: scenarios[config.caseId]?.checkpoints });
  const mcpConfigPath = join(config.outputDir, "mcp.json");
  await write("mcp.json", { judgeObservations: true, servers: { outreach: { command: process.execPath,
    args: ["--import", "tsx", join(root, "evals/jrig/scenario-host.ts"), join(config.outputDir, "scenario.json")], cwd: root,
    env: ["JRIG_AGENT_API_KEY"], tools: ["Agent", "Read", "AskUserQuestion", "list_connectors", "save_run", "list_pending", "approve", "reject", "suppress", "list_runs", "underwrite"],
  } }, limits: { maxTurns: 24, maxCalls: 64, timeoutMs: 300000 } });
  if (regression) await write("regression.json", regression);
  const dbPath = join(config.outputDir, "jrig.db");
  const args = ["eval", join(root, "skills/intent-outreach"), "--spec", join(config.outputDir, "spec.json"),
    "--provider", config.provider, "--models", config.model, "--judge-provider", config.provider, "--judge-model", config.judgeModel,
    "--samples", "3", "--baseline-check", "--mcp-config", mcpConfigPath, "--db", dbPath, "--emit-bundle", join(config.outputDir, "bundle.json"), "--json",
    ...(config.executionReasoningEffort !== undefined ? ["--execution-reasoning-effort", config.executionReasoningEffort] : []),
    ...(regression ? ["--regression-baseline", join(config.outputDir, "regression.json")] : [])];
  await write("started.json", { config, inputSpecSha256: hash(source), sourceHashes: before, yamlParserSha256: hash(await readFile(require.resolve("yaml"))), priorReceiptSha256, args });
  const gateway = config.judgeProtocol ? await startJudgeGateway({ apiKey, executionModel: config.model, upstream: config.baseUrl, spec,
    referenceInstructions: await readFile(join(root, "skills/intent-outreach/SKILL.md"), "utf8") }) : undefined;
  let processResult: Awaited<ReturnType<typeof invokeCaseProcess>>;
  try {
    processResult = await invokeCaseProcess(config.jrigCli, args, { PATH: process.env.PATH, HOME: config.outputDir,
      LLM_BASE_URL: gateway?.baseUrl ?? config.baseUrl, LLM_API_KEY: apiKey, LLM_MODEL: config.model, JRIG_AGENT_API_KEY: apiKey }, config.outputDir, signal);
  } finally { await gateway?.close(); }
  const judgeEvidence = gateway?.snapshot();
  if (judgeEvidence) await write("judge-evidence.json", judgeEvidence);
  let caseResult: "pass" | "fail" | "incomplete" = "incomplete";
  let evidence: Awaited<ReturnType<typeof bindScenarioEvidence>> | null = null;
  let trigger: Awaited<ReturnType<typeof bindTriggerEvidence>> | null = null;
  let judgments: z.infer<typeof vote>[] = [];
  let jrigResult: Record<string, unknown> | null = null;
  let evidenceError: string | null = null;
  try {
    assert(!processResult.timedOut && !processResult.cancelled && processResult.signal === null, "case_process_incomplete");
    assert.deepEqual(await sourceHashes(), before, "source_changed_during_execution");
    assert.equal(hash(await readFile(config.jrigCli)), config.jrigSha256, "CLI_changed_during_execution");
    assert(!judgeEvidence?.errors && !judgeEvidence?.records.some((record) => record.failure), "judge_gateway_incomplete");
    const stdout = join(config.outputDir, "jrig.stdout.json");
    assert((await stat(stdout)).size <= 16777216, "CLI_result_too_large");
    const rows = z.record(z.string(), z.record(z.string(), z.unknown())).parse(JSON.parse((await readFile(stdout)).toString()));
    assert.deepEqual(Object.keys(rows), [config.model], "unexpected_execution_models");
    jrigResult = rows[config.model] ?? null;
    assert(jrigResult?.model === config.model && jrigResult.provider === config.provider && jrigResult.ground_truth === true, "execution_identity_mismatch");
    assert(jrigResult.judge_model === config.judgeModel && jrigResult.judge_provider === config.provider, "judge_identity_mismatch");
    const executionParameters = config.executionReasoningEffort !== undefined ? { reasoning_effort: config.executionReasoningEffort } : undefined;
    assert.deepEqual(jrigResult.execution_parameters, executionParameters, "root reasoning effort mismatch");
    evidence = await bindScenarioEvidence({ dbPath, hostsDir, mcpConfigPath, caseId: config.caseId, provider: config.provider, model: config.model, serverName: "outreach", baseline: true, executionReasoningEffort: config.executionReasoningEffort, phaseTimeoutMs: config.phaseTimeoutMs });
    const bundles = z.array(z.object({ predicate: z.object({ gate_decision: z.string(), metadata: z.record(z.string(), z.unknown()) }).passthrough() })).length(1).parse(JSON.parse(await readFile(join(config.outputDir, "bundle.json"), "utf8")));
    const predicate = bundles[0]?.predicate;
    assert(predicate, "gate_evidence_missing");
    assert.deepEqual(predicate.metadata.execution_parameters, executionParameters, "portable reasoning effort mismatch");
    assert(!jrigResult.evaluation_error && !jrigResult.functional_skipped && processResult.code !== 2, "J_Rig_evaluation_incomplete");
    assert(predicate.gate_decision !== "error", "gate_evidence_incomplete");
    const triggerExpectation = z.enum(["should_trigger", "should_not_trigger"]).parse(spec.test_cases[0]?.trigger_expectation);
    trigger = await bindTriggerEvidence({ dbPath, caseId: config.caseId, expected: triggerExpectation,
      target: spec.skill_name, prompt: z.string().parse(spec.test_cases[0]?.prompt),
      siblings: z.array(z.object({ name: z.string() })).parse(z.record(z.string(), z.unknown()).parse(spec).siblings ?? []).map((item) => item.name), summary: jrigResult.trigger, bundleSummary: predicate.metadata.trigger });
    judgments = inspectCaseVotes(predicate.metadata.criteria, expected, config.caseId);
    const references = z.object({ configuration_sha256: z.literal(hash(await readFile(mcpConfigPath))), receipts: z.array(z.object({ phase: z.string(), sha256: z.string(), judge_contexts: z.array(z.unknown()) })) }).parse(predicate.metadata.tool_execution).receipts;
    assert.deepEqual(references.map((item) => [item.phase, item.sha256]).sort(), evidence.bindings.map((item) => [item.phase, item.receiptSha256]).sort(), "bundle_receipt_mismatch");
    for (const binding of evidence.bindings) {
      assert(binding.judgeContext, "missing observed judge context");
      assert.deepEqual(references.find((item) => item.phase === binding.phase)?.judge_contexts, [binding.judgeContext], "portable judge context binding mismatch");
    }
    if (judgeEvidence) {
      for (const binding of evidence.bindings) {
        const context = binding.judgeContext?.sha256.replace(/^sha256:/, "");
        const records: JudgeGatewayRecord[] = judgeEvidence.records.filter((record) => record.observationSha256 === context);
        const criteria = expected.filter((criterion) => criterion.method === "judge");
        assert.equal(records.length, criteria.reduce((sum, criterion) => sum + criterion.samples, 0), "missing gateway judge calls");
        for (const criterion of criteria) assert.equal(records.filter((record) => record.criterionId === criterion.id).length, criterion.samples, "gateway sample mismatch");
      }
      const contexts = new Set(evidence.bindings.map((binding) => binding.judgeContext?.sha256.replace(/^sha256:/, "")));
      assert(judgeEvidence.records.every((record) => contexts.has(record.observationSha256)), "unbound judge observations");
    }
    if (evidence.bindings.some((item) => item.status !== "completed" || item.audit.incomplete.length)) throw new Error("execution_or_host_incomplete");
    caseResult = trigger.passed && evidence.bindings.find((item) => item.phase === "skill")?.passed && judgments.every((item) => item.verdict === "yes") ? "pass" : "fail";
  } catch {
    // Detailed provider/tool diagnostics stay in the private original receipts.
    evidenceError = "incomplete_or_unverifiable_evaluation; inspect private CLI, bundle and host receipts";
  }
  const report = { schema: "intent-outreach-case-run/v1", caseId: config.caseId, evidenceKind: config.evidenceKind,
    caseResult, tier3bPassed: false, scope: "one_case_requires_suite_regression_variance_and_review", inputSpecSha256: hash(source),
    provider: config.provider, model: config.model, judgeModel: config.judgeModel, jrigSha256: config.jrigSha256, processResult, priorReceiptSha256,
    ...(config.executionReasoningEffort !== undefined ? { executionParameters: { reasoning_effort: config.executionReasoningEffort } } : {}),
    ...(config.phaseTimeoutMs !== undefined ? { phaseTimeoutMs: config.phaseTimeoutMs } : {}),
    judgments, trigger, evidence, evidenceError, jrigResult, sourceHashes: before,
    ...(judgeEvidence ? { judgeProtocol: judgePolicyVersion, judgeCalibrationSha256: config.judgeCalibrationSha256,
      judgeEvidenceSha256: hash(await readFile(join(config.outputDir, "judge-evidence.json"))) } : {}),
    usageScope: "jrigResult.cost covers trigger, root execution and judgment; evidence.bindings nestedUsage is additional",
  };
  await write("receipt.json", report);
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = process.argv[2];
  assert(config && isAbsolute(config), "Usage: tsx evals/jrig/run-case.ts /absolute/config.json");
  const result = await runCase(JSON.parse(await readFile(config, "utf8")), process.env.JRIG_EVAL_API_KEY ?? "");
  process.stdout.write(JSON.stringify({ caseId: result.caseId, caseResult: result.caseResult, tier3bPassed: false }) + "\n");
  process.exitCode = result.caseResult === "incomplete" ? 2 : result.caseResult === "fail" ? 1 : 0;
}
