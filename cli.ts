#!/usr/bin/env node
/**
 * cli.ts — the standalone `intent-outreach` command.
 *
 * The non-Claude-Code path: run a campaign from the terminal with your own keys.
 * Same pipeline_core as the plugin/MCP surface — this is just a thin entrypoint.
 * Local-only: writes runs to your own JSONL store; no network beyond the
 * provider/connector APIs you opted into with your keys.
 *
 * Exit codes: 0 ok · 1 runtime failure · 2 usage error (bad/missing flags).
 */

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { loadProfileRef, normalizeDomain, runCampaign } from "./pipeline_core/pipeline.js";
import { applyProfileToCampaignInput, type ReportProfile } from "./pipeline_core/profiles.js";
import { cleanBuyerTitles } from "./pipeline_core/targeting.js";
import { JsonlRunStore, defaultStorePath } from "./pipeline_core/store.js";
import { getConnectors, registerBuiltinConnectors } from "./pipeline_core/connectors/index.js";
import {
  detectProvider,
  getProvider,
  listProviderStatus,
  type ProviderName,
} from "./pipeline_core/providers.js";
import {
  addSuppression,
  defaultSuppressionsPath,
  readSuppressions,
  removeSuppression,
} from "./pipeline_core/suppressions.js";
import { SUPPRESSION_KINDS, type SuppressionKind } from "./pipeline_core/compliance/suppression.js";
import { checkSendable } from "./pipeline_core/compliance/send.js";
import { approvalVerdict, decide, listPending, readApprovals, recipientMatches } from "./pipeline_core/approvals.js";
import { userInfo } from "node:os";
import { join } from "node:path";
import { FileResponseCache } from "./pipeline_core/routing.js";
import { intentOutreachHome } from "./pipeline_core/secrets.js";
import { ConsentRecordSchema } from "./pipeline_core/compliance/consent.js";
import { ChannelSchema, ContactPointSchema } from "./pipeline_core/models.js";
import { registerBuiltinPacks, resolvePack } from "./pipeline_core/packs/index.js";
import { loadSuppressionList } from "./pipeline_core/suppressions.js";
import { z } from "zod";

/** A bad or missing flag: printed to stderr, exit code 2. */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

/** Upper bound for --max-contacts (a runaway value would burn LLM spend per lead). */
export const MAX_CONTACTS_LIMIT = 50;

function makeRunId(): string {
  return `run-${new Date().toISOString().replace(/[:.]/g, "-")}`;
}

/** Parse a numeric flag strictly: the whole string must be a finite number in [min, max]. */
export function parseNumberFlag(
  flag: string,
  raw: string,
  { min, max, integer = false }: { min: number; max: number; integer?: boolean },
): number {
  const trimmed = raw.trim();
  const n = trimmed === "" ? Number.NaN : Number(trimmed);
  if (!Number.isFinite(n)) throw new UsageError(`${flag} must be a number, got ${JSON.stringify(raw)}`);
  if (integer && !Number.isInteger(n)) throw new UsageError(`${flag} must be a whole number, got ${JSON.stringify(raw)}`);
  if (n < min || n > max) throw new UsageError(`${flag} must be between ${min} and ${max}, got ${n}`);
  return n;
}

/** Split, normalize and dedupe --domains; any invalid entry is a usage error. */
export function parseDomainsFlag(raw: string): string[] {
  const parts = raw
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
  if (parts.length === 0) throw new UsageError("--domains is empty");
  const out: string[] = [];
  for (const part of parts) {
    let domain: string;
    try {
      domain = normalizeDomain(part);
    } catch (err) {
      throw new UsageError(`--domains: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!out.includes(domain)) out.push(domain);
  }
  return out;
}

/** Split + trim --buyer-titles ("CTO, COO,VP Operations"); an all-blank list is a usage error. */
export function parseBuyerTitlesFlag(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const t = part.trim();
    if (t && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  if (out.length === 0) throw new UsageError("--buyer-titles is empty");
  return out;
}

/**
 * The buyer titles a run targets: --buyer-titles wins, else the profile's
 * `filtering.contactTitles`, else none (undefined ⇒ no ranking, today's order).
 */
export function resolveBuyerTitles(
  flag: string[] | undefined,
  profile: Pick<ReportProfile, "filtering"> | undefined,
): string[] | undefined {
  const titles = cleanBuyerTitles(flag ?? profile?.filtering?.contactTitles);
  return titles.length > 0 ? titles : undefined;
}

export function parseChannelFlag(raw: string): "email" | "linkedin" {
  if (raw === "email" || raw === "linkedin") return raw;
  throw new UsageError(`--channel must be "email" or "linkedin", got ${JSON.stringify(raw)}`);
}

/**
 * Exit quietly when stdout's reader goes away (`intent-outreach connectors | head -1`):
 * EPIPE is a normal end of a pipeline, not a crash. Any other stream error is rethrown.
 */
export function installEpipeHandler(
  stream: NodeJS.EventEmitter = process.stdout,
  exit: (code: number) => void = (code) => process.exit(code),
): void {
  stream.on("error", (err: NodeJS.ErrnoException) => {
    if (err?.code === "EPIPE") {
      exit(0);
      return;
    }
    throw err;
  });
}

export function printHelp(): void {
  process.stdout.write(
    [
      "intent-outreach — model-agnostic SDR orchestrator (local, BYO keys)",
      "",
      "Usage:",
      "  intent-outreach run --icp <text> --domains <a.com,b.com> [options]",
      "  intent-outreach connectors          list connectors + whether each is configured",
      "  intent-outreach providers           list model providers + gate status",
      "  intent-outreach suppress add <email|domain|phone|\"address\"> [--kind <k>] [--reason <text>]",
      "  intent-outreach suppress remove <value> [--kind <k>]",
      "  intent-outreach suppress list       opt-outs honored by every run",
      "  intent-outreach approvals pending   drafts waiting for a person to approve or reject",
      "  intent-outreach approvals approve <runId> <contactKey> --digest <hex> [--note <text>]",
      "  intent-outreach approvals reject <runId> <contactKey> [--note <text>]",
      "  intent-outreach check-send [--profile <p>] < message.json",
      "                                      send-time compliance verdict (JSON); exit 0 sendable, 3 not",
      "  intent-outreach help",
      "",
      "run options:",
      "  --icp <text>            (required) ideal customer profile / offer",
      "  --domains <list>        (required) comma-separated company domains",
      "  --profile <path|name>   Report Profile (sender identity for the CAN-SPAM footer, tone,",
      "                          channel, min score); a name is looked up in ./profiles,",
      "                          $INTENT_OUTREACH_HOME/profiles, then the bundled profiles",
      "  --provider <name>       anthropic | openai | minimax | xai (default: auto-detect)",
      "  --model <id>            override the model id",
      "  --channel <email|linkedin>   default: email (or the profile's)",
      "  --min-score <0-100>     skip drafting below this fit score (default: 0)",
      `  --max-contacts <1-${MAX_CONTACTS_LIMIT}>   contacts to draft per lead (default: 1)`,
      "  --buyer-titles <list>   comma-separated buyer titles (e.g. \"CTO,COO,VP Operations\"):",
      "                          contacts are ranked buyers-first before drafting and Apollo",
      "                          reveals are aimed at them; overrides profile filtering.contactTitles",
      "  --budget-credits <n>    vendor-credit ceiling for the run: paid calls stop before crossing it",
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
  const statuses = listProviderStatus();
  for (const p of statuses) {
    const mark = p.configured ? "✓" : "·";
    const gate = p.supported ? "supported" : "ungated (run evals)";
    process.stdout.write(
      `${mark} ${p.name.padEnd(10)} ${gate.padEnd(20)} default=${p.defaultModel.padEnd(20)} keys=${p.keyEnvVars.join("|")}\n`,
    );
  }
  // detectProvider() falls back to "anthropic" with no keys at all — don't claim
  // a provider was detected when none is configured.
  const detected = statuses.some((p) => p.configured) ? detectProvider() : "none configured";
  process.stdout.write(`\nauto-detected provider: ${detected}\n`);
}

async function cmdRun(args: string[]): Promise<void> {
  let values;
  try {
    ({ values } = parseArgs({
      args,
      options: {
        icp: { type: "string" },
        domains: { type: "string" },
        profile: { type: "string" },
        provider: { type: "string" },
        model: { type: "string" },
        channel: { type: "string" },
        "min-score": { type: "string" },
        "max-contacts": { type: "string" },
        "buyer-titles": { type: "string" },
        "budget-credits": { type: "string" },
        out: { type: "string" },
        json: { type: "boolean" },
      },
      allowPositionals: false,
    }));
  } catch (err) {
    throw new UsageError(err instanceof Error ? err.message : String(err));
  }

  if (!values.icp || !values.domains) throw new UsageError("--icp and --domains are required");

  // Validate every flag BEFORE spending anything (provider, connectors).
  const domains = parseDomainsFlag(values.domains);
  const minScore =
    values["min-score"] !== undefined
      ? parseNumberFlag("--min-score", values["min-score"], { min: 0, max: 100 })
      : undefined;
  const maxContacts =
    values["max-contacts"] !== undefined
      ? parseNumberFlag("--max-contacts", values["max-contacts"], { min: 1, max: MAX_CONTACTS_LIMIT, integer: true })
      : undefined;
  const budgetCredits =
    values["budget-credits"] !== undefined
      ? parseNumberFlag("--budget-credits", values["budget-credits"], { min: 0, max: 1_000_000 })
      : undefined;
  const channel = values.channel !== undefined ? parseChannelFlag(values.channel) : undefined;
  const flagBuyerTitles =
    values["buyer-titles"] !== undefined ? parseBuyerTitlesFlag(values["buyer-titles"]) : undefined;

  const id = makeRunId();
  let profileOverrides = {};
  let profile: ReportProfile | undefined;
  if (values.profile !== undefined) {
    try {
      profile = loadProfileRef(values.profile);
    } catch (err) {
      throw new UsageError(`--profile: ${err instanceof Error ? err.message : String(err)}`);
    }
    // Profile supplies defaults; explicit flags below win.
    profileOverrides = Object.fromEntries(
      Object.entries(applyProfileToCampaignInput(profile, { id, icp: values.icp, domains })).filter(
        ([, v]) => v !== undefined,
      ),
    );
  }
  const buyerTitles = resolveBuyerTitles(flagBuyerTitles, profile);

  // Resolve an explicit provider only when overridden; else core auto-detects from env.
  const provider =
    values.provider || values.model
      ? await getProvider({
          ...(values.provider ? { provider: values.provider as ProviderName } : {}),
          ...(values.model ? { model: values.model } : {}),
        })
      : undefined;

  const { run, cost } = await runCampaign({
    id,
    icp: values.icp,
    domains,
    ...profileOverrides,
    ...(channel !== undefined ? { channel } : {}),
    ...(provider ? { provider } : {}),
    ...(minScore !== undefined ? { minScore } : {}),
    ...(maxContacts !== undefined ? { maxContactsPerLead: maxContacts } : {}),
    ...(buyerTitles ? { buyerTitles } : {}),
    ...(budgetCredits !== undefined ? { budgetCredits } : {}),
    // Only connectors that declare cacheTtlMs are cached; files are 0600 under the local home.
    cache: new FileResponseCache(join(intentOutreachHome(), "cache")),
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
        run.blockedContacts.length ? `blocked contacts: ${run.blockedContacts.length}` : "",
        run.rejectedDrafts.length ? `rejected drafts: ${run.rejectedDrafts.length}` : "",
        run.skippedConnectors.length ? `skipped connectors: ${run.skippedConnectors.join(", ")}` : "",
        ...run.complianceWarnings.map((w) => `WARNING: ${w}`),
        `cost: $${cost.spentUsd.toFixed(4)} over ${cost.calls} model calls`,
        `saved → ${values.out ?? defaultStorePath()}`,
      ]
        .filter(Boolean)
        .join("\n") + "\n",
    );
  }
}

const SUPPRESS_USAGE =
  "usage: intent-outreach suppress add <value> [--kind email|domain|phone|address] [--reason <text>]" +
  " | remove <value> [--kind <k>] | list\n" +
  '  the kind is inferred when --kind is omitted; quote a mailing address: "12 Main St, Foley, AL 36535"';

/** `suppress add|remove|list` — manage the local opt-out list (suppressions.jsonl, mode 0600). */
async function cmdSuppress(args: string[]): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs({
      args,
      options: { reason: { type: "string" }, kind: { type: "string" } },
      allowPositionals: true,
    });
  } catch {
    throw new UsageError(SUPPRESS_USAGE);
  }
  const { values, positionals } = parsed;
  if (values.kind !== undefined && !SUPPRESSION_KINDS.includes(values.kind as SuppressionKind)) {
    throw new UsageError(SUPPRESS_USAGE);
  }
  const kindOpt = values.kind !== undefined ? { kind: values.kind as SuppressionKind } : {};
  const [action, target, ...extra] = positionals;
  const path = defaultSuppressionsPath();
  if (action === "list" && target === undefined) {
    const entries = await readSuppressions(path);
    if (entries.length === 0) process.stdout.write(`no suppressions (${path})\n`);
    for (const e of entries) {
      process.stdout.write(
        `${e.kind.padEnd(7)} ${e.value.padEnd(40)} ${e.addedAt}${e.reason ? `  ${e.reason}` : ""}\n`,
      );
    }
    return;
  }
  if ((action === "add" || action === "remove") && target && extra.length === 0) {
    if (action === "add") {
      const { entry, added } = await addSuppression(target, {
        ...kindOpt,
        ...(values.reason ? { reason: values.reason } : {}),
      });
      process.stdout.write(
        `${added ? "suppressed" : "already suppressed"}: ${entry.kind} ${entry.value} → ${path}\n`,
      );
      if (entry.kind === "address") {
        process.stderr.write(
          "note: runs do not carry mailing addresses yet, so pipeline runs cannot enforce this entry;" +
            " a send-time check that holds the address does (checkSuppression).\n",
        );
      }
    } else {
      const removed = await removeSuppression(target, kindOpt);
      process.stdout.write(`${removed ? "removed" : "not on the list"}: ${target} (${path})\n`);
    }
    return;
  }
  throw new UsageError(SUPPRESS_USAGE);
}

const APPROVALS_USAGE =
  "usage: intent-outreach approvals pending [--json]\n" +
  "       intent-outreach approvals approve <runId> <contactKey> --digest <hex> [--note <text>]\n" +
  "       intent-outreach approvals reject <runId> <contactKey> [--note <text>]\n" +
  "  approve needs the digest `pending` prints for that exact message; editing a draft voids its approval";

/** `approvals pending|approve|reject` — the human approval queue (approvals.jsonl, 0600). */
async function cmdApprovals(args: string[]): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs({
      args,
      options: { digest: { type: "string" }, note: { type: "string" }, json: { type: "boolean" }, out: { type: "string" } },
      allowPositionals: true,
    });
  } catch {
    throw new UsageError(APPROVALS_USAGE);
  }
  const { values, positionals } = parsed;
  const [action, runId, contactKey, ...extra] = positionals;
  const store = new JsonlRunStore(values.out);
  if (action === "pending" && runId === undefined) {
    const pending = await listPending(store);
    if (values.json) {
      process.stdout.write(`${JSON.stringify(pending, null, 2)}\n`);
      return;
    }
    if (pending.length === 0) process.stdout.write("nothing waiting for approval\n");
    for (const p of pending) {
      process.stdout.write(
        `\n${p.runId}  ${p.contactKey}  ${p.channel}  digest ${p.digest}` +
          `${p.fitScore !== undefined ? `  fit ${p.fitScore}` : ""}${p.needsSenderIdentity ? "  NEEDS SENDER IDENTITY" : ""}\n` +
          `${p.subject ? `Subject: ${p.subject}\n` : ""}${p.body}\nCTA: ${p.cta}\n`,
      );
    }
    return;
  }
  if ((action === "approve" || action === "reject") && runId && contactKey && extra.length === 0) {
    if (action === "approve" && !values.digest) throw new UsageError(APPROVALS_USAGE);
    const record = await decide({
      store,
      runId,
      contactKey,
      decision: action === "approve" ? "approved" : "rejected",
      by: userInfo().username || "cli",
      note: values.note,
      digest: values.digest,
      now: () => new Date().toISOString(),
    });
    process.stdout.write(`${record.decision}: ${record.runId} ${record.contactKey} (${record.messageSha256.slice(0, 12)})\n`);
    return;
  }
  throw new UsageError(APPROVALS_USAGE);
}

const CHECK_SEND_USAGE =
  "usage: intent-outreach check-send [--profile <name|path>] < input.json\n" +
  '  input: {"message":{"channel","body","needsSenderIdentity"?},"channel","contactPoint"?,"contactEmail"?,' +
  '"now"?,"consents"?,"recipientState"?,"pack"?,"runId","contactKey"}\n' +
  "  the message must match an approved draft exactly (intent-outreach approvals pending / approve)";

const CheckSendInputSchema = z.object({
  message: z.object({
    channel: ChannelSchema,
    subject: z.string().nullable().optional(),
    body: z.string().min(1),
    cta: z.string().nullable().optional(),
    needsSenderIdentity: z.boolean().optional(),
  }),
  /** The stored run and contact the message came from, to look up its approval. */
  runId: z.string().min(1).optional(),
  contactKey: z.string().min(1).optional(),
  channel: ChannelSchema,
  contactPoint: ContactPointSchema.optional(),
  contactEmail: z.string().email().optional(),
  /** Defaults to the current time: the CLI is the I/O boundary that reads the clock. */
  now: z.string().datetime({ offset: true }).optional(),
  consents: z.array(ConsentRecordSchema).default([]),
  recipientState: z.string().regex(/^[A-Z]{2}$/).optional(),
  /** Pack whose channel policy applies (tighten-only). Defaults to b2b-sdr. */
  pack: z.string().min(1).optional(),
});

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * `check-send` — the send-time check for dispatchers outside this process
 * (coastal's Python dispatcher shells out to it). Reads one JSON input on stdin,
 * applies the local suppression list and the profile's sender identity, prints
 * the verdict as JSON, and exits 0 when sendable, 3 when not, 2 on bad input.
 */
async function cmdCheckSend(args: string[], stdin: () => Promise<string> = readStdin): Promise<void> {
  let values: { profile?: string | undefined; out?: string | undefined };
  try {
    ({ values } = parseArgs({ args, options: { profile: { type: "string" }, out: { type: "string" } }, allowPositionals: false }));
  } catch {
    throw new UsageError(CHECK_SEND_USAGE);
  }
  let parsed: z.infer<typeof CheckSendInputSchema>;
  try {
    parsed = CheckSendInputSchema.parse(JSON.parse(await stdin()));
  } catch (err) {
    const why = err instanceof z.ZodError ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : "not valid JSON";
    throw new UsageError(`check-send: invalid input (${why})\n${CHECK_SEND_USAGE}`);
  }
  let sender;
  if (values.profile) {
    try {
      sender = loadProfileRef(values.profile).sender;
    } catch (err) {
      throw new UsageError(`--profile: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  registerBuiltinPacks();
  const pack = resolvePack(parsed.pack ?? "b2b-sdr");
  const verdict = checkSendable({
    message: parsed.message,
    channel: parsed.channel,
    contactPoint: parsed.contactPoint,
    contactEmail: parsed.contactEmail,
    now: parsed.now ? new Date(parsed.now) : new Date(),
    consents: parsed.consents,
    suppressions: await loadSuppressionList(),
    recipientState: parsed.recipientState,
    sender,
    policy: pack.channels?.[parsed.channel],
    approval:
      parsed.runId && parsed.contactKey
        ? approvalVerdict(await readApprovals(), parsed.runId, parsed.contactKey, parsed.message)
        : "missing",
  });
  // An approval covers a text TO a contact: the recipient must be the one the stored run drafted for.
  if (parsed.runId && parsed.contactKey) {
    const run = await new JsonlRunStore(values.out).getRun(parsed.runId);
    if (!run || !run.messages.some((m) => m.contactKey === parsed.contactKey)) {
      verdict.reasons.push("run:message-not-found");
    } else if (!recipientMatches(run, parsed.contactKey, { contactPoint: parsed.contactPoint, contactEmail: parsed.contactEmail })) {
      verdict.reasons.push("recipient:mismatch");
    }
    verdict.sendable = verdict.reasons.length === 0;
  }
  process.stdout.write(`${JSON.stringify(verdict, null, 2)}\n`);
  if (!verdict.sendable) process.exitCode = 3;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case "run":
      return cmdRun(rest);
    case "connectors":
      return cmdConnectors();
    case "providers":
      return void cmdProviders();
    case "suppress":
      return cmdSuppress(rest);
    case "check-send":
      return cmdCheckSend(rest);
    case "approvals":
      return cmdApprovals(rest);
    case "help":
    case "--help":
    case "-h":
    case undefined:
      return void printHelp();
    default:
      throw new UsageError(`unknown command: ${cmd}`);
  }
}

/** True when this module is the process entrypoint (node bundle/cli.mjs, the npm bin symlink, tsx cli.ts). */
function isEntrypoint(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntrypoint()) {
  installEpipeHandler();
  main().catch((err) => {
    if (err instanceof UsageError) {
      process.stderr.write(`error: ${err.message}\n\n`);
      if (!err.message.startsWith("usage:")) process.stderr.write("run `intent-outreach help` for usage\n");
      process.exit(2);
    }
    process.stderr.write(`intent-outreach: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
