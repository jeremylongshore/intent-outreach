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
import type { Connector, ConnectorPhase } from "./connectors/types.js";
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
import { CostMeter } from "./cost.js";
import { draftMessage, scoreLead } from "./seam.js";
import { registerBuiltinPacks, resolvePack } from "./packs/index.js";
import type { ComplianceContext, Pack } from "./packs/types.js";

/** Default ceiling on domains per campaign (override with `allowLarge`). */
export const DEFAULT_MAX_DOMAINS = 25;
/** Default deadline for ONE connector invocation. */
export const DEFAULT_CONNECTOR_TIMEOUT_MS = 90_000;

export interface ConnectorRunOptions {
  /** Per-connector-invocation deadline in ms. Default 90s. */
  connectorTimeoutMs?: number;
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
function contactKeyOf(c: Contact): string {
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
  // `pushOnly` is an optional Connector flag (push-only sinks like Clay produce
  // no research data). Read structurally so this works before/after it is typed.
  return (getConnector(name) as { pushOnly?: boolean } | undefined)?.pushOnly === true;
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
        (signal) => connector.research!({ domain: target, icp, signal }),
        timeoutMs,
      );
      leads.push(...out.leads);
      contacts.push(...out.contacts);
      raw[connector.name] = out.raw;
      ran.push(connector.name);
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
        (signal) => connector.enrich!({ lead, contacts: current, signal }),
        timeoutMs,
      );
      enrichments.push(...out.enrichments);
      raw[connector.name] = out.raw;
      ran.push(connector.name);
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

/** Usage an LLM error may carry (AI SDK NoObjectGeneratedError has `.usage`). */
function usageFromError(err: unknown): { inputTokens: number; outputTokens: number } | undefined {
  const u = (err as { usage?: Record<string, unknown> } | null)?.usage;
  if (!u || typeof u !== "object") return undefined;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
  const inputTokens = num(u.inputTokens) || num(u.promptTokens);
  const outputTokens = num(u.outputTokens) || num(u.completionTokens);
  return inputTokens || outputTokens ? { inputTokens, outputTokens } : undefined;
}

function finishReasonFromError(err: unknown): string | undefined {
  const r = (err as { finishReason?: unknown } | null)?.finishReason;
  return typeof r === "string" && r ? r : undefined;
}

type GateOutcome = { clean: true } | { clean: false; reason: string; error?: string };

/**
 * Run a pack's gate FAIL-CLOSED: only an explicit `{ status: "clean" }` passes.
 * Any other verdict (including typos like "BLOCKED", undefined, null) blocks; a
 * throwing (or rejecting) gate blocks with reason "gate-error: <msg>".
 */
async function evaluateGate(pack: Pack, ctx: ComplianceContext): Promise<GateOutcome> {
  try {
    const verdict = await pack.compliance.check(ctx);
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
function enrichmentsFor(lead: Lead, contact: Contact, all: Enrichment[]): Enrichment[] {
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
  /** Drafts rejected by the validator (`run.rejectedDrafts.length`). */
  rejectedDrafts?: number;
}

/**
 * The ONE place a run's status is decided (runCampaign + the MCP save path).
 *
 *   messages && no errors/rejections → complete
 *   messages && some errors/rejections → partial
 *   no messages && errors             → failed  (every LLM/gate step that ran failed)
 *   no messages && leads              → enriched
 *   no messages && research ran       → researched (honest empty result)
 *   nothing ran                       → failed
 */
export function deriveRunStatus(s: RunStatusInput): RunStatus {
  const degraded = s.errors > 0 || (s.rejectedDrafts ?? 0) > 0;
  if (s.messages > 0) return degraded ? "partial" : "complete";
  if (s.errors > 0) return "failed";
  if (s.leads > 0) return "enriched";
  if (s.researchRan) return "researched";
  return "failed";
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
  /** Injected provider (tests/evals). Default: getProvider() from env (eval-gated). */
  provider?: LLMProvider;
  /** Injected clock for determinism in tests. Default: real wall clock. */
  now?: () => string;
  /** Verbatim tone/length override from a Report Profile. */
  styleOverride?: string;
  /** Which pack to run. Default: "b2b-sdr" (today's behavior). */
  pack?: string;
  /** Max distinct (normalized) domains per run. Default 25. */
  maxDomains?: number;
  /** Explicit opt-in to exceed `maxDomains`. */
  allowLarge?: boolean;
  /** Per-connector-invocation deadline in ms. Default 90s. */
  connectorTimeoutMs?: number;
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
  const connectorOpts: ConnectorRunOptions = input.connectorTimeoutMs
    ? { connectorTimeoutMs: input.connectorTimeoutMs }
    : {};
  const provider = input.provider ?? (await getProvider());
  registerBuiltinPacks();
  const pack = resolvePack(input.pack);
  // Provenance comes from the prompt file that actually drafted (pack-supplied).
  const promptVersion = pack.prompts.draft.replace(/\.md$/i, "");
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

  const recordError = (err: unknown, where: Omit<RunError, "message" | "finishReason">) => {
    const usage = usageFromError(err);
    if (usage) meter.record(provider.model, usage.inputTokens, usage.outputTokens);
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
      meter.record(provider.model, scored.usage.inputTokens, scored.usage.outputTokens);
      if (scored.object.fitScore < minScore) continue;

      // COMPLIANCE gate (pack-supplied, FAIL-CLOSED) — runs BEFORE drafting so a
      // blocked contact never burns LLM tokens. Blocked contacts are recorded for
      // the audit trail and do not consume a draft slot. b2b-sdr's gate is a no-op.
      const eligible: Contact[] = [];
      for (const contact of contacts) {
        const contactKey = contactKeyOf(contact);
        const outcome = await evaluateGate(pack, {
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
      for (const contact of eligible.slice(0, maxContacts)) {
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
            ...(input.styleOverride ? { styleOverride: input.styleOverride } : {}),
          });
        } catch (err) {
          recordError(err, { domain: lead.domain, contactKey, stage: "draft" });
          continue;
        }
        meter.record(provider.model, drafted.usage.inputTokens, drafted.usage.outputTokens);

        const candidate = {
          contactKey,
          channel,
          subject: drafted.object.subject ?? undefined,
          body: drafted.object.body,
          cta: drafted.object.cta,
          fitScore: scored.object.fitScore,
          model: provider.model,
          promptVersion,
          createdAt: now(),
        };
        const validated = validateMessage(candidate);
        if (validated.ok) {
          messages.push(validated.value);
        } else {
          rejectedDrafts.push({
            contactKey,
            issues: validated.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
          });
        }
      }
    }
  }

  const status = deriveRunStatus({
    messages: messages.length,
    leads: allLeads.length,
    researchRan: anyResearchRan,
    errors: errors.length,
    rejectedDrafts: rejectedDrafts.length,
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
    createdAt,
    finishedAt: now(),
  });

  return { run, cost: meter.summary() };
}
