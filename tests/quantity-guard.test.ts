/**
 * Distorted-quantity guard (refs #75).
 *
 * Live campaign run 2: research said "Building the capital structure behind 40
 * acquisitions" (a total, over years) and two drafts wrote "40 acquisitions a
 * year". The number and the noun were both in the inputs, so every grounding
 * check passed a false claim. checkQuantities (draft-guard.ts) closes that:
 * a quantity the draft pins to a rate or time period must appear in the inputs
 * with a compatible qualifier. Covered here on every enforcement path: the pure
 * check, guardDraft, groundAngles, the draft seam, MCP save_run and the eval scorer.
 */

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { z } from "zod";
import { checkQuantities, groundAngles, guardDraft, QUANTITY_PROMPT_LINE } from "../pipeline_core/draft-guard.js";
import { buildDraftPrompt, draftMessage, DraftRejectedError } from "../pipeline_core/seam.js";
import type { GenerateObjectArgs, LLMProvider } from "../pipeline_core/providers.js";
import type { Contact, Lead } from "../pipeline_core/models.js";
import { _resetSecretCache } from "../pipeline_core/secrets.js";
import { _resetBuiltins } from "../pipeline_core/connectors/index.js";
import { _resetPacks } from "../pipeline_core/packs/index.js";
import { EMPTY_SUPPRESSION_LIST } from "../pipeline_core/compliance/suppression.js";
import { handleSaveRun, type SaveRunArgs } from "../mcp/tools.js";
import { EncryptedSqliteRunStore } from "../pipeline_core/encrypted-store.js";
import { groundingHeuristic } from "../evals/scorers.js";

const LIVE_INPUT = "Building the capital structure behind 40 acquisitions";
const LIVE_ISSUE = 'claim: "40 acquisitions a year" adds a rate ("a year") the inputs do not state';

// ─────────────────────────────── the pure check ───────────────────────────────

describe("checkQuantities", () => {
  it("rejects the exact live case: a total restated as a yearly rate", () => {
    expect(checkQuantities(["Saw you have done 40 acquisitions a year."], [LIVE_INPUT])).toEqual([LIVE_ISSUE]);
  });

  it("allows the number restated without a qualifier", () => {
    expect(checkQuantities(["Behind 40 acquisitions, integration must be a grind."], ["40 acquisitions"])).toEqual([]);
  });

  it("leaves a bare number alone even when the inputs never mention it", () => {
    expect(checkQuantities(["Teams of 12 reps often stall here."], [LIVE_INPUT])).toEqual([]);
  });

  it("allows a compatible qualifier (a year = per year = annually)", () => {
    expect(checkQuantities(["40 acquisitions a year is a lot."], ["40 acquisitions per year"])).toEqual([]);
    expect(checkQuantities(["Forty acquisitions annually."], ["roughly 40 acquisitions each year"])).toEqual([]);
  });

  it("rejects an incompatible qualifier on the same number (monthly is not yearly)", () => {
    expect(checkQuantities(["40 acquisitions a month."], ["40 acquisitions per year"])).toEqual([
      'claim: "40 acquisitions a month" adds a rate ("a month") the inputs do not state',
    ]);
  });

  it("normalizes spelled numbers on both sides", () => {
    // Draft spelled, input digits: the second live draft.
    expect(checkQuantities(["Forty acquisitions a year is serious volume."], [LIVE_INPUT])).toEqual([
      'claim: "Forty acquisitions a year" adds a rate ("a year") the inputs do not state',
    ]);
    // Draft digits, input spelled (compatible).
    expect(checkQuantities(["42 deals per year."], ["closes forty-two deals a year"])).toEqual([]);
    expect(checkQuantities(["100 hires a year."], ["one hundred hires annually"])).toEqual([]);
  });

  it("handles percentages (and percent spelled out)", () => {
    expect(checkQuantities(["Revenue grew 40% a year."], ["Revenue grew 40%."])).toEqual([
      'claim: "40% a year" adds a rate ("a year") the inputs do not state',
    ]);
    expect(checkQuantities(["Revenue grew 40% a year."], ["revenue up 40 percent annually"])).toEqual([]);
  });

  it("rejects a 'since 2019' period absent from the inputs, allows it when stated", () => {
    expect(checkQuantities(["You've closed 40 acquisitions since 2019."], [LIVE_INPUT])).toEqual([
      'claim: "40 acquisitions since 2019" adds a time period ("since 2019") the inputs do not state',
    ]);
    expect(
      checkQuantities(["You've closed 40 acquisitions since 2019."], ["Since 2019, the firm has completed 40 acquisitions."]),
    ).toEqual([]);
  });

  it("rejects 'in the last N years' unless the inputs state that same window", () => {
    expect(checkQuantities(["40 acquisitions in the last 3 years."], [LIVE_INPUT])).toEqual([
      'claim: "40 acquisitions in the last 3 years" adds a time period ("in the last 3 years") the inputs do not state',
    ]);
    expect(checkQuantities(["40 acquisitions in the last three years."], ["40 acquisitions over the past 3 years"])).toEqual(
      [],
    );
  });

  it("keeps false positives low: window, clause, anchors and intervening numbers", () => {
    const facts = [LIVE_INPUT, "12 hires"];
    // More than 4 words between the number and the qualifier: not attached.
    expect(checkQuantities(["40 acquisitions and the integration work that follows a year"], facts)).toEqual([]);
    // A comma ends the clause.
    expect(checkQuantities(["After 40 acquisitions, a year of integration is normal."], facts)).toEqual([]);
    // "a year ago" is a time anchor, not a rate.
    expect(checkQuantities(["You passed 40 acquisitions a year ago."], facts)).toEqual([]);
    // Another number in between pins the qualifier to that number, not the first.
    expect(checkQuantities(["40 acquisitions and 12 hires a year"], facts)).toEqual([
      'claim: "12 hires a year" adds a rate ("a year") the inputs do not state',
    ]);
    // The year in "since 2019" is part of the qualifier, not a quantity of its own.
    expect(checkQuantities(["Since 2019 a lot has changed."], facts)).toEqual([]);
  });

  it("accepts input-side rate words like 'annual' and 'ARR' for money", () => {
    expect(checkQuantities(["$40M a year in revenue."], ["$40 million in annual revenue"])).toEqual([]);
    expect(checkQuantities(["$40M a year in revenue."], ["$40M ARR"])).toEqual([]);
    expect(checkQuantities(["$40M a year in revenue."], ["raised $40M"])).toEqual([
      'claim: "$40M a year" adds a rate ("a year") the inputs do not state',
    ]);
  });
});

// ─────────────────────────────── guardDraft ───────────────────────────────

const draft = (body: string) => ({ subject: "Integration at scale", body, cta: "Open to a call?" });

describe("guardDraft quantity rule", () => {
  it("rejects the live case when facts are supplied", () => {
    expect(guardDraft(draft("Forty acquisitions a year is a lot to absorb."), { allowedText: [], facts: [LIVE_INPUT] })).toEqual({
      ok: false,
      issues: ['claim: "Forty acquisitions a year" adds a rate ("a year") the inputs do not state'],
    });
  });

  it("allows the honest total", () => {
    expect(guardDraft(draft("40 acquisitions is a lot to absorb."), { allowedText: [], facts: [LIVE_INPUT] })).toEqual({
      ok: true,
    });
  });

  it("checks the subject too", () => {
    const verdict = guardDraft(
      { subject: "40 deals a year", body: "A short note.", cta: "Chat?" },
      { allowedText: [], facts: ["40 deals"] },
    );
    expect(verdict).toEqual({
      ok: false,
      issues: ['claim: "40 deals a year" adds a rate ("a year") the inputs do not state'],
    });
  });

  it("without facts the check is skipped (backward compatible)", () => {
    expect(guardDraft(draft("40 acquisitions a year."), { allowedText: [] })).toEqual({ ok: true });
  });
});

describe("groundAngles quantity rule", () => {
  it("drops an angle that invents a rate (angles feed the draft guard's facts)", () => {
    const { kept, dropped } = groundAngles(["Heffernan completes 40 acquisitions a year.", "Heffernan completed 40 acquisitions."], {
      facts: ["Heffernan", LIVE_INPUT],
      identifiers: [],
    });
    expect(kept).toEqual(["Heffernan completed 40 acquisitions."]);
    expect(dropped).toEqual([{ angle: "Heffernan completes 40 acquisitions a year.", reason: LIVE_ISSUE }]);
  });
});

// ─────────────────────────────── the draft seam ───────────────────────────────

const lead: Lead = { domain: "heffernan.com", companyName: "Heffernan", description: LIVE_INPUT, source: "exa" };
const contact: Contact = { name: "Dana Heffernan", leadDomain: "heffernan.com", email: "dana@heffernan.com", source: "apollo" };

function provider(body: string): { provider: LLMProvider; calls: GenerateObjectArgs<z.ZodTypeAny>[] } {
  const calls: GenerateObjectArgs<z.ZodTypeAny>[] = [];
  return {
    calls,
    provider: {
      name: "anthropic",
      model: "stub-model",
      async generateObject(args) {
        calls.push(args as GenerateObjectArgs<z.ZodTypeAny>);
        const object = args.schema.parse({
          decline: false,
          declineReason: null,
          subject: "Integration",
          body,
          cta: "Open to a call?",
        });
        return { object, usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 } };
      },
    },
  };
}

describe("draftMessage quantity rule", () => {
  const ctx = { icp: "B2B", lead, contact, angles: ["Heffernan completed 40 acquisitions."], channel: "email" as const };

  it("rejects a draft that turns the lead description's total into a rate", async () => {
    const err = await draftMessage(provider("Hi Dana, 40 acquisitions a year is serious volume.").provider, ctx).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(DraftRejectedError);
    expect((err as DraftRejectedError).issues).toEqual([LIVE_ISSUE]);
  });

  it("passes the honest draft and tells the model the rule in the system prompt", async () => {
    const { provider: p, calls } = provider("Hi Dana, 40 acquisitions is serious volume.");
    await expect(draftMessage(p, ctx)).resolves.toBeDefined();
    expect(calls[0]!.system).toContain(QUANTITY_PROMPT_LINE);
    expect(buildDraftPrompt(ctx).system).toContain(
      "Quote numbers exactly as the data states them; never add a rate or time period.",
    );
  });

  it("a rate the inputs DO state (in an angle) is allowed", async () => {
    const withRate = { ...ctx, angles: ["Heffernan runs about 40 acquisitions per year."] };
    await expect(draftMessage(provider("Hi Dana, 40 acquisitions a year is serious volume.").provider, withRate)).resolves.toBeDefined();
  });
});

// ─────────────────────────────── MCP save_run ───────────────────────────────

describe("MCP save_run quantity rule", () => {
  let home: string;
  const saved = { ...process.env };
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "io-qty-home-"));
    process.env.INTENT_OUTREACH_HOME = home;
    delete process.env.INTENT_OUTREACH_PROFILE;
    _resetSecretCache();
    _resetBuiltins();
    _resetPacks();
  });
  afterEach(() => {
    process.env = { ...saved };
    _resetBuiltins();
  });

  const args = (body: string): SaveRunArgs => {
    const profile = join(home, "p.json");
    writeFileSync(
      profile,
      JSON.stringify({
        name: "t",
        description: "t",
        output: { formats: ["markdown"] },
        delivery: { targets: ["console"] },
        sender: { name: "Pat Sender", company: "Example Co LLC", postalAddress: "1 Main St\nSpringfield, IL 62701" },
      }),
    );
    return {
      id: "qty-mcp",
      icp: "B2B",
      domains: ["heffernan.com"],
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      profile,
      leads: [lead],
      contacts: [contact],
      messages: [{ contactKey: "dana@heffernan.com", channel: "email", subject: "Integration", body, cta: "Open to a call?" }],
    } as SaveRunArgs;
  };

  it("an agent-written draft with the invented rate lands in rejectedDrafts", async () => {
    const res = await handleSaveRun(args("Hi Dana, forty acquisitions a year is serious volume."), {
      now: () => "2026-10-05T12:00:00.000Z",
      suppressions: EMPTY_SUPPRESSION_LIST,
    });
    expect(res.isError).toBeUndefined();
    const run = await new EncryptedSqliteRunStore(join(home, "runs.sqlite")).getRun("qty-mcp");
    expect(run!.messages).toEqual([]);
    expect(run!.rejectedDrafts).toEqual([
      {
        contactKey: "dana@heffernan.com",
        issues: ['claim: "forty acquisitions a year" adds a rate ("a year") the inputs do not state'],
      },
    ]);
  });

  it("the honest draft is saved", async () => {
    await handleSaveRun(args("Hi Dana, forty acquisitions is serious volume."), {
      now: () => "2026-10-05T12:00:00.000Z",
      suppressions: EMPTY_SUPPRESSION_LIST,
    });
    const run = await new EncryptedSqliteRunStore(join(home, "runs.sqlite")).getRun("qty-mcp");
    expect(run!.rejectedDrafts).toEqual([]);
    expect(run!.messages).toHaveLength(1);
  });
});

// ─────────────────────────────── eval scorer ───────────────────────────────

describe("groundingHeuristic quantity rule", () => {
  const ctx = { icp: "B2B", lead, contact, angles: ["Heffernan completed 40 acquisitions."], channel: "email" as const };

  it("fails the live case with the guard's issue text", () => {
    const res = groundingHeuristic(ctx, { subject: "Integration", body: "Hi Dana, 40 acquisitions a year is a lot.", cta: "Chat?" });
    expect(res.pass).toBe(false);
    expect(res.findings).toEqual([`distorted quantity: ${LIVE_ISSUE}`]);
  });

  it("passes the honest total", () => {
    const res = groundingHeuristic(ctx, { subject: "Integration", body: "Hi Dana, 40 acquisitions is a lot.", cta: "Chat?" });
    expect(res).toEqual({ pass: true, findings: [] });
  });
});

describe("checkQuantities: a street address's house number is not a quantity", () => {
  const facts = ["Owner of record since 2004.", "Situs: 412 LAGOON AVE, PENSACOLA FL 32507"];
  it("passes an address followed by a stated time qualifier", () => {
    expect(checkQuantities(["You have owned 412 Lagoon Ave since 2004."], facts)).toEqual([]);
    expect(checkQuantities(["Your home at 18 N Main St. since 2004"], facts)).toEqual([]);
  });
  it("still flags a real quantity with an unstated qualifier", () => {
    expect(checkQuantities(["412 homes sold since 2019."], facts)).toHaveLength(1);
    expect(checkQuantities(["We closed 40 Lagoon deals a year."], facts)).toHaveLength(1);
  });
});
