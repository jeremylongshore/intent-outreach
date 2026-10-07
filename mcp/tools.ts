import { minimizeEnrichment } from "../pipeline_core/pii-policy.js";
/**
 * mcp/tools.ts — the Intent Outreach MCP tool handlers (pure functions + zod input shapes).
 *
 * Split from server.ts so the handlers are unit-testable without spawning the
 * stdio transport: server.ts only wires these into an McpServer and connects.
 *
 * Every handler is a THIN wrapper over pipeline_core. In particular `save_run`
 * re-applies EXACTLY the gates runCampaign applies (suppression + pack
 * compliance, the draft guard, schema validation, the code-appended CAN-SPAM
 * footer) via pipeline.applyMessageCompliance — an agent-drafted message gets
 * no shortcut past compliance just because it arrived over MCP.
 */

import { decide, listPending } from "../pipeline_core/approvals.js";
import * as dealMath from "@intent-outreach/deal-math";
import { addSuppression, readSuppressions } from "../pipeline_core/suppressions.js";
import { SUPPRESSION_KINDS, type SuppressionKind } from "../pipeline_core/compliance/suppression.js";
import { z } from "zod";
import {
  applyMessageCompliance,
  campaignGate,
  DEFAULT_MAX_DOMAINS,
  deriveRunStatus,
  loadProfileRef,
  normalizeDomain,
  normalizeDomains,
  runEnrich,
  runResearch,
} from "../pipeline_core/pipeline.js";
import {
  ContactSchema,
  EnrichmentSchema,
  FailedConnectorSchema,
  LeadSchema,
  RunErrorSchema,
  SCHEMA_VERSION,
  type Contact,
  type Lead,
} from "../pipeline_core/models.js";
import { assertCampaignRun, ValidationError } from "../pipeline_core/validator.js";
import { EncryptedSqliteRunStore } from "../pipeline_core/encrypted-store.js";
import {
  defaultStorePath,
  DuplicateRunError,
  StoreLockTimeoutError,
  type RunStore,
} from "../pipeline_core/store.js";
import { applyProfileToCampaignInput, type ReportProfile } from "../pipeline_core/profiles.js";
import { getConnectors, registerBuiltinConnectors } from "../pipeline_core/connectors/index.js";
import { registerBuiltinPacks, resolvePack } from "../pipeline_core/packs/index.js";
import { loadSuppressionList } from "../pipeline_core/suppressions.js";
import type { SuppressionList } from "../pipeline_core/compliance/suppression.js";
import type { SenderIdentity } from "../pipeline_core/footer.js";

// ─────────────────────────────── result helpers ─────────────────────────────

export interface ToolResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

export function asText(value: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

export function toolError(text: string): ToolResult {
  return { isError: true, content: [{ type: "text", text }] };
}

const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err));

// ─────────────────────────────── bounds ─────────────────────────────────────

/** Hard ceiling on one save_run payload (serialized) — a runaway agent can't fill the disk. */
export const MAX_SAVE_RUN_BYTES = 2_000_000;
const MAX_DOMAINS_PER_SAVE = Math.max(DEFAULT_MAX_DOMAINS, 100);
const SHORT = 200;
const MEDIUM = 2_000;

// ─────────────────────────────── list_connectors ────────────────────────────

export function handleListConnectors(): ToolResult {
  registerBuiltinConnectors();
  return asText(
    getConnectors().map((c) => ({
      name: c.name,
      displayName: c.displayName,
      tier: c.tier,
      phases: c.phases,
      keyEnvVar: c.keyEnvVar,
      configured: c.isConfigured(),
      note: c.note,
    })),
  );
}

// ─────────────────────────────── research_domain ────────────────────────────

export const ResearchDomainInput = {
  domain: z.string().min(1).max(253).describe("Company domain, e.g. acme.com"),
  icp: z.string().min(1).max(MEDIUM).describe("Ideal customer profile / target persona keywords"),
  debug: z
    .boolean()
    .default(false)
    .describe("Include each connector's raw vendor payload (may contain personal data). Default false."),
};

export async function handleResearchDomain(args: { domain: string; icp: string; debug?: boolean }): Promise<ToolResult> {
  let domain: string;
  try {
    domain = normalizeDomain(args.domain);
  } catch (err) {
    return toolError(errMsg(err));
  }
  const { raw, ...normalized } = await runResearch(domain, args.icp);
  // Raw vendor payloads (e.g. Hunter's full people list with names + emails) are
  // NOT returned by default — only the normalized, de-duplicated records.
  return asText(args.debug ? { ...normalized, raw } : normalized);
}

// ─────────────────────────────── enrich_lead ────────────────────────────────

export const EnrichLeadInput = {
  domain: z.string().min(1).max(253),
  companyName: z.string().min(1).max(SHORT).optional(),
  contacts: z
    .array(
      z.object({
        name: z.string().min(1).max(SHORT),
        email: z.string().email().max(320).optional(),
        title: z.string().max(SHORT).optional(),
        linkedin: z.string().max(500).optional(),
      }),
    )
    .max(100)
    .default([]),
  debug: z
    .boolean()
    .default(false)
    .describe("Include each connector's raw vendor payload (may contain personal data). Default false."),
};

export async function handleEnrichLead(args: {
  domain: string;
  companyName?: string | undefined;
  contacts?: { name: string; email?: string | undefined; title?: string | undefined; linkedin?: string | undefined }[];
  debug?: boolean;
}): Promise<ToolResult> {
  let domain: string;
  try {
    domain = normalizeDomain(args.domain);
  } catch (err) {
    return toolError(errMsg(err));
  }
  const lead: Lead = { domain, companyName: args.companyName ?? domain, source: "manual" };
  const contacts: Contact[] = (args.contacts ?? []).map((c) => ({
    name: c.name,
    leadDomain: domain,
    ...(c.email !== undefined ? { email: c.email } : {}),
    ...(c.title !== undefined ? { title: c.title } : {}),
    ...(c.linkedin !== undefined ? { linkedin: c.linkedin } : {}),
    source: "manual",
  }));
  const { raw, ...normalized } = await runEnrich(lead, contacts);
  return asText(args.debug ? { ...normalized, raw } : normalized);
}

// ─────────────────────────────── save_run ───────────────────────────────────

/** An agent-written draft. createdAt is server-stamped; model/promptVersion are caller-claimed. */
export const AgentMessageSchema = z.object({
  contactKey: z.string().min(1).max(400),
  channel: z.enum(["email", "linkedin"]),
  subject: z.string().max(300).nullish(),
  body: z.string().min(1).max(5_000),
  cta: z.string().min(1).max(500),
  fitScore: z.number().min(0).max(100).optional(),
  model: z.string().min(1).max(SHORT).optional(),
  promptVersion: z.string().min(1).max(SHORT).optional(),
  /** Accepted for backward compatibility and IGNORED — the server stamps createdAt. */
  createdAt: z.string().max(64).optional(),
});

export const SaveRunInput = {
  id: z.string().min(1).max(SHORT),
  icp: z.string().min(1).max(MEDIUM),
  domains: z.array(z.string().min(1).max(253)).min(1).max(MAX_DOMAINS_PER_SAVE),
  provider: z.string().min(1).max(SHORT),
  model: z.string().min(1).max(SHORT).describe("Caller-claimed model id that drafted the messages"),
  pack: z.string().min(1).max(SHORT).optional().describe('Vertical pack whose compliance gate applies (default "b2b-sdr")'),
  profile: z
    .string()
    .min(1)
    .max(1_000)
    .optional()
    .describe(
      "Report Profile path or name; its sender identity drives the CAN-SPAM footer (default: $INTENT_OUTREACH_PROFILE)",
    ),
  leads: z.array(LeadSchema).max(500).default([]),
  contacts: z.array(ContactSchema).max(2_000).default([]),
  enrichments: z.array(EnrichmentSchema).max(5_000).default([]),
  messages: z.array(AgentMessageSchema).max(500).default([]),
  skippedConnectors: z.array(z.string().min(1).max(SHORT)).max(100).default([]),
  blockedContacts: z
    .array(z.object({ contactKey: z.string().min(1).max(400), reason: z.string().min(1).max(500) }))
    .max(2_000)
    .default([]),
  errors: z.array(RunErrorSchema).max(2_000).default([]),
  rejectedDrafts: z
    .array(z.object({ contactKey: z.string().min(1).max(400), issues: z.array(z.string().max(1_000)).max(50) }))
    .max(2_000)
    .default([]),
  failedConnectors: z.array(FailedConnectorSchema).max(500).default([]),
  overwrite: z
    .boolean()
    .default(false)
    .describe("Replace an existing run with the same id (a minimal audit event is retained; old message content is replaced)"),
};

const SaveRunArgsSchema = z.object(SaveRunInput);
export type SaveRunArgs = z.input<typeof SaveRunArgsSchema>;

export interface SaveRunDeps {
  store?: RunStore;
  /** Display path for the result (defaults to the encrypted store path). */
  storePath?: string;
  now?: () => string;
  suppressions?: SuppressionList;
  cwd?: string;
}

export async function handleSaveRun(rawArgs: SaveRunArgs, deps: SaveRunDeps = {}): Promise<ToolResult> {
  // Re-parse: applies defaults/bounds even when called directly (tests, other hosts).
  const parsedArgs = SaveRunArgsSchema.safeParse(rawArgs);
  if (!parsedArgs.success) {
    const issues = parsedArgs.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    return toolError(`validation failed (run NOT saved): ${issues}`);
  }
  const args = parsedArgs.data;
  args.enrichments = args.enrichments.map(minimizeEnrichment);
  if (JSON.stringify(args).length > MAX_SAVE_RUN_BYTES) {
    return toolError(`run NOT saved: payload exceeds ${MAX_SAVE_RUN_BYTES} bytes; drop raw enrichment data or split the run`);
  }

  const now = deps.now ?? (() => new Date().toISOString());
  let domains: string[];
  let leads: Lead[];
  try {
    domains = normalizeDomains(args.domains);
    leads = args.leads.map((l) => ({ ...l, domain: normalizeDomain(l.domain) }));
  } catch (err) {
    return toolError(`run NOT saved: ${errMsg(err)}`);
  }

  let pack;
  try {
    registerBuiltinPacks();
    pack = resolvePack(args.pack);
  } catch (err) {
    return toolError(`run NOT saved: ${errMsg(err)}`);
  }

  let suppressions: SuppressionList;
  try {
    // Fail closed: an unreadable opt-out list must never let a draft through.
    suppressions = deps.suppressions ?? (await loadSuppressionList());
  } catch (err) {
    return toolError(`run NOT saved: cannot read the suppression list: ${errMsg(err)}`);
  }

  let sender: SenderIdentity | undefined;
  let styleOverride: string | undefined;
  let voice: ReportProfile["voice"];
  const profileRef = args.profile ?? (process.env.INTENT_OUTREACH_PROFILE?.trim() || undefined);
  if (profileRef) {
    try {
      const profile = loadProfileRef(profileRef, deps.cwd);
      sender = profile.sender;
      // Agent-written drafts get the same voice check as seam drafts.
      voice = profile.voice;
      styleOverride = applyProfileToCampaignInput(profile, { id: args.id, icp: args.icp, domains }).styleOverride;
    } catch (err) {
      return toolError(`run NOT saved: ${errMsg(err)}`);
    }
  }

  const gated = await applyMessageCompliance({
    icp: args.icp,
    leads,
    contacts: args.contacts,
    enrichments: args.enrichments,
    drafts: args.messages,
    gate: campaignGate(pack, suppressions),
    sender,
    model: args.model,
    now,
    userText: [styleOverride],
    voice,
    draftRules: pack.draftRules,
  });

  const errors = [...args.errors, ...gated.errors];
  const rejectedDrafts = [...args.rejectedDrafts, ...gated.rejectedDrafts];
  const blockedContacts = [...args.blockedContacts];
  for (const b of gated.blockedContacts) {
    if (!blockedContacts.some((x) => x.contactKey === b.contactKey)) blockedContacts.push(b);
  }
  const status = deriveRunStatus({
    messages: gated.messages.length,
    leads: leads.length,
    // The agent reached save_run after its research phase; an empty result is an
    // honest "researched", not a failure.
    researchRan: true,
    errors: errors.length,
  });
  const stamped = now();

  try {
    const run = assertCampaignRun({
      id: args.id,
      schemaVersion: SCHEMA_VERSION,
      icp: args.icp,
      domains,
      vertical: pack.id,
      provider: args.provider,
      model: args.model,
      status,
      leads,
      contacts: args.contacts,
      enrichments: args.enrichments,
      messages: gated.messages,
      skippedConnectors: args.skippedConnectors,
      blockedContacts,
      errors,
      rejectedDrafts,
      failedConnectors: args.failedConnectors,
      complianceWarnings: gated.complianceWarnings,
      origin: "agent",
      createdAt: stamped,
      finishedAt: stamped,
    });
    const store = deps.store ?? new EncryptedSqliteRunStore(deps.storePath);
    await store.saveRun(run, { overwrite: args.overwrite });
    return asText({
      saved: run.id,
      status,
      path: deps.storePath ?? (deps.store ? undefined : defaultStorePath()),
      messages: run.messages.length,
      needsSenderIdentity: run.messages.filter((m) => m.needsSenderIdentity).length,
      blockedContacts: run.blockedContacts,
      rejectedDrafts: gated.rejectedDrafts,
      complianceWarnings: run.complianceWarnings,
    });
  } catch (err) {
    if (err instanceof DuplicateRunError) {
      return toolError(`run ${err.runId} already exists; pass overwrite: true to replace`);
    }
    if (err instanceof ValidationError) {
      return toolError(`validation failed (run NOT saved): ${err.message}`);
    }
    if (err instanceof StoreLockTimeoutError) {
      return toolError(`run NOT saved: ${err.message}; retry in a moment`);
    }
    throw err;
  }
}

// ───────────────────────────── approval queue ───────────────────────────────

export interface ApprovalDeps {
  store?: RunStore;
  approvalsPath?: string;
  now?: () => string;
}

export const ListPendingInput = {
  limit: z.number().int().min(1).max(200).optional().describe("Max drafts to return (default 50)."),
};

/** Drafts with no human decision yet. Each carries the digest a person must cite to approve it. */
export async function handleListPending(args: { limit?: number | undefined }, deps: ApprovalDeps = {}): Promise<ToolResult> {
  try {
    const store = deps.store ?? new EncryptedSqliteRunStore();
    const pending = await listPending(store, deps.approvalsPath);
    return asText({ total: pending.length, pending: pending.slice(0, args.limit ?? 50) });
  } catch (err) {
    return toolError(`could not list pending drafts: ${errMsg(err)}`);
  }
}

export const DecideInput = {
  runId: z.string().min(1),
  contactKey: z.string().min(1),
  digest: z
    .string()
    .min(8)
    .optional()
    .describe("Required to approve: the digest list_pending showed for this exact message."),
  note: z.string().max(500).optional(),
};

async function decideVia(
  decision: "approved" | "rejected",
  args: { runId: string; contactKey: string; digest?: string | undefined; note?: string | undefined },
  deps: ApprovalDeps,
): Promise<ToolResult> {
  try {
    const record = await decide({
      store: deps.store ?? new EncryptedSqliteRunStore(),
      runId: args.runId,
      contactKey: args.contactKey,
      decision,
      by: "mcp",
      note: args.note,
      digest: args.digest,
      now: deps.now ?? (() => new Date().toISOString()),
      ...(deps.approvalsPath ? { path: deps.approvalsPath } : {}),
    });
    return asText(record);
  } catch (err) {
    return toolError(errMsg(err));
  }
}

export const handleApprove = (args: Parameters<typeof decideVia>[1], deps: ApprovalDeps = {}) => decideVia("approved", args, deps);
export const handleReject = (args: Parameters<typeof decideVia>[1], deps: ApprovalDeps = {}) => decideVia("rejected", args, deps);

// ─────────────────────────────── list_runs ───────────────────────────────────

export const ListRunsInput = {
  limit: z.number().int().min(1).max(200).optional().describe("Most recent runs to return (default 20)."),
};

/** Summaries of the most recent runs in the LOCAL store (newest first). */
export async function handleListRuns(args: { limit?: number | undefined }, deps: { store?: RunStore } = {}): Promise<ToolResult> {
  try {
    const store = deps.store ?? new EncryptedSqliteRunStore();
    const runs = await store.listRuns();
    const corrupt = (await store.corruptLines()).length;
    // Compare instants, not strings: "…:00Z" vs "…:00.500Z" sort wrong as text.
    const summaries = [...runs]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id))
      .slice(0, args.limit ?? 20)
      .map((r) => ({
        id: r.id,
        vertical: r.vertical,
        status: r.status,
        createdAt: r.createdAt,
        messages: r.messages.length,
        blockedContacts: r.blockedContacts.length,
        rejectedDrafts: r.rejectedDrafts.length,
        leads: r.leads.length,
        properties: r.properties.length,
        ...(r.credits ? { credits: r.credits } : {}),
        ...(r.costUsd !== undefined ? { costUsd: r.costUsd } : {}),
      }));
    return asText({ total: runs.length, ...(corrupt > 0 ? { corruptLinesSkipped: corrupt } : {}), runs: summaries });
  } catch (err) {
    return toolError(`could not list runs: ${errMsg(err)}`);
  }
}

// ─────────────────────────────── suppress ────────────────────────────────────

export const SuppressInput = {
  /** No "remove": undoing an opt-out re-allows contact, so it is a person's call at the CLI only. */
  action: z.enum(["add", "list"]),
  value: z
    .string()
    .min(1)
    .max(300)
    .optional()
    .describe("Email, domain, phone or mailing address (required for add/remove)."),
  kind: z.enum(SUPPRESSION_KINDS as unknown as [SuppressionKind, ...SuppressionKind[]]).optional(),
  reason: z.string().max(300).optional(),
};

/**
 * Add to or list the local opt-out list. Adding is always safe: it only ever
 * stops outreach. REMOVING an opt-out re-allows contact, so this tool cannot do
 * it: an agent steered by text in third-party data must never undo someone's
 * opt-out. Removal is `intent-outreach suppress remove`, run by a person.
 */
export async function handleSuppress(
  args: { action: "add" | "list" | "remove"; value?: string | undefined; kind?: SuppressionKind | undefined; reason?: string | undefined },
  deps: { path?: string } = {},
): Promise<ToolResult> {
  try {
    const path = deps.path;
    if (args.action === "list") return asText(await readSuppressions(path));
    if (!args.value) return toolError("value is required for add and remove");
    if (args.action === "add") {
      const r = await addSuppression(args.value, {
        ...(path ? { path } : {}),
        ...(args.kind ? { kind: args.kind } : {}),
        ...(args.reason ? { reason: args.reason } : {}),
      });
      return asText({ added: r.added, entry: r.entry });
    }
    return toolError(
      "removing an opt-out is not available to the agent; a person runs `intent-outreach suppress remove <value>`",
    );
  } catch (err) {
    return toolError(errMsg(err));
  }
}

// ─────────────────────────────── underwrite ──────────────────────────────────

const CALCULATORS = {
  noi: (i: unknown, a: unknown) => dealMath.noi(i as dealMath.NoiInputs, a as dealMath.NoiAssumptions),
  capRate: (i: unknown) => dealMath.capRate(i as dealMath.CapRateInputs),
  dscr: (i: unknown) => dealMath.dscr(i as dealMath.DscrInputs),
  cashOnCash: (i: unknown) => dealMath.cashOnCash(i as dealMath.CashOnCashInputs),
  monthlyPayment: (i: unknown) => dealMath.monthlyPayment(i as dealMath.PaymentInputs),
  sellerFinance: (i: unknown, a: unknown) =>
    dealMath.sellerFinance(i as dealMath.SellerFinanceInputs, a as dealMath.SellerFinanceAssumptions),
  exchange1031Timeline: (i: unknown) => dealMath.exchange1031Timeline(i as dealMath.ExchangeInputs),
  tradeUp: (i: unknown, a: unknown) => dealMath.tradeUp(i as dealMath.TradeUpInputs, a as dealMath.TradeUpAssumptions),
} as const;

export const UnderwriteInput = {
  calculation: z.enum(Object.keys(CALCULATORS) as [keyof typeof CALCULATORS, ...(keyof typeof CALCULATORS)[]]),
  inputs: z.record(z.string(), z.unknown()).describe("Money in integer cents, rates in basis points (6.75% = 675)."),
  assumptions: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Required by noi, sellerFinance and tradeUp; explicit, never defaulted."),
};

/**
 * Run one deal-math calculation in code and return {value, inputs,
 * assumptionsUsed, version}. The model quotes these figures; it never computes
 * them. Invalid input is a tool error naming the bad field.
 */
export function handleUnderwrite(args: {
  calculation: keyof typeof CALCULATORS;
  inputs: Record<string, unknown>;
  assumptions?: Record<string, unknown> | undefined;
}): ToolResult {
  try {
    return asText(CALCULATORS[args.calculation](args.inputs, args.assumptions ?? {}));
  } catch (err) {
    return toolError(errMsg(err));
  }
}
