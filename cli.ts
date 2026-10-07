#!/usr/bin/env node
/**
 * cli.ts — the standalone `intent-outreach` command.
 *
 * The non-Claude-Code path: run a campaign from the terminal with your own keys.
 * Same pipeline_core as the plugin/MCP surface — this is just a thin entrypoint.
 * Local-only: writes runs to your own encrypted SQLite store; no network beyond the
 * provider/connector APIs you opted into with your keys.
 *
 * Exit codes: 0 ok · 1 runtime failure · 2 usage error (bad/missing flags).
 */

import { assertCampaignRun } from "./pipeline_core/validator.js";
import { assertFreshCrmContext, parseCrmContext, mergeCrmSuppressions, crmExcludedProperties, crmExcludedParties } from "./pipeline_core/crm-context.js";
import { readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { loadProfileRef, normalizeDomain, runCampaign } from "./pipeline_core/pipeline.js";
import { runPropertyCampaign } from "./pipeline_core/property-campaign.js";
import { checkMonitor, purgeExpiredSnapshots, MonitorSchema, monitorPath, readSnapshot } from "./pipeline_core/monitors.js";
import type { ResearchQuery } from "./pipeline_core/models.js";
import { applyProfileToCampaignInput, type ReportProfile } from "./pipeline_core/profiles.js";
import { cleanBuyerTitles } from "./pipeline_core/targeting.js";
import { defaultStorePath, legacyStorePath } from "./pipeline_core/store.js";
import { EncryptedSqliteRunStore } from "./pipeline_core/encrypted-store.js";
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
import { keyStatus } from "./pipeline_core/key-quotas.js";
import { InboundInquirySchema, runInbound } from "./pipeline_core/inbound.js";
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
      "  intent-outreach property-run --icp <text> (--zips <list> | --parcels <fips:apn,...>) [options]",
      "                                      draft letters to owners of record (residential-re pack)",
      "  intent-outreach monitor add|list|check   watch ZIPs or parcels for new parcels, sales, value,",
      "                                      listing and distress changes (check --draft drafts the changes)",
      "  intent-outreach approvals pending   drafts waiting for a person to approve or reject",
      "  intent-outreach approvals approve <runId> <contactKey> --digest <hex> [--note <text>]",
      "  intent-outreach approvals reject <runId> <contactKey> [--note <text>]",
      "  intent-outreach inbound --offer <text> < inquiry.json   draft the first reply to a website inquiry",
      "  intent-outreach keys <ENV_NAME>     key variants (NAME, NAME__TEAM, ...) and monthly quota usage",
      "  intent-outreach store migrate|purge|audit [--out <runs.sqlite>]",
      "  intent-outreach check-send [--profile <p>] < message.json",
      "                                      send-time compliance verdict (JSON); exit 0 sendable, 3 not",
      "  intent-outreach validate-run < run.json   validate and normalize a run for external adapters",
      "  intent-outreach validate-crm-context < crm.json   validate a fresh ERPNext exclusion snapshot",
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
      "  --score-provider <name> / --score-model <id>   a separate (cheaper) model for scoring; --provider drafts",
      "  --channel <email|linkedin>   default: email (or the profile's)",
      "  --min-score <0-100>     skip drafting below this fit score (default: 0)",
      `  --max-contacts <1-${MAX_CONTACTS_LIMIT}>   contacts to draft per lead (default: 1)`,
      "  --buyer-titles <list>   comma-separated buyer titles (e.g. \"CTO,COO,VP Operations\"):",
      "                          contacts are ranked buyers-first before drafting and Apollo",
      "                          reveals are aimed at them; overrides profile filtering.contactTitles",
      "  --budget-credits <n>    vendor-credit ceiling for the run: paid calls stop before crossing it",
      "  --out <path>            Encrypted SQLite store path (default: " + defaultStorePath() + ")",
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

/** Resolve the optional score-seam provider (cheap scorer); undefined ⇒ the main provider scores too. */
async function scoreProviderFrom(values: Record<string, unknown>, pack = "b2b-sdr") {
  const m = values["score-model"];
  // --score-model alone keeps the run's --provider (never silently auto-detects a different vendor).
  const p = values["score-provider"] ?? values.provider;
  if (typeof values["score-provider"] !== "string" && typeof m !== "string") return undefined;
  return getProvider({
    pack,
    ...(typeof p === "string" ? { provider: p as ProviderName } : {}),
    ...(typeof m === "string" ? { model: m } : {}),
  });
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
        "score-provider": { type: "string" },
        "score-model": { type: "string" },
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
  const scoreProvider = await scoreProviderFrom(values);
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
    ...(scoreProvider ? { scoreProvider } : {}),
    // Only connectors that declare cacheTtlMs are cached; files are 0600 under the local home.
    cache: new FileResponseCache(join(intentOutreachHome(), "cache")),
  });

  const store = new EncryptedSqliteRunStore(values.out);
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

const PROPERTY_RUN_USAGE =
  "usage: intent-outreach property-run --icp <text> (--zips <a,b> | --parcels <fips:apn,...>) [options]\n" +
  "  --profile <p>  --provider <name>  --model <id>  --min-score <0-100>  --max-properties <n>\n" +
  "  --budget-credits <n>  --pack <id> (default residential-re)  --crm-context <file>  --out <path>  --json";

/** `property-run` — a property campaign (owners of record) over ZIPs or specific parcels. */
async function cmdPropertyRun(args: string[]): Promise<void> {
  let values: Record<string, string | boolean | undefined>;
  try {
    ({ values } = parseArgs({
      args,
      options: {
        icp: { type: "string" },
        "crm-context": { type: "string" },
        zips: { type: "string" },
        parcels: { type: "string" },
        profile: { type: "string" },
        provider: { type: "string" },
        model: { type: "string" },
        "score-provider": { type: "string" },
        "score-model": { type: "string" },
        pack: { type: "string" },
        "min-score": { type: "string" },
        "max-properties": { type: "string" },
        "budget-credits": { type: "string" },
        out: { type: "string" },
        json: { type: "boolean" },
      },
      allowPositionals: false,
    }));
  } catch (err) {
    throw new UsageError(`${err instanceof Error ? err.message : String(err)}\n${PROPERTY_RUN_USAGE}`);
  }
  const icp = typeof values.icp === "string" ? values.icp.trim() : "";
  if (!icp || (!values.zips && !values.parcels)) throw new UsageError(PROPERTY_RUN_USAGE);

  // Validate every flag BEFORE spending anything.
  const queries: ResearchQuery[] = [];
  if (typeof values.zips === "string") {
    const zips = values.zips.split(",").map((z) => z.trim()).filter(Boolean);
    if (zips.length === 0 || !zips.every((z) => /^\d{5}$/.test(z))) throw new UsageError("--zips must be 5-digit ZIPs, comma-separated");
    queries.push({ kind: "area", geography: { zips }, filters: {} });
  }
  if (typeof values.parcels === "string") {
    for (const ref of values.parcels.split(",").map((p) => p.trim()).filter(Boolean)) {
      const m = /^(\d{5}):(.+)$/.exec(ref);
      if (!m) throw new UsageError(`--parcels: ${JSON.stringify(ref)} is not <countyFips>:<apn>`);
      queries.push({ kind: "parcel", countyFips: m[1]!, apn: m[2]! });
    }
  }
  const num = (flag: string, opts: { min: number; max: number; integer?: boolean }) =>
    typeof values[flag] === "string" ? parseNumberFlag(`--${flag}`, values[flag] as string, opts) : undefined;
  const minScore = num("min-score", { min: 0, max: 100 });
  const maxProperties = num("max-properties", { min: 1, max: 500, integer: true });
  const budgetCredits = num("budget-credits", { min: 0, max: 1_000_000 });
  let sender;
  if (typeof values.profile === "string") {
    try {
      sender = loadProfileRef(values.profile).sender;
    } catch (err) {
      throw new UsageError(`--profile: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  let crmContext;
  if (typeof values["crm-context"] === "string") {
    try { crmContext = parseCrmContext(JSON.parse(await readFile(values["crm-context"], "utf8")), Date.now()); }
    catch { throw new UsageError("--crm-context must name a valid, fresh ERPNext snapshot"); }
  }
  const provider =
    values.provider || values.model
      ? await getProvider({
          pack: typeof values.pack === "string" ? values.pack : "residential-re",
          ...(typeof values.provider === "string" ? { provider: values.provider as ProviderName } : {}),
          ...(typeof values.model === "string" ? { model: values.model } : {}),
        })
      : undefined;

  const propScoreProvider = await scoreProviderFrom(values, typeof values.pack === "string" ? values.pack : "residential-re");
  const { run, cost } = await runPropertyCampaign({
    id: makeRunId(),
    icp,
    queries,
    ...(crmContext ? { crmContext } : {}),
    ...(typeof values.pack === "string" ? { pack: values.pack } : {}),
    ...(provider ? { provider } : {}),
    ...(propScoreProvider ? { scoreProvider: propScoreProvider } : {}),
    ...(sender ? { sender } : {}),
    ...(minScore !== undefined ? { minScore } : {}),
    ...(maxProperties !== undefined ? { maxProperties } : {}),
    ...(budgetCredits !== undefined ? { budgetCredits } : {}),
    cache: new FileResponseCache(join(intentOutreachHome(), "cache")),
  });
  const out = typeof values.out === "string" ? values.out : undefined;
  await new EncryptedSqliteRunStore(out).saveRun(run);
  if (values.json) {
    process.stdout.write(`${JSON.stringify(run, null, 2)}\n`);
    return;
  }
  process.stdout.write(
    [
      `property run ${run.id} — ${run.status} (${run.vertical})`,
      `properties: ${run.properties.length}  owners: ${run.parties.length}  drafts: ${run.messages.length}`,
      run.properties.length === 0
        ? "NOTE: no property source answered these ZIPs/parcels. Built-in public records cover Florida (Escambia 12033, Okaloosa 12091) today."
        : "",
      run.blockedContacts.length ? `blocked: ${run.blockedContacts.length}` : "",
      run.rejectedDrafts.length ? `rejected drafts: ${run.rejectedDrafts.length}` : "",
      run.credits ? `credits: ${run.credits.spent}/${run.credits.limit}${run.credits.exhausted ? " (budget reached)" : ""}` : "",
      ...run.complianceWarnings.map((w) => `WARNING: ${w}`),
      `cost: $${cost.spentUsd.toFixed(4)} over ${cost.calls} model calls`,
      `saved → ${out ?? defaultStorePath()}`,
      run.messages.length ? "next: review and approve the drafts before anything is sent" : "",
    ]
      .filter(Boolean)
      .join("\n") + "\n",
  );
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
  const store = new EncryptedSqliteRunStore(values.out);
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

const MONITOR_USAGE =
  "usage: intent-outreach monitor add <id> (--zips <a,b> | --parcels <fips:apn>) [--value-change-pct <n>] [--replace]\n" +
  "       intent-outreach monitor list\n" +
  "       intent-outreach monitor check <id> [--json] [--draft --icp <text> [--profile <p>] [--pack <id>]\n" +
  "                                      [--min-score <n>] [--max-properties <n>] [--budget-credits <n>]]\n" +
  "  the first check records a baseline; later checks report new parcels, owner, value, listing and distress changes.\n" +
  "  --draft runs a property campaign over the changed parcels only (drafts wait for approval); the snapshot is\n" +
  "  saved only after that run is saved, so a failure re-reports the same changes next time.";

const monitorDefPath = (id: string) => join(intentOutreachHome(), "monitors", `${id}.monitor.json`);

/** `monitor add|list|check` — event monitors over property snapshots (pipeline_core/monitors.ts). */
async function cmdMonitor(args: string[]): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs({
      args,
      options: {
        zips: { type: "string" },
        parcels: { type: "string" },
        "value-change-pct": { type: "string" },
        replace: { type: "boolean" },
        json: { type: "boolean" },
        draft: { type: "boolean" },
        icp: { type: "string" },
        profile: { type: "string" },
        pack: { type: "string" },
        "min-score": { type: "string" },
        "max-properties": { type: "string" },
        "budget-credits": { type: "string" },
      },
      allowPositionals: true,
    });
  } catch {
    throw new UsageError(MONITOR_USAGE);
  }
  const { positionals } = parsed;
  const values = parsed.values as Record<string, string | boolean | undefined>;
  const [action, id, ...extra] = positionals;
  if (extra.length > 0) throw new UsageError(MONITOR_USAGE);
  const { mkdir, readFile, readdir, unlink, writeFile } = await import("node:fs/promises");

  if (action === "list" && id === undefined) {
    const dir = join(intentOutreachHome(), "monitors");
    const names = await readdir(dir).catch(() => [] as string[]);
    const defs = names.filter((n) => n.endsWith(".monitor.json"));
    if (defs.length === 0) process.stdout.write("no monitors\n");
    for (const n of defs.sort()) {
      try {
        const m = MonitorSchema.parse(JSON.parse(await readFile(join(dir, n), "utf8")));
        const snap = await readSnapshot(monitorPath(m.id)).catch(() => undefined);
        process.stdout.write(`${m.id}  ${JSON.stringify(m.query)}  last check: ${snap?.checkedAt ?? "never"}\n`);
      } catch {
        process.stdout.write(`${n}  UNREADABLE definition (fix or delete it)\n`);
      }
    }
    return;
  }
  if (!id || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) throw new UsageError(MONITOR_USAGE);

  if (action === "add") {
    let query: ResearchQuery | undefined;
    if (typeof values.zips === "string") {
      const zips = values.zips.split(",").map((z) => z.trim()).filter(Boolean);
      if (zips.length === 0 || !zips.every((z) => /^\d{5}$/.test(z))) throw new UsageError("--zips must be 5-digit ZIPs, comma-separated");
      query = { kind: "area", geography: { zips }, filters: {} };
    } else if (typeof values.parcels === "string") {
      const refs = values.parcels.split(",").map((p) => p.trim()).filter(Boolean);
      if (refs.length !== 1) throw new UsageError("--parcels: a monitor watches one parcel or one ZIP list");
      const m = /^(\d{5}):(.+)$/.exec(refs[0]!);
      if (!m) throw new UsageError(`--parcels: ${JSON.stringify(refs[0])} is not <countyFips>:<apn>`);
      query = { kind: "parcel", countyFips: m[1]!, apn: m[2]! };
    }
    if (!query) throw new UsageError(MONITOR_USAGE);
    const pct =
      values["value-change-pct"] !== undefined
        ? parseNumberFlag("--value-change-pct", String(values["value-change-pct"]), { min: 0.1, max: 100 })
        : undefined;
    let monitor;
    try {
      monitor = MonitorSchema.parse({ id, query, ...(pct !== undefined ? { valueChangePct: pct } : {}) });
    } catch (err) {
      throw new UsageError(`monitor: ${err instanceof z.ZodError ? err.issues.map((i) => i.message).join("; ") : String(err)}`);
    }
    const path = monitorDefPath(id);
    const existing = await readFile(path, "utf8").then((t) => JSON.parse(t) as { query?: unknown }).catch(() => undefined);
    if (existing && JSON.stringify(existing.query) !== JSON.stringify(monitor.query)) {
      // A new query against the old snapshot would report every parcel as new (and --draft would mail them).
      if (!values.replace) throw new UsageError(`monitor ${id} already watches ${JSON.stringify(existing.query)}; pass --replace to change it (resets its baseline)`);
      await unlink(monitorPath(id)).catch(() => undefined);
    }
    await mkdir(join(intentOutreachHome(), "monitors"), { recursive: true, mode: 0o700 });
    await writeFile(path, JSON.stringify(monitor, null, 2), { mode: 0o600 });
    process.stdout.write(`monitor ${id} saved → ${path}\n`);
    return;
  }

  if (action === "check") {
    let monitor;
    try {
      monitor = MonitorSchema.parse(JSON.parse(await readFile(monitorDefPath(id), "utf8")));
    } catch (err) {
      throw new UsageError(`monitor ${id}: ${(err as NodeJS.ErrnoException).code === "ENOENT" ? "not found (monitor add first)" : String(err)}`);
    }
    // Validate every draft option BEFORE research, so a typo never costs a check (or its events).
    const draftOnly = ["icp", "profile", "pack", "min-score", "max-properties", "budget-credits"].filter((k) => values[k] !== undefined);
    if (!values.draft && draftOnly.length > 0) throw new UsageError(`--${draftOnly[0]} only applies with --draft`);
    const icp = typeof values.icp === "string" ? values.icp.trim() : "";
    if (values.draft && !icp) throw new UsageError("--draft needs --icp");
    let sender;
    if (typeof values.profile === "string") {
      try {
        sender = loadProfileRef(values.profile).sender;
      } catch (err) {
        throw new UsageError(`--profile: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    const num = (flag: string, o: { min: number; max: number; integer?: boolean }) =>
      typeof values[flag] === "string" ? parseNumberFlag(`--${flag}`, values[flag] as string, o) : undefined;
    const minScore = num("min-score", { min: 0, max: 100 });
    const maxProperties = num("max-properties", { min: 1, max: 500, integer: true });
    const budgetCredits = num("budget-credits", { min: 0, max: 1_000_000 });

    const result = await checkMonitor(monitor, {
      now: () => new Date().toISOString(),
      cache: new FileResponseCache(join(intentOutreachHome(), "cache")),
    });
    let draftRun: string | undefined;
    try {
      if (values.draft && result.changedQueries.length > 0) {
        const { run } = await runPropertyCampaign({
          id: makeRunId(),
          icp,
          queries: result.changedQueries,
          ...(typeof values.pack === "string" ? { pack: values.pack } : {}),
          ...(sender ? { sender } : {}),
          ...(minScore !== undefined ? { minScore } : {}),
          ...(maxProperties !== undefined ? { maxProperties } : {}),
          ...(budgetCredits !== undefined ? { budgetCredits } : {}),
          cache: new FileResponseCache(join(intentOutreachHome(), "cache")),
        });
        await new EncryptedSqliteRunStore().saveRun(run);
        draftRun = `${run.id} (${run.messages.length} drafts, waiting for approval)`;
      }
      await result.commit(); // only now: a failure above re-reports these events next time
    } catch (err) {
      await result.abandon();
      throw err;
    }
    if (values.json) {
      const { commit: _c, abandon: _a, ...plain } = result;
      process.stdout.write(`${JSON.stringify({ ...plain, ...(draftRun ? { draftRun } : {}) }, null, 2)}\n`);
      return;
    }
    process.stdout.write(
      [
        `monitor ${id}: ${result.baseline ? "baseline recorded" : `${result.events.length} event(s)`} over ${result.parcels} parcel(s)`,
        ...result.events.map((e) => `  ${e.kind}  ${e.propertyKey}${e.before !== undefined ? `  ${JSON.stringify(e.before)} → ${JSON.stringify(e.after)}` : ""}`),
        ...result.failedConnectors.map((f) => `  WARNING: ${f.name} failed (${f.status}); parcels it missed keep their last snapshot`),
        draftRun ? `drafted: ${draftRun}` : "",
      ]
        .filter(Boolean)
        .join("\n") + "\n",
    );
    return;
  }
  throw new UsageError(MONITOR_USAGE);
}

/** `keys <ENV_NAME>` — configured variants of a connector key and this month's usage against quotas. */
async function cmdKeys(args: string[]): Promise<void> {
  const [name, ...extra] = args;
  if (!name || extra.length > 0 || !/^[A-Z][A-Z0-9_]*$/.test(name)) {
    throw new UsageError("usage: intent-outreach keys <ENV_NAME>   e.g. keys APOLLO_API_KEY");
  }
  const rows = await keyStatus(name);
  if (rows.length === 0) process.stdout.write(`no ${name} or ${name}__<LABEL> configured\n`);
  for (const r of rows) {
    const quota = r.monthlyCredits !== undefined ? `${r.used}/${r.monthlyCredits} credits this month` : `${r.used} credits this month (no quota)`;
    process.stdout.write(`${r.envName.padEnd(36)} ${r.label.padEnd(12)} ${quota}\n`);
  }
}

const INBOUND_USAGE =
  "usage: intent-outreach inbound --offer <text> [--channel email|sms] [--profile <p>] [--pack <id>]\n" +
  "         [--provider <p>] [--model <m>] [--out <runs.sqlite>] [--json] < inquiry.json\n" +
  '  inquiry.json: {"inquiry": {"firstName"?,"email"?,"phone"?,"message","propertyAddress"?,"source","receivedAt"},\n' +
  '                 "consents"?: [ConsentRecord...]}\n' +
  "  Drafts the first reply to a website inquiry (never sends). The reply waits for approval like any draft.";

const InboundStdinSchema = z.object({ inquiry: InboundInquirySchema, consents: z.array(ConsentRecordSchema).default([]) });

/** `inbound` — draft the first reply to a website inquiry and record speed-to-lead. */
async function cmdInbound(args: string[]): Promise<void> {
  let values: Record<string, string | boolean | undefined>;
  try {
    ({ values } = parseArgs({
      args,
      options: {
        offer: { type: "string" },
        channel: { type: "string" },
        profile: { type: "string" },
        pack: { type: "string" },
        provider: { type: "string" },
        model: { type: "string" },
        out: { type: "string" },
        json: { type: "boolean" },
      },
      allowPositionals: false,
    }));
  } catch (err) {
    throw new UsageError(`${err instanceof Error ? err.message : String(err)}\n${INBOUND_USAGE}`);
  }
  const offer = typeof values.offer === "string" ? values.offer.trim() : "";
  if (!offer) throw new UsageError(INBOUND_USAGE);
  const channel = values.channel;
  if (channel !== undefined && channel !== "email" && channel !== "sms") throw new UsageError("--channel must be email or sms");
  let parsed: z.infer<typeof InboundStdinSchema>;
  try {
    parsed = InboundStdinSchema.parse(JSON.parse(await readStdin()));
  } catch (err) {
    throw new UsageError(`inquiry JSON on stdin is invalid: ${err instanceof Error ? err.message : String(err)}\n${INBOUND_USAGE}`);
  }
  let sender;
  if (typeof values.profile === "string") {
    try {
      sender = loadProfileRef(values.profile).sender;
    } catch (err) {
      throw new UsageError(`--profile: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const provider =
    values.provider || values.model
      ? await getProvider({
          pack: typeof values.pack === "string" ? values.pack : "residential-re",
          ...(typeof values.provider === "string" ? { provider: values.provider as ProviderName } : {}),
          ...(typeof values.model === "string" ? { model: values.model } : {}),
        })
      : undefined;
  const { run, speedToLeadMs } = await runInbound({
    id: makeRunId(),
    inquiry: parsed.inquiry,
    consents: parsed.consents,
    offer,
    ...(channel ? { channel } : {}),
    ...(typeof values.pack === "string" ? { pack: values.pack } : {}),
    ...(provider ? { provider } : {}),
    ...(sender ? { sender } : {}),
  });
  await new EncryptedSqliteRunStore(typeof values.out === "string" ? values.out : undefined).saveRun(run);
  if (values.json) {
    process.stdout.write(`${JSON.stringify(run, null, 2)}\n`);
    return;
  }
  const m = run.messages[0];
  process.stdout.write(
    [
      `inbound run ${run.id} — ${run.status} (${run.vertical})`,
      speedToLeadMs !== undefined ? `speed-to-lead: ${(speedToLeadMs / 1000).toFixed(1)}s` : "",
      run.blockedContacts.length ? `blocked: ${run.blockedContacts.map((b) => b.reason).join(", ")}` : "",
      run.rejectedDrafts.length ? `rejected: ${run.rejectedDrafts.flatMap((r) => r.issues).join("; ")}` : "",
      m ? `\n${m.subject ? `Subject: ${m.subject}\n` : ""}${m.body}\n\nCTA: ${m.cta}` : "",
      m ? "\nNext: intent-outreach approvals pending  (nothing is sent until a person approves it)" : "",
    ]
      .filter(Boolean)
      .join("\n") + "\n",
  );
}

const CHECK_SEND_USAGE =
  "usage: intent-outreach check-send [--profile <name|path>] [--crm-context <file>] < input.json\n" +
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

async function readStdin(maxBytes = Number.POSITIVE_INFINITY): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw new UsageError("JSON input exceeds 16 MiB");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * `check-send` — the send-time check for dispatchers outside this process
 * (coastal's Python dispatcher shells out to it). Reads one JSON input on stdin,
 * applies the local suppression list and the profile's sender identity, prints
 * the verdict as JSON, and exits 0 when sendable, 3 when not, 2 on bad input.
 */
async function cmdCheckSend(args: string[], stdin: () => Promise<string> = readStdin): Promise<void> {
  let values: { profile?: string | undefined; out?: string | undefined; "crm-context"?: string | undefined };
  try {
    ({ values } = parseArgs({ args, options: { profile: { type: "string" }, out: { type: "string" }, "crm-context": { type: "string" } }, allowPositionals: false }));
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
  let crm;
  if (values["crm-context"]) {
    try { crm = parseCrmContext(JSON.parse(await readFile(values["crm-context"], "utf8")), Date.now()); }
    catch { throw new UsageError("--crm-context must name a valid, fresh ERPNext snapshot"); }
  }
  const localSuppressions = await loadSuppressionList();
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
    suppressions: crm ? mergeCrmSuppressions(localSuppressions, crm) : localSuppressions,
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
    const run = await new EncryptedSqliteRunStore(values.out).getRun(parsed.runId);
    if (!run || !run.messages.some((m) => m.contactKey === parsed.contactKey)) {
      verdict.reasons.push("run:message-not-found");
    } else if (!recipientMatches(run, parsed.contactKey, { contactPoint: parsed.contactPoint, contactEmail: parsed.contactEmail })) {
      verdict.reasons.push("recipient:mismatch");
    }
    if (crm && run) {
      const model = { properties: [...run.properties], parties: [...run.parties], ownerships: [...run.ownerships], contactPoints: [...run.contactPoints], entityLinks: [...run.entityLinks] };
      const excluded = crmExcludedProperties(model, crm.suppressions);
      if (run.messages.some((m) => m.contactKey === parsed.contactKey && m.propertyKey && excluded.has(m.propertyKey)) ||
        crmExcludedParties(model, crm.suppressions).has(parsed.contactKey)) verdict.reasons.push("suppressed:crm");
    }
    verdict.sendable = verdict.reasons.length === 0;
  }
  if (crm) assertFreshCrmContext(crm, Date.now());
  process.stdout.write(`${JSON.stringify(verdict, null, 2)}\n`);
  if (!verdict.sendable) process.exitCode = 3;
}

async function cmdStore(args: string[]): Promise<void> {
  const [action, ...rest] = args;
  const parse = () => {
    try { return parseArgs({ args: rest, options: { from: { type: "string" }, out: { type: "string" } }, allowPositionals: true }); }
    catch (error) { throw new UsageError(error instanceof Error ? error.message : String(error)); }
  };
  const { values, positionals } = parse();
  if (positionals.length || !["migrate", "purge", "audit"].includes(action ?? "") || (action !== "migrate" && values.from)) {
    throw new UsageError("usage: intent-outreach store migrate [--from runs.jsonl] [--out runs.sqlite] | store purge|audit [--out runs.sqlite]");
  }
  const store = new EncryptedSqliteRunStore(values.out);
  const result = action === "migrate"
    ? { ...(await store.migrateJsonl(values.from ?? legacyStorePath())), sourcePreserved: true }
    : action === "purge" ? {
      expired: await store.purgeExpired(),
      cacheEntries: await new FileResponseCache(join(intentOutreachHome(), "cache")).purge(Date.now()),
      monitorSnapshots: await purgeExpiredSnapshots(join(intentOutreachHome(), "monitors")),
    } : await store.audit();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

/** External adapters use the same schema gate as storage, without opening a store or provider. */
async function cmdValidate(args: string[], kind: "run" | "crm-context"): Promise<void> {
  if (args.length) throw new UsageError(`usage: intent-outreach validate-${kind} < input.json`);
  const raw = await readStdin(16 * 1024 * 1024);
  let checked;
  try {
    const input: unknown = JSON.parse(raw);
    checked = kind === "run" ? assertCampaignRun(input) : parseCrmContext(input, Date.now());
  } catch {
    // Schema paths/messages may include untrusted values; do not echo owner data to logs.
    throw new UsageError(`validate-${kind}: invalid JSON, schema, or freshness window`);
  }
  process.stdout.write(`${JSON.stringify(checked)}\n`);
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case "validate-run":
      return cmdValidate(rest, "run");
    case "validate-crm-context":
      return cmdValidate(rest, "crm-context");
    case "store":
      return cmdStore(rest);
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
    case "keys":
      return cmdKeys(rest);
    case "inbound":
      return cmdInbound(rest);
    case "property-run":
      return cmdPropertyRun(rest);
    case "monitor":
      return cmdMonitor(rest);
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
