/**
 * evals/scorers.ts — deterministic (and one optional LLM) scorers for the seam outputs.
 *
 * The deterministic scorers are the CI gate: they need no key, no network, and
 * are byte-for-byte reproducible. A provider is "supported" only if every fixture
 * passes schemaConformance + draftContract + groundingHeuristic (see evals/run.ts).
 *
 * llmJudge is OPTIONAL and COSTS MONEY — it calls a real provider and is never
 * part of the offline/CI verdict.
 */

import {
  DraftOutputSchema,
  ScoreOutputSchema,
  type DraftContext,
  type DraftOutput,
  type ScoreContext,
  type ScoreOutput,
} from "../pipeline_core/seam.js";
import type { LLMProvider } from "../pipeline_core/providers.js";
import { z } from "zod";

/** One scorer's verdict. `findings` explains a fail (or warns on a pass). */
export interface ScoreResult {
  pass: boolean;
  findings: string[];
}

/** Draft length bounds (chars), aligned with outreach.v1.md word ceilings. */
export const DRAFT_BODY_MIN_CHARS = 20;
export const DRAFT_BODY_MAX_CHARS = 1200;

function ok(): ScoreResult {
  return { pass: true, findings: [] };
}
function fail(...findings: string[]): ScoreResult {
  return { pass: false, findings };
}

// ───────────────────────────── schemaConformance ─────────────────────────────

/**
 * Does the raw seam output parse against its schema? The seam already runs the
 * model output through generateObject, but a provider could hand back something
 * that drifts; this re-validates against the canonical schema as the gate.
 */
export function schemaConformance(
  kind: "score" | "draft",
  output: unknown,
): ScoreResult {
  const schema = kind === "score" ? ScoreOutputSchema : DraftOutputSchema;
  const parsed = schema.safeParse(output);
  if (parsed.success) return ok();
  const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`);
  return fail(`${kind} output failed ${kind === "score" ? "ScoreOutputSchema" : "DraftOutputSchema"}`, ...issues);
}

// ─────────────────────────────── draftContract ───────────────────────────────

/**
 * Beyond schema: a usable draft has a non-empty CTA, a body within length bounds,
 * and (for email) a subject. LinkedIn drafts must NOT carry a subject.
 */
export function draftContract(ctx: DraftContext, output: DraftOutput): ScoreResult {
  const findings: string[] = [];

  const cta = (output.cta ?? "").trim();
  if (cta.length === 0) findings.push("cta is empty");

  const body = (output.body ?? "").trim();
  if (body.length < DRAFT_BODY_MIN_CHARS) {
    findings.push(`body too short (${body.length} < ${DRAFT_BODY_MIN_CHARS} chars)`);
  }
  if (body.length > DRAFT_BODY_MAX_CHARS) {
    findings.push(`body too long (${body.length} > ${DRAFT_BODY_MAX_CHARS} chars)`);
  }

  const subject = (output.subject ?? "").trim();
  if (ctx.channel === "email" && subject.length === 0) {
    findings.push("email draft is missing a subject");
  }
  if (ctx.channel === "linkedin" && subject.length > 0) {
    findings.push("linkedin draft should not have a subject");
  }

  return findings.length === 0 ? ok() : fail(...findings);
}

// ───────────────────────────── groundingHeuristic ────────────────────────────

const FUNDING_VERB = /\b(raised|raising|secured|closed)\b/i;
const SERIES_ROUND = /\bseries\s+[a-k]\b/i;
const DOLLAR_FIGURE = /\$\s?\d[\d,.]*\s?(?:k|m|b|mm|bn|million|billion|thousand)?\b/i;
/** A capitalized multi-word phrase that looks like an investor/firm name. */
const NAMED_ENTITY = /\b[A-Z][a-zA-Z&.]+(?:\s+[A-Z][a-zA-Z&.]+){0,3}\b/g;

/** Normalize for substring containment: lowercase, collapse whitespace, drop most punctuation. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[$,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Build the corpus of facts the model is ALLOWED to state, from the fixture inputs. */
function allowedCorpus(ctx: DraftContext): string {
  const parts: string[] = [ctx.icp, ctx.lead.companyName, ctx.lead.industry ?? "", ...ctx.angles];
  // (DraftContext carries no enrichment; angles are the grounded carry-over from score().)
  return norm(parts.join("  ||  "));
}

/**
 * Cheap no-fabrication check. Flags funding/dollar/investor claims in the body
 * that are NOT supported by the fixture's angles/ICP/lead. Returns findings
 * (not just pass/fail) so a reviewer can see exactly what looked fabricated.
 *
 * Conservative by design: it only flags a funding-shaped claim when the body
 * actually uses a funding verb, a "Series X" token, or a dollar figure that the
 * inputs don't contain. A grounded mention of a round that IS in the angles passes.
 */
export function groundingHeuristic(ctx: DraftContext, output: DraftOutput): ScoreResult {
  const body = output.body ?? "";
  const corpus = allowedCorpus(ctx);
  const findings: string[] = [];

  // 1. Dollar figures not present in the inputs.
  for (const m of body.match(new RegExp(DOLLAR_FIGURE, "gi")) ?? []) {
    if (!corpus.includes(norm(m))) findings.push(`fabricated funding figure: "${m.trim()}"`);
  }

  // 2. "Series X" round claims not present in the inputs.
  const series = body.match(new RegExp(SERIES_ROUND, "gi")) ?? [];
  for (const m of series) {
    if (!corpus.includes(norm(m))) findings.push(`fabricated round claim: "${m.trim()}"`);
  }

  // 3. A funding verb ("raised", "closed", ...) when no round/funding signal exists in inputs.
  if (FUNDING_VERB.test(body)) {
    const inputsMentionFunding =
      FUNDING_VERB.test(corpus) || SERIES_ROUND.test(corpus) || DOLLAR_FIGURE.test(corpus);
    if (!inputsMentionFunding) {
      const verb = body.match(FUNDING_VERB)?.[0] ?? "raised";
      findings.push(`funding claim ("${verb}") with no funding signal in the inputs`);
    }
  }

  // 4. Named entities (likely investor/customer names) that don't appear in the inputs.
  //    Skip names that ARE the lead/contact, and skip single common words.
  const known = new Set(
    [
      norm(ctx.lead.companyName),
      norm(ctx.contact.name),
      ...ctx.angles.map(norm),
      norm(ctx.icp),
    ].flatMap((s) => s.split(" ")),
  );
  for (const m of body.match(NAMED_ENTITY) ?? []) {
    const phrase = norm(m);
    // Only treat as a potential named investor if it's multi-word and not in inputs/known tokens.
    const words = phrase.split(" ");
    const isMultiWord = words.length >= 2;
    const everyWordKnown = words.every((w) => known.has(w) || w.length <= 2);
    const inCorpus = corpus.includes(phrase);
    if (isMultiWord && /\b(ventures|capital|partners|fund|investor)\b/i.test(m) && !inCorpus && !everyWordKnown) {
      findings.push(`possibly fabricated investor/firm: "${m.trim()}"`);
    }
  }

  return findings.length === 0 ? ok() : fail(...findings);
}

// ─────────────────────────── llmJudge (OPTIONAL, $$$) ─────────────────────────

const JudgeSchema = z.object({
  grounded: z.boolean(),
  hasCta: z.boolean(),
  hallucinatedFacts: z.array(z.string()).default([]),
  rating: z.number().int().min(1).max(5),
  rationale: z.string(),
});
export type JudgeOutput = z.infer<typeof JudgeSchema>;

/**
 * OPTIONAL rubric scorer — REQUIRES A PROVIDER KEY AND COSTS MONEY.
 * Not part of the offline/CI verdict. Pass a real provider (e.g. from getProvider()).
 * Returns the structured judgment; callers decide how to weight it.
 */
export async function llmJudge(
  provider: LLMProvider,
  fixture: { icp: string; angles?: string[] },
  output: DraftOutput,
): Promise<{ object: JudgeOutput; usage: { costUsd: number } }> {
  const system = [
    "You are a strict outreach-quality judge. Score the drafted message against the inputs.",
    "Rubric: grounded (uses ONLY facts present in the inputs — no invented funding, investors, metrics, or customers),",
    "hasCta (a clear single call to action), hallucinatedFacts (list any claim not supported by the inputs),",
    "rating 1-5 (5 = grounded, specific, single clear CTA; 1 = fabricated or no CTA).",
  ].join(" ");
  const prompt = [
    `ICP/OFFER: ${fixture.icp}`,
    `GROUNDED ANGLES (the only allowed personalization facts): ${JSON.stringify(fixture.angles ?? [])}`,
    `DRAFT SUBJECT: ${output.subject ?? "(none)"}`,
    `DRAFT BODY: ${output.body}`,
    `DRAFT CTA: ${output.cta}`,
  ].join("\n");
  const { object, usage } = await provider.generateObject({ schema: JudgeSchema, system, prompt });
  return { object, usage: { costUsd: usage.costUsd } };
}
