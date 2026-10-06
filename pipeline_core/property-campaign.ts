/**
 * pipeline_core/property-campaign.ts — the PROPERTY campaign loop.
 *
 * runCampaign drafts to people at companies found by domain. A property
 * campaign drafts to the OWNER OF RECORD of parcels found by a typed query
 * (an area or specific parcels). It reuses every building block of the B2B
 * loop and adds none of its own enforcement:
 *
 *   research    runResearchQuery, with the pack's fixed routing, the run's
 *               credit budget and the response cache
 *   gate        the engine's suppression check (owner mailing address and
 *               every contact point) FIRST, then the pack's `propertyGate`;
 *               only exactly {status:"clean"} passes, a throw blocks
 *   score       scoreProperty (signals computed in code, FCRA-stripped facts,
 *               grounded reasons); below `minScore` is not drafted
 *   underwrite  the pack's deal math, in code, as quotable facts
 *   draft       draftPropertyMessage (guard + the pack's draft rules)
 *   finalize    validate → the channel footer appended in code → re-validate
 *   record      one validated CampaignRun (schema v6 property model)
 *
 * The engine never sends. A mail draft still has to pass checkSendable at the
 * moment it is mailed.
 */

import { checkSuppression, type SuppressionList } from "./compliance/suppression.js";
import { CostMeter, type Usage } from "./cost.js";
import type { SenderIdentity } from "./footer.js";
import { SCHEMA_VERSION } from "./models.js";
import type { CampaignRun, Channel, FailedConnector, Message, Ownership, Party, Property, ResearchQuery, RunError } from "./models.js";
import { registerBuiltinPacks, resolvePack } from "./packs/index.js";
import type { ComplianceResult, Pack, PropertyGateContext } from "./packs/types.js";
import {
  deriveRunStatus,
  finalizeDraft,
  mergePropertyModel,
  runPropertyEnrich,
  runResearchQuery,
  senderComplianceWarnings,
  type ConnectorRunOptions,
  type PropertyModel,
} from "./pipeline.js";
import { draftPropertyMessage, formatAddress, propertySignals, scoreProperty, type UnderwritingFact } from "./property-seam.js";
import { getProvider, type LLMProvider } from "./providers.js";
import { capabilityForQuery, CreditBudget, type ResponseCache } from "./routing.js";
import { DraftRejectedError } from "./seam.js";
import { loadSuppressionList } from "./suppressions.js";
import { assertCampaignRun, type Validated } from "./validator.js";

export interface RunPropertyCampaignInput {
  id: string;
  /** The agent's offer and market, in the user's words. */
  icp: string;
  queries: ResearchQuery[];
  /** Pack id. Default "residential-re". */
  pack?: string;
  /** Default "mail": free public records give the owner's mailing address. */
  channel?: Extract<Channel, "mail" | "email">;
  minScore?: number;
  /** Ceiling on properties scored per run (cost control). Default 25. */
  maxProperties?: number;
  provider?: LLMProvider;
  /** A separate (usually cheaper) model for the SCORE seam; `provider` drafts. */
  scoreProvider?: LLMProvider;
  now?: () => string;
  sender?: SenderIdentity;
  suppressions?: SuppressionList;
  budgetCredits?: number;
  cache?: ResponseCache;
  connectorTimeoutMs?: number;
}

export interface RunPropertyCampaignResult {
  run: Validated<CampaignRun>;
  cost: ReturnType<CostMeter["summary"]>;
}

export const DEFAULT_PROPERTY_PACK = "residential-re";
export const DEFAULT_MAX_PROPERTIES = 25;

/** The owner a property campaign writes to: the first party recorded with role "owner", else the first party. */
export function ownerOf(property: Property, model: PropertyModel): Party | undefined {
  const own = model.ownerships.filter((o) => o.propertyKey === property.key);
  const pick = own.find((o) => o.role === "owner") ?? own[0];
  return pick ? model.parties.find((p) => p.key === pick.partyKey) : undefined;
}

/**
 * The engine's suppression check for one parcel: EVERY party recorded on it
 * (an opt-out by a co-owner covers mail to the property), EVERY contact point
 * of theirs of every kind, their mailing addresses, and the property address
 * itself. A suppressed anything blocks.
 */
function propertySuppression(ctx: PropertyGateContext, suppressions: SuppressionList): ComplianceResult {
  const keys = new Set(ctx.parties.map((p) => p.key));
  const points = ctx.contactPoints.filter((c) => keys.has(c.partyKey));
  const addresses = [
    formatAddress(ctx.property.address),
    ...ctx.parties.map((p) => formatAddress(p.mailingAddress)),
    ...points.filter((c) => c.kind === "mail").map((c) => c.value),
  ].filter((a): a is string => !!a);
  const phones = points.filter((c) => c.kind === "phone").map((c) => c.value);
  const emails = points.filter((c) => c.kind === "email").map((c) => c.value);
  for (const email of emails.length > 0 ? emails : [undefined]) {
    const r = checkSuppression(suppressions, { domains: [], addresses, phones, ...(email ? { email } : {}) });
    if (r.status !== "clean") return r;
  }
  return { status: "clean" };
}

function gateVerdict(
  pack: Pack,
  ctx: PropertyGateContext,
  suppressions: SuppressionList,
  channel: Channel,
): { ok: true } | { ok: false; reason: string; error?: string } {
  const suppression = propertySuppression(ctx, suppressions);
  if (suppression.status !== "clean") return { ok: false, reason: suppression.reason ?? "suppressed" };
  if (channel === "mail" && !ctx.owner.mailingAddress) return { ok: false, reason: "mail:no-address" };
  if (!pack.propertyGate) return { ok: true };
  let verdict: ComplianceResult | undefined;
  try {
    verdict = pack.propertyGate(ctx);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `gate-error: ${msg}`, error: msg };
  }
  if (verdict?.status === "clean") return { ok: true };
  return { ok: false, reason: verdict?.reason ?? "non-clean-verdict" };
}

export async function runPropertyCampaign(input: RunPropertyCampaignInput): Promise<RunPropertyCampaignResult> {
  if (input.queries.length === 0) throw new Error("runPropertyCampaign: at least one query is required");
  const now = input.now ?? (() => new Date().toISOString());
  const channel = input.channel ?? "mail";
  const minScore = input.minScore ?? 0;
  const maxProperties = input.maxProperties ?? DEFAULT_MAX_PROPERTIES;
  const suppressions = input.suppressions ?? (await loadSuppressionList());
  const provider = input.provider ?? (await getProvider());
  registerBuiltinPacks();
  const pack = resolvePack(input.pack ?? DEFAULT_PROPERTY_PACK);
  const budget = input.budgetCredits !== undefined ? new CreditBudget(input.budgetCredits) : undefined;
  const meter = new CostMeter();
  const createdAt = now();

  const model: PropertyModel = { properties: [], parties: [], ownerships: [], entityLinks: [], contactPoints: [] };
  const failedConnectors: FailedConnector[] = [];
  const skipped = new Set<string>();
  let researchRan = false;
  for (const query of input.queries) {
    const routing = pack.dataSources?.research?.[capabilityForQuery(query)];
    const opts: ConnectorRunOptions = {
      ...(input.connectorTimeoutMs ? { connectorTimeoutMs: input.connectorTimeoutMs } : {}),
      ...(routing ? { routing } : {}),
      ...(budget ? { budget } : {}),
      ...(input.cache ? { cache: input.cache } : {}),
    };
    const r = await runResearchQuery(query, input.icp, opts);
    if (r.ran.length > 0) researchRan = true;
    r.skipped.forEach((s) => skipped.add(s));
    for (const f of r.failedConnectors) {
      if (!failedConnectors.some((g) => g.name === f.name && g.phase === f.phase && g.status === f.status)) failedConnectors.push(f);
    }
    model.properties.push(...r.properties);
    model.parties.push(...r.parties);
    model.ownerships.push(...r.ownerships);
    model.entityLinks.push(...r.entityLinks);
    model.contactPoints.push(...r.contactPoints);
  }
  const merged = mergePropertyModel(model);

  const messages: Message[] = [];
  const blockedContacts: { contactKey: string; reason: string; propertyKey: string }[] = [];
  const rejectedDrafts: { contactKey: string; issues: string[]; propertyKey: string }[] = [];
  const errors: RunError[] = [];
  const droppedAngles: { propertyKey: string; angle: string; reason: string }[] = [];
  const warnings: string[] = [];
  /** Owners already written to in this run: one letter per owner, however many parcels they hold. */
  const contacted = new Map<string, string>();
  let scoredCount = 0;
  let overCap = 0;
  const promptRefs: { score?: string[]; draft?: string } = {};
  let draftsMissingSender = 0;
  const scoreProvider = input.scoreProvider ?? provider;
  const record = (u: Usage, model = provider.model) => meter.record(model, u.inputTokens, u.outputTokens);
  const fail = (err: unknown, property: Property, stage: RunError["stage"], contactKey?: string) => {
    if (err instanceof DraftRejectedError) record(err.usage);
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    errors.push({ propertyKey: property.key, stage, message, ...(contactKey ? { contactKey } : {}) });
  };

  // Pass 1: gate every property, one parcel per owner, up to the cap. Nothing is spent here.
  const selected: { property: Property; owner: Party; ctx: PropertyGateContext; nowDate: Date }[] = [];
  for (const property of merged.properties) {
    const owner = ownerOf(property, merged);
    if (!owner) {
      blockedContacts.push({ contactKey: property.key, reason: "owner:unknown", propertyKey: property.key });
      continue;
    }
    const nowDate = new Date(now());
    const ownerships = merged.ownerships.filter((o: Ownership) => o.propertyKey === property.key);
    const partyKeys = new Set(ownerships.map((o) => o.partyKey));
    const ctx: PropertyGateContext = {
      property,
      owner,
      parties: merged.parties.filter((p) => partyKeys.has(p.key)),
      ownerships,
      contactPoints: merged.contactPoints.filter((c) => partyKeys.has(c.partyKey)),
      now: nowDate,
    };
    const gate = gateVerdict(pack, ctx, suppressions, channel);
    if (!gate.ok) {
      blockedContacts.push({ contactKey: owner.key, reason: gate.reason, propertyKey: property.key });
      if (gate.error) errors.push({ propertyKey: property.key, contactKey: owner.key, stage: "gate", message: gate.error });
      continue;
    }
    if (contacted.has(owner.key)) {
      warnings.push(`${owner.key} also owns ${property.key}; one letter per owner per run (about ${contacted.get(owner.key)})`);
      continue;
    }
    // The cap counts properties that PASSED the gates, so blocked parcels never use it up.
    if (scoredCount >= maxProperties) {
      overCap += 1;
      continue;
    }
    scoredCount += 1;
    contacted.set(owner.key, property.key);
    selected.push({ property, owner, ctx, nowDate });
  }

  // Property enrichment (flood zones, ...) on the selected parcels only: adds facts, never overwrites.
  const enriched = await runPropertyEnrich(
    selected.map((x) => x.property),
    {
      ...(input.connectorTimeoutMs ? { connectorTimeoutMs: input.connectorTimeoutMs } : {}),
      ...(pack.dataSources?.enrich ? { routing: pack.dataSources.enrich } : {}),
      ...(budget ? { budget } : {}),
    },
  );
  enriched.skipped.forEach((s) => skipped.add(s));
  for (const f of enriched.failedConnectors) {
    if (!failedConnectors.some((g) => g.name === f.name && g.phase === f.phase && g.status === f.status)) failedConnectors.push(f);
  }
  const enrichedByKey = new Map(enriched.properties.map((p) => [p.key, p]));
  merged.properties = merged.properties.map((p) => enrichedByKey.get(p.key) ?? p);

  // Pass 2: score, underwrite, draft, finalize.
  for (const sel of selected) {
    const property = enrichedByKey.get(sel.property.key) ?? sel.property;
    const { owner, nowDate } = sel;
    const ctx: PropertyGateContext = { ...sel.ctx, property };

    const signals = propertySignals(property, owner, ctx.ownerships, nowDate);
    let scored: Awaited<ReturnType<typeof scoreProperty>>;
    try {
      scored = await scoreProperty(scoreProvider, { icp: input.icp, property, owner, signals, scorePrompts: pack.prompts.score });
      record(scored.usage, scoreProvider.model);
      promptRefs.score = scored.promptRefs;
      for (const d of scored.droppedReasons) droppedAngles.push({ propertyKey: property.key, angle: d.angle, reason: d.reason });
    } catch (err) {
      fail(err, property, "score", owner.key);
      continue;
    }
    if (scored.object.score < minScore) continue;

    let underwriting: readonly UnderwritingFact[] = [];
    try {
      underwriting = pack.underwriting?.(ctx) ?? [];
    } catch (err) {
      fail(err, property, "score", owner.key); // deal math is part of qualifying the lead
      continue;
    }

    let drafted: Awaited<ReturnType<typeof draftPropertyMessage>>;
    try {
      drafted = await draftPropertyMessage(provider, {
        icp: input.icp,
        property,
        owner,
        signals,
        reasons: scored.object.reasons,
        underwriting,
        channel,
        draftPrompt: pack.prompts.draft,
        ...(pack.draftRules ? { draftRules: pack.draftRules } : {}),
      });
      record(drafted.usage);
      promptRefs.draft = drafted.promptRef;
    } catch (err) {
      if (err instanceof DraftRejectedError) {
        record(err.usage);
        rejectedDrafts.push({ contactKey: owner.key, issues: err.issues, propertyKey: property.key });
      } else {
        fail(err, property, "draft", owner.key);
      }
      continue;
    }

    const finalized = finalizeDraft(
      {
        contactKey: owner.key,
        channel,
        ...(drafted.object.subject ? { subject: drafted.object.subject } : {}),
        body: drafted.object.body,
        cta: drafted.object.cta,
        fitScore: scored.object.score,
        model: provider.model,
        promptVersion: drafted.promptRef,
        createdAt: now(),
        propertyKey: property.key,
      },
      input.sender,
    );
    if (!finalized.ok) {
      rejectedDrafts.push({ contactKey: owner.key, issues: finalized.issues, propertyKey: property.key });
      continue;
    }
    if (finalized.message.needsSenderIdentity) draftsMissingSender += 1;
    messages.push(finalized.message);
  }
  if (overCap > 0) warnings.push(`${overCap} eligible propert(ies) not scored: maxProperties=${maxProperties} reached`);

  // A property run has no enrich phase: with no drafts it is "researched", never "enriched".
  const status = deriveRunStatus({ messages: messages.length, leads: 0, researchRan, errors: errors.length });
  const run = assertCampaignRun({
    id: input.id,
    schemaVersion: SCHEMA_VERSION,
    vertical: pack.id,
    icp: input.icp,
    domains: [],
    queries: input.queries,
    provider: provider.name,
    model: provider.model,
    ...(scoreProvider !== provider
      ? {
          seamModels: {
            score: { provider: scoreProvider.name, model: scoreProvider.model },
            draft: { provider: provider.name, model: provider.model },
          },
        }
      : {}),
    status,
    messages,
    costUsd: meter.summary().spentUsd,
    skippedConnectors: [...skipped],
    blockedContacts,
    errors,
    rejectedDrafts,
    failedConnectors,
    complianceWarnings: [...senderComplianceWarnings(draftsMissingSender, input.sender, channel), ...warnings],
    promptRefs,
    droppedAngles,
    origin: "pipeline",
    ...merged,
    ...(budget ? { credits: budget.summary() } : {}),
    createdAt,
    finishedAt: now(),
  });
  return { run, cost: meter.summary() };
}
