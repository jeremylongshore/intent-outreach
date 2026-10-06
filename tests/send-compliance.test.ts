/**
 * tests/send-compliance.test.ts — the send-time check (Phase 3a).
 *
 *   • consent ledger: scope, timing, revoke-all, written vs verbal, unreadable contact.
 *   • recipient-local window: TCPA 8am–9pm, Florida 8pm, area code vs state, unknown → strictest.
 *   • channel policy: defaults, and a pack override can only tighten.
 *   • checkSendable per channel: every blocking reason is reported, fail closed.
 *   • per-channel footers + license disclosure.
 *   • CLI `check-send`: exit 0 sendable, 3 not sendable, 2 bad input.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { checkConsent, type ConsentRecord } from "../pipeline_core/compliance/consent.js";
import { messageDigest } from "../pipeline_core/approvals.js";
import { SCHEMA_VERSION } from "../pipeline_core/models.js";
import { JsonlRunStore } from "../pipeline_core/store.js";
import { assertCampaignRun } from "../pipeline_core/validator.js";
import { withinContactWindow } from "../pipeline_core/compliance/timezones.js";
import {
  assertSendable,
  channelPolicy,
  checkSendable,
  DEFAULT_CHANNEL_POLICIES,
  NotSendableError,
  type SendableInput,
} from "../pipeline_core/compliance/send.js";
import { buildSuppressionList, EMPTY_SUPPRESSION_LIST } from "../pipeline_core/compliance/suppression.js";
import {
  applyComplianceFooter,
  callScriptFooter,
  licenseLines,
  SMS_OPT_OUT_TEXT,
  smsFooter,
  type SenderIdentity,
} from "../pipeline_core/footer.js";
import type { ContactPoint } from "../pipeline_core/models.js";

const SENDER: SenderIdentity = {
  name: "Pat Agent",
  company: "Example Realty",
  postalAddress: "100 Main St\nFoley, AL 36535",
  licenses: [{ state: "AL", number: "000123", brokerage: "Example Realty" }],
};

// 2026-10-06 is CDT (UTC-5) / EDT (UTC-4).
const AT = (centralHHMM: string) => new Date(`2026-10-06T${centralHHMM}:00-05:00`);
const NOON = AT("12:00");

const PHONE: ContactPoint = {
  partyKey: "person:1",
  kind: "phone",
  value: "+12515550100", // 251 = Mobile/Baldwin AL, Central
  lineType: "mobile",
  dnc: "clean",
  source: "fixture",
  fetchedAt: "2026-10-01T00:00:00.000Z",
};

const WRITTEN: ConsentRecord = {
  id: "c1",
  contact: { kind: "phone", value: "(251) 555-0100" },
  scope: ["sms", "call_script"],
  method: "web_form",
  recordedAt: "2026-10-01T12:00:00-05:00",
  textShown: "I agree to receive texts and calls from Example Realty about my property. Reply STOP to opt out.",
  textVersion: "v1",
  sourceUrl: "https://comehomealabama.com/contact",
};

const smsBody = (extra = "") => applyComplianceFooter({ channel: "sms", body: `Hi, quick question about 12 Main St.${extra}` }, SENDER).body;

function sms(patch: Partial<SendableInput> = {}): SendableInput {
  return {
    message: { channel: "sms", body: smsBody(), needsSenderIdentity: false },
    channel: "sms",
    contactPoint: PHONE,
    now: NOON,
    consents: [WRITTEN],
    suppressions: EMPTY_SUPPRESSION_LIST,
    recipientState: "AL",
    sender: SENDER,
    approval: "approved",
    ...patch,
  };
}

describe("consent ledger", () => {
  const cp = { kind: "phone" as const, value: "+12515550100" };

  it("a written, in-scope, already-recorded consent passes", () => {
    expect(checkConsent([WRITTEN], cp, "sms", NOON, "written")).toEqual({ ok: true, record: WRITTEN });
  });

  it("out of scope, recorded in the future, or for another number is missing", () => {
    expect(checkConsent([WRITTEN], cp, "mail", NOON, "any")).toEqual({ ok: false, reason: "consent:missing" });
    expect(checkConsent([{ ...WRITTEN, recordedAt: "2026-10-07T00:00:00Z" }], cp, "sms", NOON, "any").ok).toBe(false);
    expect(checkConsent([WRITTEN], { kind: "phone", value: "+12515550199" }, "sms", NOON, "any").ok).toBe(false);
  });

  it("verbal or imported consent is never written", () => {
    for (const method of ["verbal_documented", "sphere_import", "in_person"] as const) {
      expect(checkConsent([{ ...WRITTEN, method }], cp, "sms", NOON, "written")).toEqual({
        ok: false,
        reason: "consent:not-written",
      });
      expect(checkConsent([{ ...WRITTEN, method }], cp, "sms", NOON, "any").ok).toBe(true);
    }
  });

  it("REVOKE-ALL: a revocation on any record voids every channel, even where none is required", () => {
    const revokedMail: ConsentRecord = {
      ...WRITTEN,
      id: "c2",
      scope: ["mail"],
      revokedAt: "2026-10-05T09:00:00-05:00",
      revocationMethod: "replied STOP",
    };
    expect(checkConsent([WRITTEN, revokedMail], cp, "sms", NOON, "written")).toEqual({ ok: false, reason: "consent:revoked" });
    expect(checkConsent([WRITTEN, revokedMail], cp, "call_script", NOON, "none")).toEqual({ ok: false, reason: "consent:revoked" });
    // A revocation dated after `now` has not happened yet.
    expect(checkConsent([WRITTEN, { ...revokedMail, revokedAt: "2026-10-09T00:00:00Z" }], cp, "sms", NOON, "written").ok).toBe(true);
  });

  it("an unreadable contact fails closed", () => {
    expect(checkConsent([WRITTEN], { kind: "phone", value: "ext 12" }, "sms", NOON, "none")).toEqual({
      ok: false,
      reason: "consent:unreadable-contact",
    });
  });
});

describe("recipient-local contact window (8am–8pm, Mon–Sat; Texas from 9am)", () => {
  it("Alabama on a Tuesday: 8:00am opens, 7:59pm is in, 8:00pm is out, 7:59am is out", () => {
    expect(withinContactWindow(AT("08:00"), { state: "AL" }).ok).toBe(true);
    expect(withinContactWindow(AT("19:59"), { state: "AL" }).ok).toBe(true);
    expect(withinContactWindow(AT("20:00"), { state: "AL" }).ok).toBe(false);
    expect(withinContactWindow(AT("07:59"), { state: "AL" }).ok).toBe(false);
  });

  it("never on a Sunday", () => {
    const sundayNoon = new Date("2026-10-04T12:00:00-05:00");
    expect(withinContactWindow(sundayNoon, { state: "AL" }).ok).toBe(false);
    expect(withinContactWindow(new Date("2026-10-03T12:00:00-05:00"), { state: "AL" }).ok).toBe(true); // Saturday
  });

  it("Texas starts at 9am", () => {
    const w = withinContactWindow(AT("08:30"), { state: "TX" }); // 8:30 CT, 7:30 MT (El Paso)
    expect(w.window.startHour).toBe(9);
    expect(w.ok).toBe(false);
    expect(withinContactWindow(AT("10:30"), { state: "TX" }).ok).toBe(true); // 10:30 CT, 9:30 MT
  });

  it("the 850 area code spans Central and Eastern", () => {
    const fl = withinContactWindow(AT("19:30"), { phone: "+18505550100" }); // 7:30pm CT = 8:30pm ET
    expect(fl.ok).toBe(false);
    expect(new Set(fl.zones)).toEqual(new Set(["America/New_York", "America/Chicago"]));
    expect(withinContactWindow(AT("08:00"), { phone: "+18505550100" }).ok).toBe(true);
    expect(withinContactWindow(AT("07:30"), { phone: "+18505550100" }).ok).toBe(false);
  });

  it("an Alabama address with a Georgia number must be inside the window in both zones", () => {
    expect(withinContactWindow(AT("19:30"), { state: "AL", phone: "+14045550100" }).ok).toBe(false); // 8:30pm ET
    expect(withinContactWindow(AT("19:30"), { state: "AL" }).ok).toBe(true);
  });

  it("an unlisted area code is never ignored, even with a known state", () => {
    const w = withinContactWindow(AT("08:30"), { state: "AL", phone: "+18085551234" }); // Hawaii number
    expect(w.unknownLocation).toBe(true);
    expect(w.zones).toContain("Pacific/Honolulu");
    expect(w.ok).toBe(false);
    expect(withinContactWindow(NOON, { phone: "+442071234567" }).unknownLocation).toBe(true); // non-US
    expect(withinContactWindow(NOON, { state: "ZZ" }).unknownLocation).toBe(true);
  });

  it("no usable signal → every US zone, Adak included", () => {
    const w = withinContactWindow(NOON, {});
    expect(w.unknownLocation).toBe(true);
    expect(w.zones).toEqual(expect.arrayContaining(["America/Adak", "Pacific/Honolulu", "America/Puerto_Rico"]));
    expect(w.ok).toBe(false); // noon Central is 7am in Hawaii
    expect(withinContactWindow(AT("14:00"), {}).ok).toBe(true); // 9am HST, 3pm ET/AST
  });
});

describe("channel policy", () => {
  it("phone channels default strict, paper and email channels need no consent", () => {
    expect(DEFAULT_CHANNEL_POLICIES.sms).toMatchObject({ consent: "written", quietHours: true, requireDncClean: true });
    expect(DEFAULT_CHANNEL_POLICIES.mail.consent).toBe("none");
  });

  it("a pack override can tighten but never relax", () => {
    expect(channelPolicy("mail", { consent: "written", requireLicenseDisclosure: true })).toMatchObject({
      consent: "written",
      requireLicenseDisclosure: true,
    });
    expect(channelPolicy("sms", { consent: "none", quietHours: false, requireDncClean: false })).toMatchObject({
      consent: "written",
      quietHours: true,
      requireDncClean: true,
    });
    expect(channelPolicy("call_script", { landlineExempt: false }).landlineExempt).toBe(false);
  });
});

describe("checkSendable", () => {
  it("a compliant SMS is sendable", () => {
    const v = checkSendable(sms());
    expect(v.reasons).toEqual([]);
    expect(v.sendable).toBe(true);
    expect(() => assertSendable(sms())).not.toThrow();
  });

  it.each([
    ["DNC unknown", { contactPoint: { ...PHONE, dnc: "unknown" as const } }, "dnc:unknown"],
    ["DNC listed", { contactPoint: { ...PHONE, dnc: "listed" as const } }, "dnc:listed"],
    ["no consent", { consents: [] }, "consent:missing"],
    ["verbal consent", { consents: [{ ...WRITTEN, method: "verbal_documented" as const }] }, "consent:not-written"],
    ["quiet hours", { now: AT("20:15") }, "quiet-hours"],
    ["unknown location at noon", { recipientState: undefined, contactPoint: { ...PHONE, value: "+12125550100" }, consents: [{ ...WRITTEN, contact: { kind: "phone" as const, value: "+12125550100" } }] }, "quiet-hours:unknown-location"],
    ["suppressed phone", { suppressions: buildSuppressionList([{ kind: "phone", value: "251-555-0100" }]) }, "suppressed:phone"],
    ["restricted data", { contactPoint: { ...PHONE, licenseTerms: { outreachRestricted: true } } }, "license:outreach-restricted"],
    ["no SMS footer", { message: { channel: "sms" as const, body: "Hi there" } }, "disclosure:footer-missing"],
    ["STOP text not at the end", { message: { channel: "sms" as const, body: `${smsBody()} PS more` } }, "disclosure:footer-missing"],
    ["wrong contact kind", { contactPoint: { ...PHONE, kind: "email" as const, value: "a@b.co" } }, "contact-point:wrong-kind:email"],
    ["channel mismatch", { channel: "call_script" as const }, "channel:mismatch"],
    ["no sender", { sender: undefined }, "sender-identity:missing:name,company"],
    ["invalid clock", { now: new Date("nope") }, "clock:invalid"],
    ["no approval", { approval: undefined }, "approval:missing"],
    ["approval missing", { approval: "missing" as const }, "approval:missing"],
    ["rejected by a person", { approval: "rejected" as const }, "approval:rejected"],
  ] as const)("%s blocks", (_why, patch, reason) => {
    const v = checkSendable(sms(patch as Partial<SendableInput>));
    expect(v.sendable).toBe(false);
    expect(v.reasons).toContain(reason);
  });

  it("reports every reason at once", () => {
    const v = checkSendable(sms({ now: AT("21:00"), consents: [], contactPoint: { ...PHONE, dnc: "unknown" } }));
    expect(v.reasons).toEqual(expect.arrayContaining(["dnc:unknown", "consent:missing", "quiet-hours"]));
    expect(() => assertSendable(sms({ consents: [] }))).toThrow(NotSendableError);
  });

  it("license disclosure: the exact footer must end the body; a near-miss number fails", () => {
    expect(checkSendable(sms({ policy: { requireLicenseDisclosure: true } })).sendable).toBe(true); // footer carries it
    const tampered = smsBody().replace("#000123", "#0001234");
    expect(checkSendable(sms({ message: { channel: "sms", body: tampered }, policy: { requireLicenseDisclosure: true } })).reasons).toContain(
      "disclosure:footer-missing",
    );
    expect(
      checkSendable(sms({ sender: { ...SENDER, licenses: [] }, policy: { requireLicenseDisclosure: true } })).reasons,
    ).toContain("disclosure:license-not-configured");
  });

  it("email, mail and call_script bodies without their footer are not sendable", () => {
    const email: ContactPoint = { ...PHONE, kind: "email", value: "owner@example.com", lineType: undefined };
    expect(
      checkSendable({ ...sms(), message: { channel: "email", body: "hi" }, channel: "email", contactPoint: email, consents: [] }).reasons,
    ).toEqual(["disclosure:footer-missing"]);
    const landline = { ...PHONE, lineType: "landline" as const };
    expect(
      checkSendable({ ...sms(), message: { channel: "call_script", body: "hi" }, channel: "call_script", contactPoint: landline, consents: [] })
        .reasons,
    ).toEqual(["disclosure:footer-missing"]);
  });

  it("linkedin: a pack consent requirement with nothing to check blocks; a revoked email blocks", () => {
    const li = { ...sms(), message: { channel: "linkedin" as const, body: "hi" }, channel: "linkedin" as const, contactPoint: undefined, consents: [] };
    expect(checkSendable(li).sendable).toBe(true);
    expect(checkSendable({ ...li, policy: { consent: "written" } }).reasons).toContain("consent:no-contact");
    const revoked: ConsentRecord = { ...WRITTEN, contact: { kind: "email", value: "pat@acme.com" }, scope: ["email"], revokedAt: "2026-10-01T00:00:00Z" };
    expect(checkSendable({ ...li, contactEmail: "pat@acme.com", consents: [revoked] }).reasons).toContain("consent:revoked");
  });

  it("an unreadable revocation counts as revoked; an unreadable ledger blocks", () => {
    expect(checkSendable(sms({ consents: [WRITTEN, { ...WRITTEN, id: "x", revokedAt: "garbage" }] })).reasons).toContain("consent:revoked");
    expect(checkSendable(sms({ consents: [WRITTEN, { ...WRITTEN, id: "y", contact: { kind: "phone", value: "555-1234" } }] })).reasons).toContain(
      "consent:ledger-unreadable",
    );
  });

  it("mutating a verdict's policy never changes the shared defaults", () => {
    const v = checkSendable(sms());
    expect(() => {
      (v.policy as { quietHours: boolean }).quietHours = false;
    }).not.toThrow();
    expect(DEFAULT_CHANNEL_POLICIES.sms.quietHours).toBe(true);
    expect(Object.isFrozen(DEFAULT_CHANNEL_POLICIES.sms)).toBe(true);
  });

  it("call_script: a DNC-clean known landline needs no consent record, a mobile does", () => {
    const script = applyComplianceFooter({ channel: "call_script", body: "Ask about the listing." }, SENDER);
    const base = { ...sms(), message: script, channel: "call_script" as const, consents: [] };
    expect(checkSendable({ ...base, contactPoint: { ...PHONE, lineType: "landline" } }).sendable).toBe(true);
    expect(checkSendable({ ...base, contactPoint: { ...PHONE, lineType: "unknown" } }).reasons).toContain("consent:missing");
    expect(checkSendable({ ...base, contactPoint: { ...PHONE, lineType: "landline", dnc: "unknown" } }).reasons).toEqual(
      expect.arrayContaining(["dnc:unknown", "consent:missing"]),
    );
  });

  it("mail: a suppressed mailing address blocks, consent is not required", () => {
    const letter = applyComplianceFooter({ channel: "mail", body: "Dear owner," }, SENDER);
    const addr: ContactPoint = { ...PHONE, kind: "mail", value: "12 Main St, Foley, AL 36535", lineType: undefined };
    const base = { ...sms(), message: letter, channel: "mail" as const, contactPoint: addr, consents: [] };
    expect(checkSendable(base).sendable).toBe(true);
    const supp = buildSuppressionList([{ kind: "address", value: "12 Main Street, Foley, Alabama 36535" }]);
    expect(checkSendable({ ...base, suppressions: supp }).reasons).toContain("suppressed:address");
  });

  it("email: a draft flagged as missing sender identity is not sendable", () => {
    const cp: ContactPoint = { ...PHONE, kind: "email", value: "owner@example.com", lineType: undefined };
    const v = checkSendable({
      ...sms(),
      message: { channel: "email", body: "Hi", needsSenderIdentity: true },
      channel: "email",
      contactPoint: cp,
      consents: [],
    });
    expect(v.reasons).toContain("sender-identity:missing");
  });
});

describe("per-channel footers", () => {
  it("SMS carries sender, license and STOP; no postal address", () => {
    const f = smsFooter(SENDER);
    expect(f).toBe(`- Pat Agent, Example Realty\nExample Realty, AL license #000123\n${SMS_OPT_OUT_TEXT}`);
    expect(f).not.toContain("Main St");
  });

  it("mail carries the postal block and the license line", () => {
    const m = applyComplianceFooter({ channel: "mail", body: "Dear owner," }, SENDER);
    expect(m.body).toContain("Foley, AL 36535");
    expect(m.body).toContain(licenseLines(SENDER)[0]);
    expect(m.needsSenderIdentity).toBe(false);
  });

  it("a call script gets the spoken disclosures", () => {
    expect(callScriptFooter(SENDER)).toContain('Open with: "This is Pat Agent with Example Realty."');
  });

  it("SMS needs only name + company; mail needs the postal address", () => {
    const noAddress = { ...SENDER, postalAddress: "" };
    expect(applyComplianceFooter({ channel: "sms", body: "x" }, noAddress).needsSenderIdentity).toBe(false);
    expect(applyComplianceFooter({ channel: "mail", body: "x" }, noAddress).needsSenderIdentity).toBe(true);
  });
});

describe("CLI: check-send", () => {
  const tsx = resolve("node_modules/.bin/tsx");
  const cli = resolve("cli.ts");
  const home = mkdtempSync(join(tmpdir(), "io-checksend-"));
  const profile = join(home, "profile.json");
  writeFileSync(
    profile,
    JSON.stringify({
      name: "test",
      description: "check-send test profile",
      output: { formats: ["markdown"] },
      delivery: { targets: ["console"] },
      sender: SENDER,
    }),
  );
  const run = (input: unknown, ...args: string[]) =>
    spawnSync(tsx, [cli, "check-send", ...args], {
      env: { ...process.env, INTENT_OUTREACH_HOME: home },
      input: typeof input === "string" ? input : JSON.stringify(input),
      encoding: "utf8",
    });
  const input = {
    message: { channel: "sms", body: smsBody() },
    channel: "sms",
    contactPoint: PHONE,
    now: NOON.toISOString(),
    consents: [WRITTEN],
    recipientState: "AL",
    runId: "run-1",
    contactKey: "person:1",
  };
  writeFileSync(
    join(home, "approvals.jsonl"),
    `${JSON.stringify({
      runId: "run-1",
      contactKey: "person:1",
      channel: "sms",
      messageSha256: messageDigest({ channel: "sms", body: smsBody() }),
      decision: "approved",
      by: "test",
      at: "2026-10-06T10:00:00.000Z",
    })}\n`,
  );

  it("exit 0 + JSON verdict when sendable, 3 when not, 2 on bad input", { timeout: 60_000 }, async () => {
    await new JsonlRunStore(join(home, "runs.jsonl")).saveRun(
      assertCampaignRun({
        id: "run-1",
        schemaVersion: SCHEMA_VERSION,
        icp: "x",
        domains: [],
        provider: "anthropic",
        model: "stub",
        status: "complete",
        parties: [{ key: "person:1", kind: "person", name: "Pat Owner", source: "fixture" }],
        contactPoints: [PHONE],
        messages: [
          { contactKey: "person:1", channel: "sms", body: smsBody(), cta: "Reply?", model: "stub", promptVersion: "p", createdAt: "2026-10-06T10:00:00.000Z" },
        ],
        createdAt: "2026-10-06T10:00:00.000Z",
      }),
    );
    const ok = run(input, "--profile", profile);
    expect(ok.stderr).toBe("");
    expect(ok.status).toBe(0);
    expect(JSON.parse(ok.stdout)).toMatchObject({ sendable: true, reasons: [] });

    const blocked = run({ ...input, consents: [] }, "--profile", profile);
    expect(blocked.status).toBe(3);
    expect(JSON.parse(blocked.stdout).reasons).toContain("consent:missing");

    // An edited message no longer matches the approved digest; no run id means no approval.
    const edited = run({ ...input, message: { channel: "sms", body: `${smsBody()} ` + "x" } }, "--profile", profile);
    expect(JSON.parse(edited.stdout).reasons).toContain("approval:missing");
    const anonymous = run({ ...input, runId: undefined }, "--profile", profile);
    expect(JSON.parse(anonymous.stdout).reasons).toContain("approval:missing");

    // The approved text cannot be redirected to another number, or claimed for an unknown run.
    const redirected = run(
      {
        ...input,
        contactPoint: { ...PHONE, value: "+12515550199" },
        consents: [{ ...WRITTEN, contact: { kind: "phone", value: "+12515550199" } }],
      },
      "--profile",
      profile,
    );
    expect(redirected.status).toBe(3);
    expect(JSON.parse(redirected.stdout).reasons).toEqual(["recipient:mismatch"]);
    expect(JSON.parse(run({ ...input, runId: "run-404" }, "--profile", profile).stdout).reasons).toContain(
      "run:message-not-found",
    );

    expect(run("{not json", "--profile", profile).status).toBe(2);
    expect(run({ ...input, channel: "fax" }, "--profile", profile).status).toBe(2);
  });
});
