/**
 * tests/can-spam.test.ts — CAN-SPAM footer + suppression (opt-out) list (#53).
 *
 *   • applyComplianceFooter: present / absent / partial sender, linkedin, idempotence.
 *   • suppressionGate: email, domain (+subdomain), case, malformed → blocked, empty list.
 *   • suppressions.jsonl I/O: add / list / remove, mode 0600, corrupt line fails closed.
 *   • runCampaign end-to-end: a suppressed b2b-sdr contact is blocked BEFORE drafting
 *     and recorded in blockedContacts; footer + needsSenderIdentity + warnings land.
 *   • CLI `suppress add|list|remove` against a tmp INTENT_OUTREACH_HOME.
 *
 * Every file touched lives under a mkdtemp dir — never the real ~/.intent-outreach.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyComplianceFooter,
  DEFAULT_OPT_OUT_TEXT,
  emailFooter,
  type SenderIdentity,
} from "../pipeline_core/footer.js";
import {
  buildSuppressionList,
  composeGates,
  EMPTY_SUPPRESSION_LIST,
  parseSuppressionValue,
  suppressionGate,
} from "../pipeline_core/compliance/suppression.js";
import {
  addSuppression,
  defaultSuppressionsPath,
  loadSuppressionList,
  readSuppressions,
  removeSuppression,
} from "../pipeline_core/suppressions.js";
import { runCampaign } from "../pipeline_core/pipeline.js";
import { _resetSecretCache } from "../pipeline_core/secrets.js";
import { _resetBuiltins, registerConnector } from "../pipeline_core/connectors/index.js";
import type { Connector } from "../pipeline_core/connectors/types.js";
import type { LLMProvider } from "../pipeline_core/providers.js";
import type { ComplianceContext } from "../pipeline_core/packs/types.js";
import { loadProfile, applyProfileToCampaignInput } from "../pipeline_core/profiles.js";

// Module-level: an empty tmp home so nothing here can read/write ~/.intent-outreach.
const HOME = mkdtempSync(join(tmpdir(), "io-canspam-home-"));
process.env.INTENT_OUTREACH_HOME = HOME;

const SENDER: SenderIdentity = {
  name: "Pat Sender",
  company: "Example Co LLC",
  postalAddress: "100 Main St, Ste 1\nSpringfield, IL 62701",
};

const draft = (channel: "email" | "linkedin", body = "Hi Jane — quick idea for Acme.") => ({
  contactKey: "jane@acme.com",
  channel,
  body,
  cta: "Open to a call?",
});

// ── footer ──────────────────────────────────────────────────────────────────

describe("applyComplianceFooter", () => {
  it("email + complete sender: appends identity, postal address and default opt-out", () => {
    const out = applyComplianceFooter(draft("email"), SENDER);
    expect(out.needsSenderIdentity).toBe(false);
    expect(out.body).toBe(
      [
        "Hi Jane — quick idea for Acme.",
        "",
        "-- ",
        "Pat Sender, Example Co LLC",
        "100 Main St, Ste 1",
        "Springfield, IL 62701",
        DEFAULT_OPT_OUT_TEXT,
      ].join("\n"),
    );
  });

  it("uses replyToEmail and a custom optOutText when configured", () => {
    const out = applyComplianceFooter(draft("email"), {
      ...SENDER,
      replyToEmail: "pat@example.com",
      optOutText: "Reply STOP to opt out.",
    });
    expect(out.body).toContain("Reply-To: pat@example.com");
    expect(out.body.endsWith("Reply STOP to opt out.")).toBe(true);
    expect(out.body).not.toContain(DEFAULT_OPT_OUT_TEXT);
  });

  it("email + no sender: appends NOTHING (never fabricates) and flags needsSenderIdentity", () => {
    const msg = draft("email");
    const out = applyComplianceFooter(msg, undefined);
    expect(out.body).toBe(msg.body);
    expect(out.needsSenderIdentity).toBe(true);
  });

  it("email + incomplete sender (blank postal address) is treated as missing", () => {
    const out = applyComplianceFooter(draft("email"), { ...SENDER, postalAddress: "   " });
    expect(out.needsSenderIdentity).toBe(true);
    expect(out.body).not.toContain("Pat Sender");
  });

  it("linkedin: no postal footer, even with a sender; opt-out only when opted in", () => {
    const plain = applyComplianceFooter(draft("linkedin"), SENDER);
    expect(plain.body).toBe(draft("linkedin").body);
    expect(plain.needsSenderIdentity).toBe(false);

    const optIn = applyComplianceFooter(draft("linkedin"), { ...SENDER, optOutOnLinkedin: true });
    expect(optIn.body.endsWith(DEFAULT_OPT_OUT_TEXT)).toBe(true);
    expect(optIn.body).not.toContain("Springfield");
    expect(optIn.needsSenderIdentity).toBe(false);
  });

  it("linkedin with no sender is not flagged (CAN-SPAM postal rule does not attach)", () => {
    expect(applyComplianceFooter(draft("linkedin"), undefined).needsSenderIdentity).toBe(false);
  });

  it("is idempotent and does not mutate its input", () => {
    const msg = draft("email");
    const once = applyComplianceFooter(msg, SENDER);
    const twice = applyComplianceFooter(once, SENDER);
    expect(twice.body).toBe(once.body);
    expect(msg.body).toBe("Hi Jane — quick idea for Acme.");
    expect(once.body.split(emailFooter(SENDER)).length).toBe(2);
  });
});

// ── suppression gate (pure) ─────────────────────────────────────────────────

function ctx(email: string | undefined, domain = "acme.com"): ComplianceContext {
  return {
    lead: { domain, companyName: "Acme", source: "fixture" },
    contact: {
      name: "Jane Doe",
      leadDomain: domain,
      ...(email !== undefined ? { email } : {}),
      source: "fixture",
    },
    now: new Date("2026-06-16T12:00:00.000Z"),
    enrichments: [],
  };
}

describe("suppressionGate", () => {
  const list = buildSuppressionList([
    { kind: "email", value: "jane@acme.com" },
    { kind: "domain", value: "blocked.io" },
  ]);
  const gate = suppressionGate(list);

  it("blocks a suppressed email", () => {
    expect(gate.check(ctx("jane@acme.com"))).toEqual({ status: "blocked", reason: "suppressed:email" });
  });

  it("matches case-insensitively and trims", () => {
    expect(gate.check(ctx("  JANE@Acme.COM "))).toEqual({ status: "blocked", reason: "suppressed:email" });
  });

  it("blocks by lead domain even when the contact has no email", () => {
    expect(gate.check(ctx(undefined, "blocked.io"))).toEqual({ status: "blocked", reason: "suppressed:domain" });
  });

  it("blocks an email whose domain (or parent domain) is suppressed", () => {
    expect(gate.check(ctx("ceo@mail.Blocked.io", "other.com"))).toEqual({
      status: "blocked",
      reason: "suppressed:domain",
    });
    expect(gate.check(ctx(undefined, "eu.blocked.io"))).toEqual({ status: "blocked", reason: "suppressed:domain" });
  });

  it("does not block on a mere substring (notblocked.io ≠ blocked.io)", () => {
    expect(gate.check(ctx("a@notblocked.io", "notblocked.io"))).toEqual({ status: "clean" });
  });

  it("lets an unsuppressed contact through", () => {
    expect(gate.check(ctx("bob@acme.com"))).toEqual({ status: "clean" });
  });

  it("malformed email is BLOCKED (fail closed) when a list exists", () => {
    expect(gate.check(ctx("not-an-email"))).toEqual({
      status: "blocked",
      reason: "suppression:malformed-email",
    });
    expect(gate.check(ctx("a@@b"))).toEqual({ status: "blocked", reason: "suppression:malformed-email" });
  });

  it("an empty list blocks nothing (backwards-compatible)", () => {
    const empty = suppressionGate(EMPTY_SUPPRESSION_LIST);
    expect(empty.check(ctx("jane@acme.com"))).toEqual({ status: "clean" });
    expect(empty.check(ctx("not-an-email"))).toEqual({ status: "clean" });
  });

  it("composeGates: first non-clean verdict wins, in order", () => {
    const always = { check: () => ({ status: "blocked" as const, reason: "pack" }) };
    expect(composeGates(gate, always).check(ctx("jane@acme.com")).reason).toBe("suppressed:email");
    expect(composeGates(gate, always).check(ctx("bob@acme.com")).reason).toBe("pack");
    expect(composeGates(gate).check(ctx("bob@acme.com"))).toEqual({ status: "clean" });
  });

  it("parseSuppressionValue classifies + normalizes, and rejects garbage", () => {
    expect(parseSuppressionValue(" Jane@Acme.com ")).toEqual({ kind: "email", value: "jane@acme.com" });
    expect(parseSuppressionValue("https://WWW.Blocked.io/path")).toEqual({ kind: "domain", value: "blocked.io" });
    expect(() => parseSuppressionValue("no spaces allowed.com x")).toThrow();
    expect(() => parseSuppressionValue("localhost")).toThrow();
    expect(() => parseSuppressionValue("a@@b")).toThrow();
  });
});

// ── suppressions.jsonl I/O ──────────────────────────────────────────────────

describe("suppressions.jsonl store", () => {
  let path: string;
  beforeEach(() => {
    path = join(mkdtempSync(join(tmpdir(), "io-supp-")), "suppressions.jsonl");
  });

  it("missing file = empty list", async () => {
    expect(await readSuppressions(path)).toEqual([]);
    const list = await loadSuppressionList(path);
    expect(list.emails.size + list.domains.size).toBe(0);
  });

  it("add (idempotent) → list → remove, file mode 0600", async () => {
    const now = () => "2026-06-16T12:00:00.000Z";
    const a = await addSuppression("Jane@Acme.com", { path, now, reason: "replied unsubscribe" });
    expect(a).toEqual({
      added: true,
      entry: { kind: "email", value: "jane@acme.com", addedAt: now(), reason: "replied unsubscribe" },
    });
    expect((await addSuppression("jane@acme.com", { path, now })).added).toBe(false);
    await addSuppression("blocked.io", { path, now });

    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect((await readSuppressions(path)).map((e) => e.value)).toEqual(["jane@acme.com", "blocked.io"]);

    expect(await removeSuppression("JANE@acme.com", { path })).toBe(true);
    expect(await removeSuppression("jane@acme.com", { path })).toBe(false);
    expect((await readSuppressions(path)).map((e) => e.value)).toEqual(["blocked.io"]);
  });

  it("a malformed value is refused and nothing is written", async () => {
    await expect(addSuppression("not an email@", { path })).rejects.toThrow();
    expect(await readSuppressions(path)).toEqual([]);
  });

  it("a corrupt line FAILS CLOSED (throws with the line number), never silently skipped", async () => {
    writeFileSync(path, '{"kind":"email","value":"a@b.co","addedAt":"x"}\n{not json\n');
    await expect(loadSuppressionList(path)).rejects.toThrow(/line 2/);
    writeFileSync(path, '{"kind":"email","value":"garbage","addedAt":"x"}\n');
    await expect(loadSuppressionList(path)).rejects.toThrow(/line 1/);
  });

  it("defaultSuppressionsPath honors INTENT_OUTREACH_HOME", () => {
    expect(defaultSuppressionsPath()).toBe(join(HOME, "suppressions.jsonl"));
  });
});

// ── runCampaign end-to-end (b2b-sdr) ────────────────────────────────────────

const FIXED = "2026-06-16T12:00:00.000Z";
const clock = () => FIXED;

const twoContacts: Connector = {
  name: "stub-two",
  displayName: "Stub Two",
  tier: "free",
  keyEnvVar: null,
  phases: ["research"],
  isConfigured: () => true,
  async research({ domain }) {
    return {
      leads: [{ domain, companyName: "Acme Inc", source: "stub-two" }],
      contacts: [
        { name: "Jane Doe", leadDomain: domain, email: `jane@${domain}`, source: "stub-two" },
        { name: "Bob Roe", leadDomain: domain, email: `bob@${domain}`, source: "stub-two" },
      ],
    };
  },
};

function countingProvider(): LLMProvider & { drafts: string[] } {
  const drafts: string[] = [];
  return {
    name: "anthropic",
    model: "claude-sonnet-4-6",
    drafts,
    async generateObject({ schema, prompt }) {
      if (/Jane|Bob/.test(prompt) && /draft|Draft|channel/.test(prompt)) drafts.push(prompt);
      const object = schema.parse({
        fitScore: 80,
        fitReason: "fit",
        angles: ["angle"],
        subject: "Hi",
        body: "Hello — a short, relevant note.",
        cta: "Chat?",
      });
      return { object, usage: { inputTokens: 10, outputTokens: 5, costUsd: 0 } };
    },
  };
}

describe("runCampaign: b2b-sdr honors the suppression list + footer", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    _resetBuiltins();
    _resetSecretCache();
    for (const k of Object.keys(process.env)) {
      if (k.endsWith("_API_KEY") || k === "ZOOMINFO_JWT" || k === "CLAY_WEBHOOK_URL") delete process.env[k];
    }
    registerConnector(twoContacts);
  });
  afterEach(() => {
    process.env = { ...saved };
    _resetBuiltins();
  });

  it("a suppressed contact is blocked before drafting and recorded in blockedContacts", async () => {
    const provider = countingProvider();
    const { run } = await runCampaign({
      id: "supp-e2e",
      icp: "x",
      domains: ["acme.com"],
      provider,
      now: clock,
      maxContactsPerLead: 5,
      sender: SENDER,
      suppressions: buildSuppressionList([{ kind: "email", value: "JANE@acme.com" }]),
    });
    expect(run.vertical).toBe("b2b-sdr");
    expect(run.blockedContacts).toEqual([{ contactKey: "jane@acme.com", reason: "suppressed:email" }]);
    expect(run.messages.map((m) => m.contactKey)).toEqual(["bob@acme.com"]);
    // Footer present; no warning because the sender is configured.
    expect(run.messages[0]?.body).toContain("Pat Sender, Example Co LLC");
    expect(run.messages[0]?.body).toContain("Springfield, IL 62701");
    expect(run.messages[0]?.needsSenderIdentity).toBe(false);
    expect(run.complianceWarnings).toEqual([]);
  });

  it("loads suppressions.jsonl from INTENT_OUTREACH_HOME when none are injected", async () => {
    const home = mkdtempSync(join(tmpdir(), "io-canspam-e2e-"));
    process.env.INTENT_OUTREACH_HOME = home;
    await addSuppression("acme.com", { reason: "do not contact account" });
    const { run } = await runCampaign({
      id: "supp-file",
      icp: "x",
      domains: ["acme.com"],
      provider: countingProvider(),
      now: clock,
      maxContactsPerLead: 5,
    });
    expect(run.blockedContacts.map((b) => b.reason)).toEqual(["suppressed:domain", "suppressed:domain"]);
    expect(run.messages).toEqual([]);
  });

  it("no sender: email drafts are unfooted, flagged, and the run carries a warning", async () => {
    const { run } = await runCampaign({
      id: "no-sender",
      icp: "x",
      domains: ["acme.com"],
      provider: countingProvider(),
      now: clock,
      maxContactsPerLead: 2,
      suppressions: EMPTY_SUPPRESSION_LIST,
    });
    expect(run.messages).toHaveLength(2);
    expect(run.messages.every((m) => m.needsSenderIdentity)).toBe(true);
    expect(run.messages[0]?.body).toBe("Hello — a short, relevant note.");
    expect(run.complianceWarnings).toHaveLength(1);
    expect(run.complianceWarnings[0]).toMatch(/2 email draft\(s\) have NO CAN-SPAM footer/);
    expect(run.complianceWarnings[0]).toMatch(/name, company, postalAddress/);
  });

  it("linkedin channel without a sender: no flag, no warning", async () => {
    const { run } = await runCampaign({
      id: "li",
      icp: "x",
      domains: ["acme.com"],
      provider: countingProvider(),
      now: clock,
      channel: "linkedin",
      suppressions: EMPTY_SUPPRESSION_LIST,
    });
    expect(run.messages[0]?.needsSenderIdentity).toBe(false);
    expect(run.complianceWarnings).toEqual([]);
  });

  it("profile.sender flows through applyProfileToCampaignInput", () => {
    const dir = mkdtempSync(join(tmpdir(), "io-prof-"));
    const p = join(dir, "p.json");
    writeFileSync(
      p,
      JSON.stringify({
        name: "t",
        description: "t",
        output: { formats: ["markdown"] },
        delivery: { targets: ["console"] },
        sender: SENDER,
      }),
    );
    const profile = loadProfile(p);
    expect(applyProfileToCampaignInput(profile, { id: "x", icp: "x", domains: [] }).sender).toEqual(SENDER);

    writeFileSync(
      p,
      JSON.stringify({
        name: "t",
        description: "t",
        output: { formats: ["markdown"] },
        delivery: { targets: ["console"] },
        sender: { name: "Only Name" },
      }),
    );
    expect(() => loadProfile(p)).toThrow(/sender\.(company|postalAddress)/);
  });
});

// ── CLI ─────────────────────────────────────────────────────────────────────

describe("CLI: intent-outreach suppress", () => {
  const tsx = resolve("node_modules/.bin/tsx");
  const cli = resolve("cli.ts");
  const home = mkdtempSync(join(tmpdir(), "io-canspam-cli-"));
  const run = (...args: string[]) =>
    spawnSync(tsx, [cli, "suppress", ...args], {
      env: { ...process.env, INTENT_OUTREACH_HOME: home },
      encoding: "utf8",
    });

  it("add → list → remove against a tmp INTENT_OUTREACH_HOME", { timeout: 60_000 }, () => {
    const add = run("add", "Jane@Acme.com", "--reason", "asked to stop");
    expect(add.status).toBe(0);
    expect(add.stdout).toContain("suppressed: email jane@acme.com");
    expect(run("add", "blocked.io").status).toBe(0);

    const file = join(home, "suppressions.jsonl");
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readFileSync(file, "utf8").trim().split("\n")).toHaveLength(2);

    const list = run("list");
    expect(list.status).toBe(0);
    expect(list.stdout).toMatch(/email\s+jane@acme\.com.*asked to stop/);
    expect(list.stdout).toMatch(/domain\s+blocked\.io/);

    const rm = run("remove", "jane@acme.com");
    expect(rm.status).toBe(0);
    expect(rm.stdout).toContain("removed");
    expect(run("list").stdout).not.toContain("jane@acme.com");

    const bad = run("add", "not-a-domain");
    expect(bad.status).toBe(1);
    expect(bad.stderr).toMatch(/not a valid domain/);
    expect(run("bogus").status).toBe(2);
  });
});
