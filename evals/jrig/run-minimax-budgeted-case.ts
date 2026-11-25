/** One real case, fixed MiniMax route, aggregate root/nested/judge $0.50 admission ceiling. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { caseRunConfig, runCase } from "./run-case.js";
import { startMiniMaxBudgetProxy } from "./minimax-budget-proxy.js";

process.umask(0o077);
const path = process.argv[2];
assert(path && isAbsolute(path), "supply an absolute original case config path");
const config = caseRunConfig.parse(JSON.parse(await readFile(path, "utf8")));
assert(config.provider === "minimax" && config.model === "MiniMax-M3" && config.judgeModel === "MiniMax-M3" &&
  config.baseUrl === "https://api.minimax.io/v1" && config.phaseTimeoutMs === 120000 && config.evidenceKind === "behavioral-evaluation",
"fixed original MiniMax M3 behavioral profile with phase120 required");
const key = process.env.MINIMAX_API_KEY;
assert(key, "launch with scripts/with-minimax.py");
const helpers = ["minimax-budget-proxy.ts", "run-minimax-budgeted-case.ts", "run-case.ts"];
const sourceHashes = async () => Object.fromEntries(await Promise.all(helpers.map(async (name) => [name, createHash("sha256").update(await readFile(new URL(name, import.meta.url))).digest("hex")])));
const before = await sourceHashes();
const configSha256 = createHash("sha256").update(await readFile(path)).digest("hex");
const proxy = await startMiniMaxBudgetProxy(key);
// The real credential belongs only to the forwarding closure; children get an ephemeral bearer.
for (const name of ["MINIMAX_API_KEY", "LLM_API_KEY", "JRIG_EVAL_API_KEY", "JRIG_AGENT_API_KEY"]) delete process.env[name];
const cancellation = new AbortController();
const interrupt = () => { cancellation.abort(); void proxy.close(); };
process.once("SIGINT", interrupt); process.once("SIGTERM", interrupt);
try {
  const result = await runCase({ ...config, baseUrl: proxy.baseUrl }, proxy.bearer, cancellation.signal);
  process.stdout.write(JSON.stringify({ caseId: result.caseId, caseResult: result.caseResult, transport: "explicit_loopback_budget_proxy", sends: 0 }) + "\n");
  process.exitCode = result.caseResult === "incomplete" ? 2 : result.caseResult === "fail" ? 1 : 0;
} finally {
  await proxy.close();
  process.removeListener("SIGINT", interrupt); process.removeListener("SIGTERM", interrupt);
  await writeFile(config.outputDir + ".budget.json", JSON.stringify({ ...proxy.snapshot(), configSha256, helperSourceHashes: before, helperSourceUnchanged: JSON.stringify(before) === JSON.stringify(await sourceHashes()) }, null, 2) + "\n", { mode: 0o600, flag: "wx" });
}
