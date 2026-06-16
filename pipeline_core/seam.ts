/**
 * pipeline_core/seam.ts — the LLM seams (the ONLY place the model is called).
 *
 * Two seams, both structured-output (generateObject), both provider-agnostic:
 *   - scoreLead(): ICP + lead + contacts + enrichment → { fitScore, fitReason, angles }
 *   - draftMessage(): lead + contact + angles → { subject?, body, cta }
 *
 * The model's raw output here is NEVER trusted directly — callers run it through
 * validator.ts before anything becomes a record (017-AT-DECR §8). The provider is
 * injected, so tests run a deterministic stub and evals run real providers.
 */

import { z } from "zod";
import { loadPrompt } from "./prompts.js";
import type { LLMProvider } from "./providers.js";
import type { Usage } from "./cost.js";
import type { Contact, Enrichment, Lead } from "./models.js";

export const ScoreOutputSchema = z.object({
  fitScore: z.number().min(0).max(100),
  fitReason: z.string(),
  angles: z.array(z.string()).max(3).default([]),
});
export type ScoreOutput = z.infer<typeof ScoreOutputSchema>;

export const DraftOutputSchema = z.object({
  subject: z.string().optional(),
  body: z.string().min(1),
  cta: z.string().min(1),
});
export type DraftOutput = z.infer<typeof DraftOutputSchema>;

function compact(value: unknown): string {
  return JSON.stringify(value, null, 0);
}

export interface ScoreContext {
  icp: string;
  lead: Lead;
  contacts: Contact[];
  enrichments: Enrichment[];
}

export async function scoreLead(
  provider: LLMProvider,
  ctx: ScoreContext,
): Promise<{ object: ScoreOutput; usage: Usage }> {
  const system = `${loadPrompt("research.v1.md")}\n\n---\n\n${loadPrompt("enrich.v1.md")}`;
  const prompt = [
    `ICP: ${ctx.icp}`,
    `LEAD: ${compact(ctx.lead)}`,
    `CONTACTS: ${compact(ctx.contacts)}`,
    `ENRICHMENT: ${compact(ctx.enrichments)}`,
  ].join("\n");
  return provider.generateObject({ schema: ScoreOutputSchema, system, prompt });
}

export interface DraftContext {
  icp: string;
  lead: Lead;
  contact: Contact;
  angles: string[];
  channel: "email" | "linkedin";
  /** Optional Report-Profile overrides for tone/length, injected verbatim. */
  styleOverride?: string;
}

export async function draftMessage(
  provider: LLMProvider,
  ctx: DraftContext,
): Promise<{ object: DraftOutput; usage: Usage }> {
  const base = loadPrompt("outreach.v1.md");
  const system = ctx.styleOverride ? `${base}\n\n## Profile overrides\n${ctx.styleOverride}` : base;
  const prompt = [
    `ICP/OFFER: ${ctx.icp}`,
    `CHANNEL: ${ctx.channel}`,
    `LEAD: ${compact(ctx.lead)}`,
    `CONTACT: ${compact(ctx.contact)}`,
    `ANGLES: ${compact(ctx.angles)}`,
  ].join("\n");
  return provider.generateObject({ schema: DraftOutputSchema, system, prompt });
}
