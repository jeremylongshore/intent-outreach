/**
 * pipeline_core/pipeline.ts — DETERMINISTIC research → enrich orchestration.
 *
 * Karpathy's point made concrete: the LLM does NOT choose which connector runs.
 * This file iterates the configured connectors in fixed registration order and
 * aggregates their output. Same input + same configured connectors ⇒ identical
 * connector call sequence every run (017-AT-DECR acceptance #6).
 *
 * The LLM seam (score + draft) lives in ./seam.ts and is layered on top by
 * runCampaign() — the connectors stay deterministic glue.
 *
 * Failure posture (Armstrong): one bad lead never loses the run. Every score,
 * compliance check and draft is isolated per lead/contact; a failure is recorded
 * in `run.errors` and the loop continues. The compliance gate fails CLOSED —
 * anything but an explicit "clean" verdict blocks the contact.
 */

import {
  getConfiguredConnectors,
  getConnector,
  getSkippedConnectors,
  registerBuiltinConnectors,
} from "./connectors/index.js";
import type { Connector, ConnectorItemFailure, ConnectorPhase } from "./connectors/types.js";
import { HttpError } from "./http.js";
import { ContactSchema, SCHEMA_VERSION } from "./models.js";
import type {
  CampaignRun,
  Contact,
  Enrichment,
  FailedConnector,
  Lead,
  Message,
  RunError,
  RunStatus,
} from "./models.js";
import { assertCampaignRun, validateMessage, type Validated } from "./validator.js";
import { getProvider, type LLMProvider } from "./providers.js";
import { CostMeter, type CacheTokens, type Usage } from "./cost.js";
import { draftMessage, DraftRejectedError, scoreLead } from "./seam.js";
import { registerBuiltinPacks, resolvePack } from "./packs/index.js";
import type { ComplianceContext, ComplianceGate } from "./packs/types.js";
import { composeGates, suppressionGate, type SuppressionList } from "./compliance/suppression.js";
import { loadSuppressionList } from "./suppressions.js";
import { applyComplianceFooter, missingSenderFields, type SenderIdentity } from "./footer.js";
import { guardDraft, type VoiceRules } from "./draft-guard.js";
import { loadProfile, type ReportProfile } from "./profiles.js";
import { intentOutreachHome } from "./secrets.js";
import { cleanBuyerTitles, rankContactsByTitle } from "./targeting.js";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Default ceiling on domains per campaign (override with `allowLarge`). */
export const DEFAULT_MAX_DOMAINS = 25;
/** Default deadline for ONE connector invocation. */
export const DEFAULT_CONNECTOR_TIMEOUT_MS = 90_000;

export interface ConnectorRunOptions {
  /** Per-connector-invocation deadline in ms. Default 90s. */
  connectorTimeoutMs?: number;
  /** Buyer titles passed to every connector (people search/reveal targeting). */
  buyerTitles?: string[];
}

/** `{ buyerTitles }` when any usable title is set, else `{}` (connector input stays unchanged). */
function buyerTitlesArg(opts: ConnectorRunOptions): { buyerTitles?: string[] } {
  const titles = cleanBuyerTitles(opts.buyerTitles);
  return titles.length > 0 ? { buyerTitles: titles } : {};
}

export interface ResearchResult {
  leads: Lead[];
  contacts: Contact[];
  /** Connectors that ran, in call order — the determinism witness. */
  ran: string[];
  /** Connectors that are NOT configured (no key) — never a failure. */
  skipped: string[];
  /** Configured connectors that threw or timed out (sanitized status only). */
  failedConnectors: FailedConnector[];
  raw: Record<string, unknown>;
}

export interface EnrichResult {
  enrichments: Enrichment[];
  /**
   * The input contacts with every verified email found during enrichment folded
   * in — later (paid) connectors in the chain saw this list, so they skipped
   * contacts an earlier connector already resolved.
   */
  contacts: Contact[];
  ran: string[];
  skipped: string[];
  failedConnectors: FailedConnector[];
  raw: Record<string, unknown>;
}

// ──────────────────────────────────────────────────────────────────────────
// Domains
// ──────────────────────────────────────────────────────────────────────────

const LABEL_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const TLD_RE = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

/**
 * Canonicalize a user- or connector-supplied domain to a bare hostname:
 * lowercase, scheme / userinfo / path / query / port / trailing dot / leading
 * `www.` stripped, IDNs punycoded. Throws on anything that is not a valid
 * public-style hostname (IP literals, single labels, bad characters).
 *
 *   normalizeDomain("https://WWW.Acme.com:443/about?x=1") === "acme.com"
 */
export function normalizeDomain(input: string): string {
  if (typeof input !== "string" || !input.trim()) {
    throw new Error(`invalid domain ${JSON.stringify(input)}: empty`);
  }
  const trimmed = input.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  let host: string;
  try {
    host = new URL(withScheme).hostname.toLowerCase();
  } catch {
    throw new Error(`invalid domain ${JSON.stringify(input)}: not a hostname`);
  }
  host = host.replace(/\.$/, "");
  const labels = host.split(".");
  if (labels[0] === "www" && labels.length > 2) labels.shift();
  const tld = labels[labels.length - 1] ?? "";
  if (
    labels.length < 2 ||
    labels.join(".").length > 253 ||
    !labels.every((l) => LABEL_RE.test(l)) ||
    !TLD_RE.test(tld)
  ) {
    throw new Error(`invalid domain ${JSON.stringify(input)}: not a valid hostname`);
  }
  return labels.join(".");
}

/** Connector output is not user input — never throw on it, just canonicalize best-effort. */
function normalizeDomainLenient(domain: string): string {
  try {
    return normalizeDomain(domain);
  } catch {
    return String(domain ?? "").trim().toLowerCase();
  }
}

/** Normalize (strict) + dedupe, preserving first-seen order. */
export function normalizeDomains(domains: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const d of domains) {
    const n = normalizeDomain(d);
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

/** The FK a Message / blocked / error record uses for a contact. */
export function contactKeyOf(c: Contact): string {
  return c.email ?? `${c.name}@${normalizeDomainLenient(c.leadDomain)}`;
}

/** Merge leads by domain (first non-empty field wins; sources concatenated). */
function dedupeLeads(leads: Lead[]): Lead[] {
  const byDomain = new Map<string, Lead>();
  for (const raw of leads) {
    const lead = { ...raw, domain: normalizeDomainLenient(raw.domain) };
    const existing = byDomain.get(lead.domain);
    if (!existing) {
      byDomain.set(lead.domain, lead);
    } else {
      const sources = existing.source.split(",");
      byDomain.set(lead.domain, {
        ...existing,
        companyName: existing.companyName || lead.companyName,
        industry: existing.industry ?? lead.industry,
        size: existing.size ?? lead.size,
        description: existing.description ?? lead.description,
        source: sources.includes(lead.source) ? existing.source : `${existing.source},${lead.source}`,
      });
    }
  }
  return [...byDomain.values()];
}

/** Dedupe contacts by email when known, else by name+domain. */
function dedupeContacts(contacts: Contact[]): Contact[] {
  const byKey = new Map<string, Contact>();
  for (const raw of contacts) {
    const c = { ...raw, leadDomain: normalizeDomainLenient(raw.leadDomain) };
    const key = c.email ?? `${c.name.toLowerCase()}@${c.leadDomain}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, c);
    } else {
      byKey.set(key, {
        ...existing,
        email: existing.email ?? c.email,
        title: existing.title ?? c.title,
        linkedin: existing.linkedin ?? c.linkedin,
      });
    }
  }
  return [...byKey.values()];
}

// ──────────────────────────────────────────────────────────────────────────
// Connector invocation: deadline + sanitized failure status
// ──────────────────────────────────────────────────────────────────────────

class ConnectorTimeoutError extends Error {
  constructor(ms: number) {
    super(`connector exceeded ${ms}ms deadline`);
    this.name = "ConnectorTimeoutError";
  }
}

/**
 * Call `fn` with an AbortSignal that fires after `timeoutMs`, and ENFORCE the
 * deadline by racing — an adapter that ignores the signal still cannot hang the run.
 */
async function callWithDeadline<T>(fn: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const signal = AbortSignal.timeout(timeoutMs);
  let onAbort: () => void = () => {};
  const deadline = new Promise<never>((_, reject) => {
    onAbort = () => reject(new ConnectorTimeoutError(timeoutMs));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([fn(signal), deadline]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

/** Sanitized status only — never String(err), which can carry a secret-bearing URL. */
function failureStatus(err: unknown): number | string {
  if (err instanceof HttpError) return err.status;
  const name = (err as { name?: unknown } | null)?.name;
  if (err instanceof ConnectorTimeoutError || name === "TimeoutError" || name === "AbortError") return "timeout";
  return "error";
}

function recordConnectorFailure(
  connector: Connector,
  phase: ConnectorPhase,
  err: unknown,
  raw: Record<string, unknown>,
  failed: FailedConnector[],
): void {
  const status = failureStatus(err);
  raw[connector.name] = { failed: true, status };
  failed.push({ name: connector.name, phase, status });
}

function isPushOnly(name: string): boolean {
  // Push-only sinks (e.g. Clay) hand data off asynchronously and produce no records.
  return getConnector(name)?.pushOnly === true;
}

/**
 * Fold a connector's non-fatal per-item failures (one contact's lookup 5xx'd,
 * a vendor body failed schema validation) into `failedConnectors`, so a call
 * that "succeeded" with partial results is still visible in the run record.
 * Sanitized: HTTP status when known, else the reason ("schema" | "error").
 */
function recordItemFailures(
  connector: Connector,
  phase: ConnectorPhase,
  failures: readonly ConnectorItemFailure[] | undefined,
  failed: FailedConnector[],
): void {
  for (const f of failures ?? []) {
    failed.push({ name: connector.name, phase, status: f.status ?? f.reason });
  }
}

/**
 * Research one domain across every configured research connector, in order.
 * A connector that throws (or blows its deadline) is recorded in
 * `failedConnectors` and does not abort the run.
 */
export async function runResearch(
  domain: string,
  icp: string,
  opts: ConnectorRunOptions = {},
): Promise<ResearchResult> {
  registerBuiltinConnectors();
  const target = normalizeDomain(domain);
  const timeoutMs = opts.connectorTimeoutMs ?? DEFAULT_CONNECTOR_TIMEOUT_MS;
  const targeting = buyerTitlesArg(opts);
  const connectors = getConfiguredConnectors("research");
  const leads: Lead[] = [];
  const contacts: Contact[] = [];
  const raw: Record<string, unknown> = {};
  const ran: string[] = [];
  const skipped = getSkippedConnectors("research").map((c) => c.name);
  const failedConnectors: FailedConnector[] = [];

  for (const connector of connectors) {
    if (!connector.research) continue;
    try {
      const out = await callWithDeadline(
        (signal) => connector.research!({ domain: target, icp, ...targeting, signal }),
        timeoutMs,
      );
      leads.push(...out.leads);
      contacts.push(...out.contacts);
      raw[connector.name] = out.raw;
      ran.push(connector.name);
      recordItemFailures(connector, "research", out.failures, failedConnectors);
    } catch (err) {
      recordConnectorFailure(connector, "research", err, raw, failedConnectors);
    }
  }

  return {
    leads: dedupeLeads(leads),
    contacts: dedupeContacts(contacts),
    ran,
    skipped,
    failedConnectors,
    raw,
  };
}

/** Best-effort person name carried by a provider payload (several shapes in the wild). */
function payloadName(data: Record<string, unknown>): string | undefined {
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const direct = str(data.full_name) ?? str(data.fullName) ?? str(data.name);
  if (direct) return direct;
  const parts = [str(data.first_name) ?? str(data.firstName), str(data.last_name) ?? str(data.lastName)]
    .filter(Boolean)
    .join(" ");
  return parts || undefined;
}

const sameName = (a: string, b: string) =>
  a.trim().toLowerCase().replace(/\s+/g, " ") === b.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Fold verified emails from `found` into `working` contacts that lack one.
 * Attribution: the enrichment's `contactName`, else a name in its payload, else —
 * when exactly one contact was missing an email and exactly one new email came
 * back — that pair. Ambiguous matches are left alone (never guess an address).
 */
function foldVerifiedEmails(working: Contact[], found: Enrichment[]): Contact[] {
  const known = new Set(working.filter((c) => c.email).map((c) => c.email!.toLowerCase()));
  const candidates = found.filter(
    (e) =>
      e.subjectType === "contact" &&
      typeof e.verifiedEmail === "string" &&
      ContactSchema.shape.email.safeParse(e.verifiedEmail).success &&
      !known.has(e.verifiedEmail.toLowerCase()),
  );
  if (candidates.length === 0) return working;

  const next = working.map((c) => ({ ...c }));
  const needy = () => next.filter((c) => !c.email);
  const unattributed: Enrichment[] = [];
  for (const e of candidates) {
    const name = e.contactName ?? payloadName(e.data ?? {});
    const match = name ? needy().find((c) => sameName(c.name, name)) : undefined;
    if (match) {
      match.email = e.verifiedEmail;
      known.add(e.verifiedEmail!.toLowerCase());
    } else {
      unattributed.push(e);
    }
  }
  const stillNeedy = needy();
  if (unattributed.length === 1 && stillNeedy.length === 1) {
    stillNeedy[0]!.email = unattributed[0]!.verifiedEmail;
  }
  return next;
}

/**
 * Enrich a lead + its contacts across every configured enrich connector, in order.
 * After each connector, newly verified emails are folded into the working contact
 * list, so a later (paid) connector never re-buys an email an earlier one found.
 */
export async function runEnrich(
  lead: Lead,
  contacts: Contact[],
  opts: ConnectorRunOptions = {},
): Promise<EnrichResult> {
  registerBuiltinConnectors();
  const timeoutMs = opts.connectorTimeoutMs ?? DEFAULT_CONNECTOR_TIMEOUT_MS;
  const targeting = buyerTitlesArg(opts);
  const connectors = getConfiguredConnectors("enrich");
  const enrichments: Enrichment[] = [];
  const raw: Record<string, unknown> = {};
  const ran: string[] = [];
  const skipped = getSkippedConnectors("enrich").map((c) => c.name);
  const failedConnectors: FailedConnector[] = [];
  let working = contacts.map((c) => ({ ...c }));

  for (const connector of connectors) {
    if (!connector.enrich) continue;
    try {
      const current = working;
      const out = await callWithDeadline(
        (signal) => connector.enrich!({ lead, contacts: current, ...targeting, signal }),
        timeoutMs,
      );
      enrichments.push(...out.enrichments);
      raw[connector.name] = out.raw;
      ran.push(connector.name);
      recordItemFailures(connector, "enrich", out.failures, failedConnectors);
      working = foldVerifiedEmails(working, out.enrichments);
    } catch (err) {
      recordConnectorFailure(connector, "enrich", err, raw, failedConnectors);
    }
  }

  return { enrichments, contacts: working, ran, skipped, failedConnectors, raw };
}

// ──────────────────────────────────────────────────────────────────────────
// Failure isolation helpers
// ──────────────────────────────────────────────────────────────────────────

const MAX_ERROR_MESSAGE = 500;

/** Error text for the audit trail: secrets redacted, length-capped. */
function sanitizeErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "unknown error";
  const redacted = msg
    .replace(/([?&](?:api[_-]?key|key|token|access_token|secret|password)=)[^&\s"']+/gi, "$1[redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [redacted]")
    .replace(/\b(sk|xai|gsk|pk)-[A-Za-z0-9_-]{8,}/g, "$1-[redacted]");
  return redacted.length > MAX_ERROR_MESSAGE ? `${redacted.slice(0, MAX_ERROR_MESSAGE)}…` : redacted;
}

/** Only the cache counts that are present and positive (so costFor sees exactly what was billed). */
function cacheOf(u: { cacheReadTokens?: number; cacheWriteTokens?: number }): CacheTokens {
  const pos = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
  const cacheReadTokens = pos(u.cacheReadTokens);
  const cacheWriteTokens = pos(u.cacheWriteTokens);
  return {
    ...(cacheReadTokens ? { cacheReadTokens } : {}),
    ...(cacheWriteTokens ? { cacheWriteTokens } : {}),
  };
}

/** Usage an LLM error may carry (AI SDK NoObjectGeneratedError has `.usage`). */
function usageFromError(
  err: unknown,
): { inputTokens: number; outputTokens: number; cache: CacheTokens } | undefined {
  const u = (err as { usage?: Record<string, unknown> } | null)?.usage;
  if (!u || typeof u !== "object") return undefined;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
  const inputTokens = num(u.inputTokens) || num(u.promptTokens);
  const outputTokens = num(u.outputTokens) || num(u.completionTokens);
  // AI SDK v7 nests the cache split under inputTokenDetails; our Usage flattens it.
  const details = (u.inputTokenDetails ?? {}) as Record<string, unknown>;
  const cache = cacheOf({
    cacheReadTokens: num(u.cacheReadTokens) || num(details.cacheReadTokens),
    cacheWriteTokens: num(u.cacheWriteTokens) || num(details.cacheWriteTokens),
  });
  return inputTokens || outputTokens ? { inputTokens, outputTokens, cache } : undefined;
}

function finishReasonFromError(err: unknown): string | undefined {
  const r = (err as { finishReason?: unknown } | null)?.finishReason;
  return typeof r === "string" && r ? r : undefined;
}

export type GateOutcome = { clean: true } | { clean: false; reason: string; error?: string };

/**
 * Run a pack's gate FAIL-CLOSED: only an explicit `{ status: "clean" }` passes.
 * Any other verdict (including typos like "BLOCKED", undefined, null) blocks; a
 * throwing (or rejecting) gate blocks with reason "gate-error: <msg>".
 */
export async function evaluateGate(gate: ComplianceGate, ctx: ComplianceContext): Promise<GateOutcome> {
  try {
    const verdict = await gate.check(ctx);
    if (verdict && verdict.status === "clean") return { clean: true };
    const reason =
      verdict && typeof verdict.reason === "string" && verdict.reason ? verdict.reason : "non-clean-verdict";
    return { clean: false, reason };
  } catch (err) {
    const message = sanitizeErrorMessage(err);
    return { clean: false, reason: `gate-error: ${message}`, error: message };
  }
}

/** Enrichments attached to this lead (by domain) or this contact (by email). */
export function enrichmentsFor(lead: Lead, contact: Contact, all: Enrichment[]): Enrichment[] {
  const email = contact.email?.toLowerCase();
  return all.filter((e) =>
    e.subjectType === "lead"
      ? normalizeDomainLenient(e.subjectKey) === lead.domain
      : !!email && (e.subjectKey.toLowerCase() === email || e.verifiedEmail?.toLowerCase() === email),
  );
}

export interface RunStatusInput {
  /** Messages that passed validation. */
  messages: number;
  /** Leads surfaced by research. */
  leads: number;
  /** Did at least one (non push-only) research connector run? */
  researchRan: boolean;
  /** Isolated per-lead/contact failures (`run.errors.length`). */
  errors: number;
}

/**
 * The ONE place a run's status is decided (runCampaign + the MCP save path).
 *
 *   messages && no errors             → complete
 *   messages && some errors           → partial (some lead/contact step FAILED)
 *   no messages && errors             → failed  (every LLM/gate step that ran failed)
 *   no messages && leads              → enriched
 *   no messages && research ran       → researched (honest empty result)
 *   nothing ran                       → failed
 *
 * Rejected drafts (model declines of out-of-ICP contacts, send-safety guard
 * rejections) and blocked contacts are DECISIONS the pipeline made correctly,
 * recorded for the audit trail; they never degrade the status. "partial" means
 * something broke (a provider/gate error), so the operator should look.
 */
export function deriveRunStatus(s: RunStatusInput): RunStatus {
  if (s.messages > 0) return s.errors > 0 ? "partial" : "complete";
  if (s.errors > 0) return "failed";
  if (s.leads > 0) return "enriched";
  if (s.researchRan) return "researched";
  return "failed";
}

// ──────────────────────────────────────────────────────────────────────────
// Shared message-compliance helpers (runCampaign + the MCP save_run path)
// ──────────────────────────────────────────────────────────────────────────

/**
 * The gate every run applies: the suppression list FIRST (an unsubscribe is not
 * vertical-specific — swapping packs must never drop it), then the pack's own
 * gate. Run it through `evaluateGate` so it fails closed.
 */
export function campaignGate(pack: { compliance: ComplianceGate }, suppressions: SuppressionList): ComplianceGate {
  return composeGates(suppressionGate(suppressions), pack.compliance);
}

const zodIssues = (issues: readonly { path: PropertyKey[]; message: string }[]) =>
  issues.map((i) => `${i.path.map(String).join(".") || "(root)"}: ${i.message}`);

/**
 * Validate a drafted message, append the CAN-SPAM footer IN CODE (never by the
 * model), and re-validate — so only gate-checked values are ever recorded.
 */
export function finalizeDraft(
  candidate: unknown,
  sender: SenderIdentity | undefined,
): { ok: true; message: Message } | { ok: false; issues: string[] } {
  const validated = validateMessage(candidate);
  if (!validated.ok) return { ok: false, issues: zodIssues(validated.error.issues) };
  const footed = validateMessage(applyComplianceFooter(validated.value, sender));
  if (!footed.ok) return { ok: false, issues: zodIssues(footed.error.issues) };
  return { ok: true, message: footed.value as Message };
}

/** The run-level warning for email drafts that could not carry a CAN-SPAM footer. */
export function senderComplianceWarnings(draftsMissingSender: number, sender: SenderIdentity | undefined): string[] {
  if (draftsMissingSender <= 0) return [];
  const missing = missingSenderFields(sender).join(", ");
  return [
    `${draftsMissingSender} email draft(s) have NO CAN-SPAM footer: sender identity is not configured ` +
      `(missing: ${missing}). Set profile.sender { name, company, postalAddress } before sending.`,
  ];
}

/**
 * Identifier allowlist for `guardDraft` on a draft the SEAM did not produce (an
 * agent-written draft saved via MCP). Mirrors the seam's rule: structured
 * identifier fields + the user's own text only — never connector free text, so
 * an injected link cannot vouch for itself.
 */
export function draftIdentifiers(p: {
  icp: string;
  lead: Lead;
  contact: Contact;
  enrichments?: readonly Enrichment[];
  userText?: readonly (string | undefined)[];
}): string[] {
  const out: (string | undefined)[] = [p.icp, ...(p.userText ?? []), p.lead.domain, p.contact.email, p.contact.linkedin];
  for (const e of p.enrichments ?? []) out.push(e.verifiedEmail, e.phone);
  return out.filter((s): s is string => typeof s === "string" && s.length > 0);
}

/** A draft written outside the seam (e.g. by the Claude Code agent) awaiting the gates. */
export interface ExternalDraft {
  contactKey: string;
  channel: "email" | "linkedin";
  subject?: string | null | undefined;
  body: string;
  cta: string;
  fitScore?: number | undefined;
  /** Caller-claimed; defaults to the run's model. */
  model?: string | undefined;
  /** Caller-claimed; defaults to "agent". */
  promptVersion?: string | undefined;
}

export interface MessageComplianceInput {
  icp: string;
  leads: readonly Lead[];
  contacts: readonly Contact[];
  enrichments: readonly Enrichment[];
  drafts: readonly ExternalDraft[];
  /** Usually `campaignGate(pack, suppressions)`. */
  gate: ComplianceGate;
  sender?: SenderIdentity | undefined;
  /** Default `Message.model` when a draft does not claim one. */
  model: string;
  now: () => string;
  /** User-owned text (profile style override) whose identifiers a draft may repeat. */
  userText?: readonly (string | undefined)[];
  /** Operator voice rules (Report Profile `voice`); enforced by the same guard as the seam path. */
  voice?: VoiceRules | undefined;
}

export interface MessageComplianceResult {
  messages: Message[];
  blockedContacts: { contactKey: string; reason: string }[];
  rejectedDrafts: { contactKey: string; issues: string[] }[];
  errors: RunError[];
  complianceWarnings: string[];
}

/**
 * Run externally written drafts through EXACTLY the gates runCampaign applies:
 * suppression + pack compliance (fail-closed), the send-safety draft guard,
 * schema validation, and the code-appended CAN-SPAM footer.
 *
 *   unknown contactKey        → rejectedDrafts (never guessed onto a contact)
 *   gate blocks               → blockedContacts (never saved as a message)
 *   guard / schema fails      → rejectedDrafts
 *   email + no sender         → saved, flagged needsSenderIdentity + warning
 */
export async function applyMessageCompliance(input: MessageComplianceInput): Promise<MessageComplianceResult> {
  const messages: Message[] = [];
  const blockedContacts: { contactKey: string; reason: string }[] = [];
  const rejectedDrafts: { contactKey: string; issues: string[] }[] = [];
  const errors: RunError[] = [];
  let draftsMissingSender = 0;

  const contactsByKey = new Map<string, Contact>();
  for (const c of input.contacts) {
    const key = contactKeyOf(c).toLowerCase();
    if (!contactsByKey.has(key)) contactsByKey.set(key, c);
  }
  const leadsByDomain = new Map<string, Lead>();
  for (const l of input.leads) {
    const domain = normalizeDomainLenient(l.domain);
    if (!leadsByDomain.has(domain)) leadsByDomain.set(domain, { ...l, domain });
  }

  for (const draft of input.drafts) {
    const contact = contactsByKey.get(draft.contactKey.toLowerCase());
    if (!contact) {
      rejectedDrafts.push({
        contactKey: draft.contactKey,
        issues: [
          "contactKey: no matching contact in `contacts` (use the contact's email, or name@domain when it has none)",
        ],
      });
      continue;
    }
    const contactKey = contactKeyOf(contact);
    const leadDomain = normalizeDomainLenient(contact.leadDomain);
    const lead: Lead = leadsByDomain.get(leadDomain) ?? { domain: leadDomain, companyName: leadDomain, source: "agent" };
    const enrichments = enrichmentsFor(lead, contact, [...input.enrichments]);

    const outcome = await evaluateGate(input.gate, { lead, contact, now: new Date(input.now()), enrichments });
    if (!outcome.clean) {
      if (!blockedContacts.some((b) => b.contactKey === contactKey)) {
        blockedContacts.push({ contactKey, reason: outcome.reason });
      }
      if (outcome.error !== undefined) {
        errors.push({ domain: lead.domain, contactKey, stage: "gate", message: outcome.error });
      }
      continue;
    }

    // LinkedIn has no subject line: normalize rather than reject (as the seam does).
    const subject = draft.channel === "linkedin" ? null : (draft.subject ?? null);
    const verdict = guardDraft(
      { subject, body: draft.body, cta: draft.cta },
      {
        allowedText: draftIdentifiers({ icp: input.icp, lead, contact, enrichments, userText: input.userText ?? [] }),
        ...(input.voice ? { voice: input.voice } : {}),
      },
    );
    if (!verdict.ok) {
      rejectedDrafts.push({ contactKey, issues: verdict.issues });
      continue;
    }

    const finalized = finalizeDraft(
      {
        contactKey,
        channel: draft.channel,
        subject: subject ?? undefined,
        body: draft.body,
        cta: draft.cta,
        ...(draft.fitScore !== undefined ? { fitScore: draft.fitScore } : {}),
        model: draft.model ?? input.model,
        promptVersion: draft.promptVersion ?? "agent",
        createdAt: input.now(),
      },
      input.sender,
    );
    if (!finalized.ok) {
      rejectedDrafts.push({ contactKey, issues: finalized.issues });
      continue;
    }
    if (finalized.message.needsSenderIdentity) draftsMissingSender += 1;
    messages.push(finalized.message);
  }

  return {
    messages,
    blockedContacts,
    rejectedDrafts,
    errors,
    complianceWarnings: senderComplianceWarnings(draftsMissingSender, input.sender),
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Report Profile references (CLI --profile, MCP save_run `profile`)
// ──────────────────────────────────────────────────────────────────────────

const PROFILE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/**
 * Resolve a profile reference to a file path. A ref containing a path
 * separator or ending in `.json` is a PATH (relative to `cwd`). Anything else
 * is a bare NAME, looked up as `<name>.json` in, in order:
 * `<cwd>/profiles/`, `${INTENT_OUTREACH_HOME}/profiles/`, then the profiles
 * shipped with the package. Names are restricted to `[A-Za-z0-9_-]` so a name
 * can never traverse out of those roots.
 */
export function resolveProfilePath(ref: string, cwd: string = process.cwd()): string {
  const trimmed = ref.trim();
  if (!trimmed) throw new Error("profile: empty reference");
  if (/[\\/]/.test(trimmed) || trimmed.toLowerCase().endsWith(".json")) {
    return isAbsolute(trimmed) ? trimmed : resolve(cwd, trimmed);
  }
  if (!PROFILE_NAME_RE.test(trimmed)) throw new Error(`profile: invalid name ${JSON.stringify(trimmed)}`);
  const here = dirname(fileURLToPath(import.meta.url));
  const roots = [join(cwd, "profiles"), join(intentOutreachHome(), "profiles"), join(here, "..", "profiles")];
  for (const root of roots) {
    const candidate = join(root, `${trimmed}.json`);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`profile not found: ${trimmed} (looked in: ${roots.join(", ")})`);
}

/** Load + validate a profile by path or name (see resolveProfilePath). */
export function loadProfileRef(ref: string, cwd?: string): ReportProfile {
  return loadProfile(resolveProfilePath(ref, cwd));
}

// ──────────────────────────────────────────────────────────────────────────
// runCampaign — the full deterministic-control-flow pipeline with the LLM seam.
// research → enrich → SCORE (llm) → GATE → DRAFT (llm) → VALIDATE → CampaignRun.
// ──────────────────────────────────────────────────────────────────────────

export interface RunCampaignInput {
  /** Caller-supplied run id (no Date.now/random in core). */
  id: string;
  icp: string;
  domains: string[];
  channel?: "email" | "linkedin";
  /** Skip drafting for leads scoring below this (0–100). Default 0 = draft all. */
  minScore?: number;
  /** Contacts to draft per lead. Default 1. */
  maxContactsPerLead?: number;
  /**
   * Buyer titles (profile `filtering.contactTitles`, CLI `--buyer-titles`). When
   * set, each lead's contacts are ranked buyers-first before the maxContactsPerLead
   * slice, and connectors aim people search/reveals at them. Absent ⇒ unchanged order.
   */
  buyerTitles?: string[];
  /** Injected provider (tests/evals). Default: getProvider() from env (eval-gated). */
  provider?: LLMProvider;
  /** Injected clock for determinism in tests. Default: real wall clock. */
  now?: () => string;
  /** Verbatim tone/length override from a Report Profile. */
  styleOverride?: string;
  /** Operator voice rules from a Report Profile (`voice`), enforced by the draft guard. */
  voice?: VoiceRules;
  /** Which pack to run. Default: "b2b-sdr" (today's behavior). */
  pack?: string;
  /** Max distinct (normalized) domains per run. Default 25. */
  maxDomains?: number;
  /** Explicit opt-in to exceed `maxDomains`. */
  allowLarge?: boolean;
  /** Per-connector-invocation deadline in ms. Default 90s. */
  connectorTimeoutMs?: number;
  /**
   * Sender identity for the code-appended CAN-SPAM footer on email drafts
   * (Report Profile `sender`). Absent ⇒ email drafts are flagged
   * `needsSenderIdentity` and a run-level `complianceWarnings` entry is recorded.
   */
  sender?: SenderIdentity;
  /**
   * Suppression (opt-out) list. Default: loaded from
   * `${INTENT_OUTREACH_HOME}/suppressions.jsonl` (missing file ⇒ nothing suppressed).
   */
  suppressions?: SuppressionList;
}

export interface RunCampaignResult {
  run: Validated<CampaignRun>;
  cost: ReturnType<CostMeter["summary"]>;
}

export async function runCampaign(input: RunCampaignInput): Promise<RunCampaignResult> {
  const { icp } = input;
  // Validate + bound the input BEFORE spending anything (provider, connectors).
  const domains = normalizeDomains(input.domains);
  const maxDomains = input.maxDomains ?? DEFAULT_MAX_DOMAINS;
  if (domains.length > maxDomains && !input.allowLarge) {
    throw new Error(
      `runCampaign: ${domains.length} domains exceeds maxDomains=${maxDomains}; ` +
        `split the list or pass allowLarge: true to run it anyway`,
    );
  }
  const now = input.now ?? (() => new Date().toISOString());
  const channel = input.channel ?? "email";
  const minScore = input.minScore ?? 0;
  const maxContacts = input.maxContactsPerLead ?? 1;
  const buyerTitles = cleanBuyerTitles(input.buyerTitles);
  const connectorOpts: ConnectorRunOptions = {
    ...(input.connectorTimeoutMs ? { connectorTimeoutMs: input.connectorTimeoutMs } : {}),
    ...(buyerTitles.length > 0 ? { buyerTitles } : {}),
  };
  // Opt-outs are loaded (I/O, pipeline layer) BEFORE anything is spent; a corrupt
  // suppression file throws here — fail closed rather than draft to an opt-out.
  const suppressions = input.suppressions ?? (await loadSuppressionList());
  const provider = input.provider ?? (await getProvider());
  registerBuiltinPacks();
  const pack = resolvePack(input.pack);
  // The suppression gate runs FIRST for EVERY pack (an unsubscribe is not
  // vertical-specific — swapping packs must never drop it), then the pack's own
  // gate. Both run under evaluateGate's fail-closed handling.
  const gate = campaignGate(pack, suppressions);
  const meter = new CostMeter();
  const createdAt = now();

  const allLeads: Lead[] = [];
  const allContacts: Contact[] = [];
  const allEnrichments: Enrichment[] = [];
  const messages: Message[] = [];
  const blockedContacts: { contactKey: string; reason: string }[] = [];
  const errors: RunError[] = [];
  const rejectedDrafts: { contactKey: string; issues: string[] }[] = [];
  const failedConnectors: FailedConnector[] = [];
  const skipped = new Set<string>();
  let anyResearchRan = false;
  const droppedAngles: { domain: string; angle: string; reason: string }[] = [];
  const promptRefs: { score?: string[]; draft?: string } = {};
  let draftsMissingSender = 0;

  // Cache-aware: the run total uses the same costFor split as the per-call Usage.
  const recordUsage = (u: Usage) => meter.record(provider.model, u.inputTokens, u.outputTokens, cacheOf(u));

  const recordError = (err: unknown, where: Omit<RunError, "message" | "finishReason">) => {
    const usage = usageFromError(err);
    if (usage) meter.record(provider.model, usage.inputTokens, usage.outputTokens, usage.cache);
    const finishReason = finishReasonFromError(err);
    errors.push({ ...where, message: sanitizeErrorMessage(err), ...(finishReason ? { finishReason } : {}) });
  };

  for (const domain of domains) {
    const research = await runResearch(domain, icp, connectorOpts);
    research.skipped.forEach((s) => skipped.add(s));
    failedConnectors.push(...research.failedConnectors);
    // A push-only sink (e.g. Clay) "running" is not research having happened.
    if (research.ran.some((name) => !isPushOnly(name))) anyResearchRan = true;

    for (const lead of research.leads) {
      const leadContacts = research.contacts.filter((c) => c.leadDomain === lead.domain);
      const enrich = await runEnrich(lead, leadContacts, connectorOpts);
      enrich.skipped.forEach((s) => skipped.add(s));
      failedConnectors.push(...enrich.failedConnectors);
      const contacts = enrich.contacts; // emails found during enrichment folded in

      allLeads.push(lead);
      allContacts.push(...contacts);
      allEnrichments.push(...enrich.enrichments);

      // SCORE seam (LLM) — never trusted as a record, only as a routing signal.
      // Isolated: a provider error here costs THIS lead, not the run.
      let scored: Awaited<ReturnType<typeof scoreLead>>;
      try {
        scored = await scoreLead(provider, {
          icp,
          lead,
          contacts,
          enrichments: enrich.enrichments,
          scorePrompts: pack.prompts.score,
        });
      } catch (err) {
        recordError(err, { domain: lead.domain, stage: "score" });
        continue;
      }
      recordUsage(scored.usage);
      promptRefs.score ??= scored.promptRefs;
      for (const d of scored.droppedAngles ?? []) droppedAngles.push({ domain: lead.domain, ...d });
      if (scored.object.fitScore < minScore) continue;

      // COMPLIANCE gate (pack-supplied, FAIL-CLOSED) — runs BEFORE drafting so a
      // blocked contact never burns LLM tokens. Blocked contacts are recorded for
      // the audit trail and do not consume a draft slot. The suppression list
      // applies to every pack, b2b-sdr included.
      const eligible: Contact[] = [];
      for (const contact of contacts) {
        const contactKey = contactKeyOf(contact);
        const outcome = await evaluateGate(gate, {
          lead,
          contact,
          now: new Date(now()),
          enrichments: enrichmentsFor(lead, contact, enrich.enrichments),
        });
        if (outcome.clean) {
          eligible.push(contact);
        } else {
          blockedContacts.push({ contactKey, reason: outcome.reason });
          if (outcome.error !== undefined) {
            errors.push({ domain: lead.domain, contactKey, stage: "gate", message: outcome.error });
          }
        }
      }

      // DRAFT seam (LLM) — output goes through the validator before it can persist.
      // Buyers first (deterministic, stable; identity without buyer titles).
      for (const contact of rankContactsByTitle(eligible, buyerTitles).slice(0, maxContacts)) {
        const contactKey = contactKeyOf(contact);
        let drafted: Awaited<ReturnType<typeof draftMessage>>;
        try {
          drafted = await draftMessage(provider, {
            icp,
            lead,
            contact,
            angles: scored.object.angles,
            channel,
            draftPrompt: pack.prompts.draft,
            // Never shown to the model; widens the guard allowlist to verified emails/phones.
            enrichments: enrichmentsFor(lead, contact, enrich.enrichments),
            ...(input.styleOverride ? { styleOverride: input.styleOverride } : {}),
            ...(input.voice ? { voice: input.voice } : {}),
          });
        } catch (err) {
          if (err instanceof DraftRejectedError) {
            // A structurally valid draft that failed the send-safety guard: an audit
            // record of what the model tried, not a pipeline failure. Still metered.
            recordUsage(err.usage);
            rejectedDrafts.push({ contactKey, issues: err.issues });
          } else {
            recordError(err, { domain: lead.domain, contactKey, stage: "draft" });
          }
          continue;
        }
        recordUsage(drafted.usage);
        promptRefs.draft ??= drafted.promptRef;

        // Validate → CAN-SPAM footer appended by CODE → re-validate (finalizeDraft).
        const finalized = finalizeDraft(
          {
            contactKey,
            channel,
            subject: drafted.object.subject ?? undefined,
            body: drafted.object.body,
            cta: drafted.object.cta,
            fitScore: scored.object.fitScore,
            model: provider.model,
            // Provenance: the exact prompt file + content hash that drafted this.
            promptVersion: drafted.promptRef,
            createdAt: now(),
          },
          input.sender,
        );
        if (finalized.ok) {
          if (finalized.message.needsSenderIdentity) draftsMissingSender += 1;
          messages.push(finalized.message);
        } else {
          rejectedDrafts.push({ contactKey, issues: finalized.issues });
        }
      }
    }
  }

  const complianceWarnings = senderComplianceWarnings(draftsMissingSender, input.sender);

  const status = deriveRunStatus({
    messages: messages.length,
    leads: allLeads.length,
    researchRan: anyResearchRan,
    errors: errors.length,
  });

  // Final gate: the whole record must pass the validator to become a record.
  const run = assertCampaignRun({
    id: input.id,
    schemaVersion: SCHEMA_VERSION,
    vertical: pack.id,
    icp,
    domains,
    provider: provider.name,
    model: provider.model,
    status,
    leads: dedupeLeads(allLeads),
    contacts: dedupeContacts(allContacts),
    enrichments: allEnrichments,
    messages,
    costUsd: meter.summary().spentUsd,
    skippedConnectors: [...skipped],
    blockedContacts,
    errors,
    rejectedDrafts,
    failedConnectors,
    complianceWarnings,
    promptRefs,
    droppedAngles,
    origin: "pipeline",
    createdAt,
    finishedAt: now(),
  });

  return { run, cost: meter.summary() };
}
