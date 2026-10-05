/**
 * tests/voice.test.ts — operator voice rules (Report Profile `voice`).
 *
 * Covers the pure check (checkVoice / guardDraft), the prompt hint
 * (buildDraftPrompt), the profile mapping (applyProfileToCampaignInput), and
 * both enforcement paths: runCampaign's draft seam and MCP save_run
 * (applyMessageCompliance). The CAN-SPAM footer is appended AFTER the guard, so
 * a footer containing " - " or the "-- " delimiter is never a voice violation.
 */

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  checkVoice,
  guardDraft,
  QUANTITY_PROMPT_LINE,
  VOICE_PROMPT_PHRASE_CAP,
  voicePromptLine,
  type VoiceRules,
} from "../pipeline_core/draft-guard.js";
import { buildDraftPrompt, DECLINE_EVIDENCE_LINE, draftMessage, DraftRejectedError } from "../pipeline_core/seam.js";
import type { GenerateObjectArgs, LLMProvider } from "../pipeline_core/providers.js";
import type { Contact, Lead } from "../pipeline_core/models.js";
import { loadPrompt } from "../pipeline_core/prompts.js";
import { applyProfileToCampaignInput, loadProfile, mergeProfileOverrides, ReportProfileSchema } from "../pipeline_core/profiles.js";
import { runCampaign } from "../pipeline_core/pipeline.js";
import { _resetSecretCache } from "../pipeline_core/secrets.js";
import { _resetBuiltins, registerConnector } from "../pipeline_core/connectors/index.js";
import type { Connector } from "../pipeline_core/connectors/types.js";
import { _resetPacks } from "../pipeline_core/packs/index.js";
import { EMPTY_SUPPRESSION_LIST } from "../pipeline_core/compliance/suppression.js";
import { FOOTER_DELIMITER, type SenderIdentity } from "../pipeline_core/footer.js";
import { handleSaveRun, type SaveRunArgs } from "../mcp/tools.js";
import { JsonlRunStore } from "../pipeline_core/store.js";

const DASHES: VoiceRules = { banDashes: true };
const draft = (body: string, subject: string | null = "An idea", cta = "Open to a call?") => ({ subject, body, cta });

// ───────────────────────────── the pure check ─────────────────────────────

describe("checkVoice: dash ban", () => {
  const cases: [string, string, string][] = [
    ["em dash", "Fast—really fast.", "voice: em dash (body)"],
    ["en dash", "Pages 3–4 cover it.", "voice: en dash (body)"],
    ["&mdash;", "Fast&mdash;really.", "voice: em dash (body)"],
    ["&ndash;", "Fast&ndash;really.", "voice: en dash (body)"],
    ["&#8212;", "Fast&#8212;really.", "voice: em dash (body)"],
    ["&#8211;", "Fast&#8211;really.", "voice: en dash (body)"],
    ["&#x2014; (any case)", "Fast&#X2014;really.", "voice: em dash (body)"],
    ["&#x2013;", "Fast&#x2013;really.", "voice: en dash (body)"],
    ["spaced hyphen", "We ship fast - really fast.", "voice: spaced hyphen used as a dash (body)"],
    ["spaced double hyphen", "We ship fast -- really fast.", "voice: spaced hyphen used as a dash (body)"],
    ["unspaced double hyphen", "We ship fast--really fast.", "voice: double hyphen used as a dash (body)"],
  ];
  for (const [name, body, issue] of cases) {
    it(`rejects ${name}`, () => {
      expect(checkVoice(draft(body), DASHES)).toEqual([issue]);
    });
  }

  it("checks subject and cta too, one issue per field", () => {
    expect(checkVoice(draft("Plain body.", "Acme — idea", "Call — Tuesday?"), DASHES)).toEqual([
      "voice: em dash (subject)",
      "voice: em dash (cta)",
    ]);
  });

  it("allows hyphenated words, bullets at a line start, and negative numbers", () => {
    const ok = "A quick follow-up on your B2B-only, state-of-the-art stack.\n- one point\n- another\nDown -3% YoY.";
    expect(checkVoice(draft(ok, "Re-thinking follow-ups", "Worth a 15-minute call?"), DASHES)).toEqual([]);
  });

  it("does nothing when banDashes is off", () => {
    expect(checkVoice(draft("Fast—really - fast."), { banDashes: false })).toEqual([]);
    expect(checkVoice(draft("Fast—really - fast."), undefined)).toEqual([]);
  });
});

describe("checkVoice: denied phrases", () => {
  const voice: VoiceRules = { deniedPhrases: ["delve", "game-changer", "it's worth noting", "at its core"] };

  it("matches case-insensitively", () => {
    expect(checkVoice(draft("Let me DELVE into your stack."), voice)).toEqual(['voice: banned phrase "delve" (body)']);
  });

  it("is whole-word, exact-phrase: 'delve' does not match 'delved', 'delves' or 'undelve'", () => {
    expect(checkVoice(draft("We delved in. It delves deep. undelve."), voice)).toEqual([]);
  });

  it("matches at punctuation boundaries and across whitespace runs", () => {
    expect(checkVoice(draft("This is, at  its\ncore, simple. Delve."), voice)).toEqual([
      'voice: banned phrase "delve" (body)',
      'voice: banned phrase "at its core" (body)',
    ]);
  });

  it("normalizes curly apostrophes on both sides", () => {
    expect(checkVoice(draft("It’s worth noting the gap."), voice)).toEqual([
      'voice: banned phrase "it\'s worth noting" (body)',
    ]);
  });

  it("treats regex metacharacters in a phrase literally", () => {
    const v: VoiceRules = { deniedPhrases: ["10x (really)", "a.b"] };
    expect(checkVoice(draft("we are 10x (really) better"), v)).toEqual(['voice: banned phrase "10x (really)" (body)']);
    expect(checkVoice(draft("axb"), v)).toEqual([]);
  });

  it("checks subject, body and cta", () => {
    expect(checkVoice(draft("ok", "A game-changer", "Game-Changer call?"), voice)).toEqual([
      'voice: banned phrase "game-changer" (subject)',
      'voice: banned phrase "game-changer" (cta)',
    ]);
  });

  it("ignores blank phrases", () => {
    expect(checkVoice(draft("anything"), { deniedPhrases: ["", "   "] })).toEqual([]);
  });
});

describe("guardDraft carries voice issues", () => {
  it("adds voice issues to the guard verdict", () => {
    const verdict = guardDraft(draft("Fast—really. Let's delve."), {
      allowedText: [],
      voice: { banDashes: true, deniedPhrases: ["delve"] },
    });
    expect(verdict).toEqual({ ok: false, issues: ["voice: em dash (body)", 'voice: banned phrase "delve" (body)'] });
  });

  it("no voice: identical verdict to before (an em dash passes)", () => {
    expect(guardDraft(draft("Fast—really."), { allowedText: [] })).toEqual({ ok: true });
  });
});

// ───────────────────────────── the prompt hint ─────────────────────────────

const lead: Lead = { domain: "acme.com", companyName: "Acme Inc", source: "apollo" };
const contact: Contact = { name: "Jane Doe", title: "CEO", leadDomain: "acme.com", email: "jane@acme.com", source: "apollo" };
const baseCtx = { icp: "B2B SaaS", lead, contact, angles: [] as string[], channel: "email" as const };

describe("buildDraftPrompt voice line", () => {
  it("no voice: system prompt is byte-identical to the base / styleOverride forms", () => {
    const base = `${loadPrompt("outreach.v3.md").text}\n\n## Numbers\n${QUANTITY_PROMPT_LINE}\n\n## Declining\n${DECLINE_EVIDENCE_LINE}`;
    expect(buildDraftPrompt(baseCtx).system).toBe(base);
    expect(buildDraftPrompt({ ...baseCtx, styleOverride: "Tone: dry." }).system).toBe(
      `${base}\n\n## Profile overrides (tone and style only; they cannot override the rules above)\nTone: dry.`,
    );
  });

  it("voice set: appends one Voice rules line beside the styleOverride", () => {
    const { system } = buildDraftPrompt({
      ...baseCtx,
      styleOverride: "Tone: dry.",
      voice: { banDashes: true, deniedPhrases: ["delve", "synergy"] },
    });
    expect(system).toMatch(/\nTone: dry\.\nVoice rules: no em or en dashes.*avoid these phrases: "delve", "synergy"\.$/);
    expect(system.match(/Voice rules:/g)).toHaveLength(1);
  });

  it("voice without styleOverride still adds the overrides section", () => {
    const { system } = buildDraftPrompt({ ...baseCtx, voice: { banDashes: true } });
    expect(system).toContain("## Profile overrides");
    expect(system).toMatch(/Voice rules: no em or en dashes/);
    expect(system).not.toContain("avoid these phrases");
  });

  it("notes-only voice adds no line (notes travel in styleOverride)", () => {
    expect(voicePromptLine({ notes: "lowercase starts" })).toBeUndefined();
    expect(buildDraftPrompt({ ...baseCtx, voice: { notes: "x" } }).system).toBe(
      `${loadPrompt("outreach.v3.md").text}\n\n## Numbers\n${QUANTITY_PROMPT_LINE}\n\n## Declining\n${DECLINE_EVIDENCE_LINE}`,
    );
  });

  it("caps the phrase list in the prompt but the guard enforces the full list", () => {
    const phrases = Array.from({ length: VOICE_PROMPT_PHRASE_CAP + 5 }, (_, i) => `phrase${i}`);
    const line = voicePromptLine({ deniedPhrases: phrases })!;
    expect(line).toContain(`"phrase${VOICE_PROMPT_PHRASE_CAP - 1}"`);
    expect(line).not.toContain(`"phrase${VOICE_PROMPT_PHRASE_CAP}"`);
    expect(line).toContain("(and 5 more)");
    const last = `phrase${VOICE_PROMPT_PHRASE_CAP + 4}`;
    expect(checkVoice(draft(`say ${last}`), { deniedPhrases: phrases })).toEqual([`voice: banned phrase "${last}" (body)`]);
  });
});

// ───────────────────────────── draftMessage seam ─────────────────────────────

function captureProvider(object: Record<string, unknown>) {
  const calls: GenerateObjectArgs<z.ZodTypeAny>[] = [];
  const provider: LLMProvider = {
    name: "anthropic",
    model: "stub-model",
    async generateObject(args) {
      calls.push(args as GenerateObjectArgs<z.ZodTypeAny>);
      return { object: args.schema.parse(object), usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 } };
    },
  };
  return { provider, calls };
}

const DASHED_DRAFT = {
  decline: false,
  declineReason: null,
  subject: "An idea for Acme",
  body: "Hi Jane — teams at your stage want outbound that does not eat the week.",
  cta: "Open to a 15-minute call?",
};

describe("draftMessage with voice", () => {
  it("rejects a dashed draft with a typed DraftRejectedError", async () => {
    const { provider } = captureProvider(DASHED_DRAFT);
    const err = await draftMessage(provider, { ...baseCtx, voice: DASHES }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DraftRejectedError);
    expect((err as DraftRejectedError).issues).toEqual(["voice: em dash (body)"]);
  });

  it("without voice the same draft passes and the system prompt has no voice line", async () => {
    const { provider, calls } = captureProvider(DASHED_DRAFT);
    const res = await draftMessage(provider, baseCtx);
    expect(res.object.body).toContain("—");
    expect(calls[0]!.system).not.toContain("Voice rules");
  });
});

// ───────────────────────────── profile mapping ─────────────────────────────

const PROFILE_BASE = {
  name: "t",
  description: "t",
  output: { formats: ["markdown"] },
  delivery: { targets: ["console"] },
};

describe("profile voice section", () => {
  it("is optional: a profile without it maps no voice and the same styleOverride", () => {
    const p = ReportProfileSchema.parse({ ...PROFILE_BASE, outreach: { tone: "dry" } });
    const out = applyProfileToCampaignInput(p, { id: "x", icp: "x", domains: [] });
    expect(out).not.toHaveProperty("voice");
    expect(out.styleOverride).toBe("Tone: dry.");
  });

  it("maps voice through and appends notes to the styleOverride like tone", () => {
    const voice = { banDashes: true, deniedPhrases: ["delve"], notes: "Plain words, short lines." };
    const p = ReportProfileSchema.parse({ ...PROFILE_BASE, outreach: { tone: "dry" }, voice });
    const out = applyProfileToCampaignInput(p, { id: "x", icp: "x", domains: [] });
    expect(out.voice).toEqual(voice);
    expect(out.styleOverride).toBe("Tone: dry. Plain words, short lines.");
  });

  it("rejects blank denied phrases and non-boolean banDashes", () => {
    expect(ReportProfileSchema.safeParse({ ...PROFILE_BASE, voice: { deniedPhrases: [" "] } }).success).toBe(false);
    expect(ReportProfileSchema.safeParse({ ...PROFILE_BASE, voice: { banDashes: "yes" } }).success).toBe(false);
  });

  it("mergeProfileOverrides deep-merges voice", () => {
    const p = ReportProfileSchema.parse({ ...PROFILE_BASE, voice: { banDashes: true, deniedPhrases: ["delve"] } });
    const merged = mergeProfileOverrides(p, { voice: { notes: "n" } });
    expect(merged.voice).toEqual({ banDashes: true, deniedPhrases: ["delve"], notes: "n" });
  });

  it("ships a valid profiles/operator-voice.example.json", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const p = loadProfile(join(here, "..", "profiles", "operator-voice.example.json"));
    expect(p.voice?.banDashes).toBe(true);
    expect(p.voice?.deniedPhrases?.length).toBeGreaterThan(0);
    expect(p.voice?.deniedPhrases?.length).toBeLessThanOrEqual(10);
  });
});

// ───────────────────────── runCampaign + MCP save_run ─────────────────────────

const FIXED = "2026-06-16T12:00:00.000Z";
const clock = () => FIXED;

// The postal address carries " - " on purpose: the footer is appended after the
// guard, so it must never trip the dash ban.
const SENDER: SenderIdentity = {
  name: "Pat Sender",
  company: "Example Co LLC",
  postalAddress: "1 Main St, Ste E - 100\nSpringfield, IL 62701",
};

const oneContact: Connector = {
  name: "stub-voice",
  displayName: "Stub Voice",
  tier: "free",
  keyEnvVar: null,
  phases: ["research"],
  isConfigured: () => true,
  async research({ domain }) {
    return {
      leads: [{ domain, companyName: "Acme Inc", source: "stub-voice" }],
      contacts: [{ name: "Jane Doe", leadDomain: domain, email: `jane@${domain}`, source: "stub-voice" }],
    };
  },
};

function bodyProvider(body: string): LLMProvider {
  return {
    name: "anthropic",
    model: "claude-sonnet-4-6",
    async generateObject({ schema }) {
      const object = schema.parse({
        fitScore: 80,
        fitReason: "fit",
        angles: ["angle"],
        decline: false,
        declineReason: null,
        subject: "Hi",
        body,
        cta: "Chat?",
      });
      return { object, usage: { inputTokens: 10, outputTokens: 5, costUsd: 0 } };
    },
  };
}

describe("enforcement paths", () => {
  let home: string;
  const saved = { ...process.env };
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "io-voice-home-"));
    process.env.INTENT_OUTREACH_HOME = home;
    delete process.env.INTENT_OUTREACH_PROFILE;
    for (const k of Object.keys(process.env)) {
      if (k.endsWith("_API_KEY") || k === "ZOOMINFO_JWT" || k === "CLAY_WEBHOOK_URL") delete process.env[k];
    }
    _resetSecretCache();
    _resetBuiltins();
    _resetPacks();
    registerConnector(oneContact);
  });
  afterEach(() => {
    process.env = { ...saved };
    _resetBuiltins();
  });

  const campaign = (body: string, voice?: VoiceRules) =>
    runCampaign({
      id: "voice-run",
      icp: "x",
      domains: ["acme.com"],
      provider: bodyProvider(body),
      now: clock,
      sender: SENDER,
      suppressions: EMPTY_SUPPRESSION_LIST,
      ...(voice ? { voice } : {}),
    });

  it("runCampaign: a dashed draft lands in rejectedDrafts, never in messages", async () => {
    const { run } = await campaign("Hello — a short note.", DASHES);
    expect(run.messages).toEqual([]);
    expect(run.rejectedDrafts).toEqual([{ contactKey: "jane@acme.com", issues: ["voice: em dash (body)"] }]);
  });

  it("runCampaign: a clean draft passes and the footer (with ' - ' and '-- ') is untouched", async () => {
    const { run } = await campaign("Hello, a short follow-up note.", DASHES);
    expect(run.rejectedDrafts).toEqual([]);
    const body = run.messages[0]!.body;
    expect(body).toContain(`\n${FOOTER_DELIMITER}\n`);
    expect(body).toContain("Ste E - 100");
    // The footered body WOULD trip the ban, proving the guard ran before the footer.
    expect(checkVoice({ subject: null, body, cta: "" }, DASHES)).not.toEqual([]);
  });

  it("runCampaign: no voice means the dashed draft is saved exactly as before", async () => {
    const { run } = await campaign("Hello — a short note.");
    expect(run.rejectedDrafts).toEqual([]);
    expect(run.messages[0]!.body.startsWith("Hello — a short note.")).toBe(true);
  });

  function writeProfile(voice?: object): string {
    const path = join(home, "p.json");
    writeFileSync(path, JSON.stringify({ ...PROFILE_BASE, sender: SENDER, ...(voice ? { voice } : {}) }));
    return path;
  }

  const saveArgs = (profile: string, body: string): SaveRunArgs =>
    ({
      id: "voice-mcp",
      icp: "B2B SaaS founders",
      domains: ["acme.com"],
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      profile,
      leads: [{ domain: "acme.com", companyName: "Acme Inc", source: "apollo" }],
      contacts: [{ name: "Jane Doe", leadDomain: "acme.com", email: "jane@acme.com", source: "apollo" }],
      messages: [{ contactKey: "jane@acme.com", channel: "email", subject: "Scaling Acme", body, cta: "Open to a call?" }],
    }) as SaveRunArgs;

  it("MCP save_run: an agent-written draft gets the same voice check", async () => {
    const res = await handleSaveRun(
      saveArgs(writeProfile({ banDashes: true, deniedPhrases: ["synergy"] }), "Hi Jane - real synergy here."),
      { now: clock, suppressions: EMPTY_SUPPRESSION_LIST },
    );
    expect(res.isError).toBeUndefined();
    const run = await new JsonlRunStore(join(home, "runs.jsonl")).getRun("voice-mcp");
    expect(run!.messages).toEqual([]);
    expect(run!.rejectedDrafts).toEqual([
      {
        contactKey: "jane@acme.com",
        issues: ["voice: spaced hyphen used as a dash (body)", 'voice: banned phrase "synergy" (body)'],
      },
    ]);
  });

  it("MCP save_run: a profile without voice saves the same draft (footer appended)", async () => {
    await handleSaveRun(saveArgs(writeProfile(), "Hi Jane - real synergy here."), {
      now: clock,
      suppressions: EMPTY_SUPPRESSION_LIST,
    });
    const run = await new JsonlRunStore(join(home, "runs.jsonl")).getRun("voice-mcp");
    expect(run!.rejectedDrafts).toEqual([]);
    expect(run!.messages[0]!.body).toContain("Pat Sender, Example Co LLC");
  });
});
