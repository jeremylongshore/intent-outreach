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
import {
  defaultStorePath,
  DuplicateRunError,
  JsonlRunStore,
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
    .describe("Replace an existing run with the same id (the old snapshot stays in the append-only log)"),
};

const SaveRunArgsSchema = z.object(SaveRunInput);
export type SaveRunArgs = z.input<typeof SaveRunArgsSchema>;

export interface SaveRunDeps {
  store?: RunStore;
  /** Display path for the result (defaults to the store's JSONL path). */
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
    const store = deps.store ?? new JsonlRunStore(deps.storePath);
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
