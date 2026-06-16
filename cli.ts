#!/usr/bin/env node
/**
 * cli.ts — the standalone `intent-outreach` command.
 *
 * The non-Claude-Code path: run a campaign from the terminal with your own keys.
 * Same pipeline_core as the plugin/MCP surface — this is just a thin entrypoint.
 * Local-only: writes runs to your own JSONL store; no network beyond the
 * provider/connector APIs you opted into with your keys.
 */

import { parseArgs } from "node:util";
import { runCampaign } from "./pipeline_core/pipeline.js";
import { JsonlRunStore, defaultStorePath } from "./pipeline_core/store.js";
import { getConnectors, registerBuiltinConnectors } from "./pipeline_core/connectors/index.js";
import {
  detectProvider,
  getProvider,
  listProviderStatus,
  type ProviderName,
} from "./pipeline_core/providers.js";

function makeRunId(): string {
  return `run-${new Date().toISOString().replace(/[:.]/g, "-")}`;
}

function printHelp(): void {
  process.stdout.write(
    [
      "intent-outreach — model-agnostic SDR orchestrator (local, BYO keys)",
      "",
      "Usage:",
      "  intent-outreach run --icp <text> --domains <a.com,b.com> [options]",
      "  intent-outreach connectors          list connectors + whether each is configured",
      "  intent-outreach providers           list model providers + gate status",
      "  intent-outreach help",
      "",
      "run options:",
      "  --icp <text>            (required) ideal customer profile / offer",
      "  --domains <list>        (required) comma-separated company domains",
      "  --provider <name>       anthropic | openai | google | xai (default: auto-detect)",
      "  --model <id>            override the model id",
      "  --channel <email|linkedin>   default: email",
      "  --min-score <0-100>     skip drafting below this fit score (default: 0)",
      "  --max-contacts <n>      contacts to draft per lead (default: 1)",
      "  --out <path>            JSONL store path (default: " + defaultStorePath() + ")",
      "  --json                  print the full run as JSON",
      "",
      "Keys are read from your environment or a local secrets file — never the cloud.",
    ].join("\n") + "\n",
  );
}

async function cmdConnectors(): Promise<void> {
  registerBuiltinConnectors();
  for (const c of getConnectors()) {
    const mark = c.isConfigured() ? "✓" : "·";
    process.stdout.write(
      `${mark} ${c.name.padEnd(16)} ${c.tier.padEnd(11)} ${c.phases.join("+").padEnd(16)} ${
        c.isConfigured() ? "configured" : `set ${c.keyEnvVar ?? "(no key)"}`
      }\n`,
    );
  }
}

function cmdProviders(): void {
  for (const p of listProviderStatus()) {
    const mark = p.configured ? "✓" : "·";
    const gate = p.supported ? "supported" : "ungated (run evals)";
    process.stdout.write(
      `${mark} ${p.name.padEnd(10)} ${gate.padEnd(20)} default=${p.defaultModel.padEnd(20)} keys=${p.keyEnvVars.join("|")}\n`,
    );
  }
  process.stdout.write(`\nauto-detected provider: ${detectProvider()}\n`);
}

async function cmdRun(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      icp: { type: "string" },
      domains: { type: "string" },
      provider: { type: "string" },
      model: { type: "string" },
      channel: { type: "string" },
      "min-score": { type: "string" },
      "max-contacts": { type: "string" },
      out: { type: "string" },
      json: { type: "boolean" },
    },
    allowPositionals: false,
  });

  if (!values.icp || !values.domains) {
    process.stderr.write("error: --icp and --domains are required\n\n");
    printHelp();
    process.exit(2);
  }

  const domains = values.domains.split(",").map((d) => d.trim()).filter(Boolean);
  const channel = values.channel === "linkedin" ? "linkedin" : "email";

  // Resolve an explicit provider only when overridden; else core auto-detects from env.
  const provider =
    values.provider || values.model
      ? await getProvider({
          ...(values.provider ? { provider: values.provider as ProviderName } : {}),
          ...(values.model ? { model: values.model } : {}),
        })
      : undefined;

  const { run, cost } = await runCampaign({
    id: makeRunId(),
    icp: values.icp,
    domains,
    channel,
    ...(provider ? { provider } : {}),
    ...(values["min-score"] ? { minScore: Number(values["min-score"]) } : {}),
    ...(values["max-contacts"] ? { maxContactsPerLead: Number(values["max-contacts"]) } : {}),
  });

  const store = new JsonlRunStore(values.out);
  await store.saveRun(run);

  if (values.json) {
    process.stdout.write(JSON.stringify(run, null, 2) + "\n");
  } else {
    process.stdout.write(
      [
        `run ${run.id} — ${run.status}`,
        `provider: ${run.provider} (${run.model})`,
        `leads: ${run.leads.length}  contacts: ${run.contacts.length}  messages: ${run.messages.length}`,
        run.skippedConnectors.length ? `skipped connectors: ${run.skippedConnectors.join(", ")}` : "",
        `cost: $${cost.spentUsd.toFixed(4)} over ${cost.calls} model calls`,
        `saved → ${values.out ?? defaultStorePath()}`,
      ]
        .filter(Boolean)
        .join("\n") + "\n",
    );
  }
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "run":
      return cmdRun(rest);
    case "connectors":
      return cmdConnectors();
    case "providers":
      return void cmdProviders();
    case "help":
    case "--help":
    case "-h":
    case undefined:
      return void printHelp();
    default:
      process.stderr.write(`unknown command: ${cmd}\n\n`);
      printHelp();
      process.exit(2);
  }
}

main().catch((err) => {
  process.stderr.write(`intent-outreach: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
