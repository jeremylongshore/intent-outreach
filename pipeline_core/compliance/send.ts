/**
 * pipeline_core/compliance/send.ts — the SEND-TIME check every dispatcher calls.
 *
 * The engine drafts and never sends. Whatever sends (coastal's dispatcher, a
 * human with a phone) must call `checkSendable` / `assertSendable` at the moment
 * of sending, because the facts that decide legality change after drafting: a
 * STOP arrives, a consent is revoked, the clock moves into quiet hours, a DNC
 * scrub lands. Draft-time gates cannot see any of that.
 *
 * One call evaluates one message to one contact point on one channel and
 * returns EVERY reason it may not be sent, so an operator sees the whole
 * picture at once. Fail-closed throughout: unknown DNC status, an unknown
 * recipient location, a missing consent, a missing disclosure: each blocks.
 *
 * Per-channel rules (defaults; a pack may only TIGHTEN them, see channelPolicy):
 *   email        suppression, the CAN-SPAM footer
 *   linkedin     suppression and revocations on the contact's email when known
 *   sms          suppression, DNC "clean", WRITTEN consent, the phone window
 *                (8am–8pm local, Mon–Sat; see timezones.ts), the SMS footer
 *   call_script  suppression, DNC "clean", consent (written, unless a known
 *                DNC-clean landline), the phone window, the disclosure block
 *   mail         suppression on the mailing address, the postal footer
 * FOOTERS are checked as the EXACT block the footer module produces for this
 * sender, at the END of the body, so an edited, truncated or hand-written body
 * cannot pass on a substring. Every channel: a contact point whose license
 * terms restrict outreach blocks; a policy that requires license disclosure
 * needs licenses configured (the footer then carries them); a policy that
 * requires consent blocks when there is nothing to check consent against.
 *
 * Pure: no I/O, the clock is injected, no model.
 */

import type { Channel, ContactPoint } from "../models.js";
import { footerFor, missingSenderFields, type SenderIdentity } from "../footer.js";
import { checkConsent, type ConsentRecord, type ConsentRequirement } from "./consent.js";
import { checkSuppression, type SuppressionList, type SuppressionSubject } from "./suppression.js";
import { withinContactWindow, type WindowCheck } from "./timezones.js";

/** What a channel requires at send time. */
export interface ChannelPolicy {
  /** Consent needed: none, any valid record, or a written one. */
  consent: ConsentRequirement;
  /** For call_script: a DNC-clean known landline needs no consent record. */
  landlineExempt: boolean;
  /** Enforce the recipient-local contact window. */
  quietHours: boolean;
  /** Phone channels: DNC status must be exactly "clean". */
  requireDncClean: boolean;
  /** Every configured license number must appear in the body. */
  requireLicenseDisclosure: boolean;
}

const policy = (p: ChannelPolicy): Readonly<ChannelPolicy> => Object.freeze(p);
export const DEFAULT_CHANNEL_POLICIES: Readonly<Record<Channel, Readonly<ChannelPolicy>>> = Object.freeze({
  email: policy({ consent: "none", landlineExempt: false, quietHours: false, requireDncClean: false, requireLicenseDisclosure: false }),
  linkedin: policy({ consent: "none", landlineExempt: false, quietHours: false, requireDncClean: false, requireLicenseDisclosure: false }),
  sms: policy({ consent: "written", landlineExempt: false, quietHours: true, requireDncClean: true, requireLicenseDisclosure: false }),
  call_script: policy({ consent: "written", landlineExempt: true, quietHours: true, requireDncClean: true, requireLicenseDisclosure: false }),
  mail: policy({ consent: "none", landlineExempt: false, quietHours: false, requireDncClean: false, requireLicenseDisclosure: false }),
});

const CONSENT_RANK: Record<ConsentRequirement, number> = { none: 0, any: 1, written: 2 };

/**
 * The effective policy: the default for the channel, tightened by a pack
 * override. An override can only make a rule stricter: it can raise the consent
 * requirement or turn a check on, never relax a default.
 */
export function channelPolicy(channel: Channel, override?: Partial<ChannelPolicy>): ChannelPolicy {
  const base = DEFAULT_CHANNEL_POLICIES[channel];
  if (!override) return { ...base }; // a copy: callers can never mutate the shared defaults
  return {
    consent:
      override.consent && CONSENT_RANK[override.consent] > CONSENT_RANK[base.consent] ? override.consent : base.consent,
    landlineExempt: base.landlineExempt && override.landlineExempt !== false,
    quietHours: base.quietHours || override.quietHours === true,
    requireDncClean: base.requireDncClean || override.requireDncClean === true,
    requireLicenseDisclosure: base.requireLicenseDisclosure || override.requireLicenseDisclosure === true,
  };
}

const CONTACT_KIND: Readonly<Record<Channel, ContactPoint["kind"] | null>> = {
  email: "email",
  linkedin: null,
  sms: "phone",
  call_script: "phone",
  mail: "mail",
};

export interface SendableInput {
  /** The message as it will go out (footer already applied). */
  message: { channel: Channel; body: string; needsSenderIdentity?: boolean | undefined };
  channel: Channel;
  /** Where it goes. Required for every channel but linkedin. */
  contactPoint?: ContactPoint | undefined;
  /** For linkedin: the contact's email, if known, so an email opt-out still applies. */
  contactEmail?: string | undefined;
  now: Date;
  consents?: readonly ConsentRecord[] | undefined;
  suppressions: SuppressionList;
  /** 2-letter state of the recipient's mailing address, when known (quiet hours). */
  recipientState?: string | undefined;
  sender?: SenderIdentity | undefined;
  /** The pack's override for this channel (tighten-only). */
  policy?: Partial<ChannelPolicy> | undefined;
}

export interface SendVerdict {
  sendable: boolean;
  /** Every reason the message may not be sent; empty when sendable. */
  reasons: string[];
  policy: ChannelPolicy;
  window?: WindowCheck;
}

/** Evaluate one message for sending. Pure; returns every blocking reason. */
export function checkSendable(input: SendableInput): SendVerdict {
  const { channel, contactPoint: cp, now } = input;
  const policy = channelPolicy(channel, input.policy);
  const reasons: string[] = [];
  let window: WindowCheck | undefined;

  if (!(now instanceof Date) || Number.isNaN(now.getTime())) reasons.push("clock:invalid");
  if (input.message.channel !== channel) reasons.push("channel:mismatch");

  const kind = CONTACT_KIND[channel];
  if (kind !== null) {
    if (!cp) reasons.push("contact-point:missing");
    else if (cp.kind !== kind) reasons.push(`contact-point:wrong-kind:${cp.kind}`);
  }

  if (input.message.needsSenderIdentity === true) reasons.push("sender-identity:missing");
  const missing = missingSenderFields(input.sender, channel);
  if (channel !== "linkedin" && missing.length > 0) reasons.push(`sender-identity:missing:${missing.join(",")}`);

  // Suppression: everything known about the recipient.
  const subject: SuppressionSubject = { domains: [] };
  if (cp?.kind === "email") subject.email = cp.value;
  else if (input.contactEmail) subject.email = input.contactEmail;
  if (cp?.kind === "phone") subject.phones = [cp.value];
  if (cp?.kind === "mail") subject.addresses = [cp.value];
  const suppression = checkSuppression(input.suppressions, subject);
  if (suppression.status !== "clean") reasons.push(suppression.reason ?? "suppressed");

  if (cp?.licenseTerms?.outreachRestricted === true) reasons.push("license:outreach-restricted");

  const isPhoneChannel = channel === "sms" || channel === "call_script";
  if (isPhoneChannel && cp?.kind === "phone") {
    if (policy.requireDncClean && cp.dnc !== "clean") reasons.push(`dnc:${cp.dnc}`);
    const landline = policy.landlineExempt && cp.lineType === "landline" && cp.dnc === "clean";
    const requirement: ConsentRequirement = landline ? "none" : policy.consent;
    const consent = checkConsent(input.consents ?? [], cp, channel, now, requirement);
    if (!consent.ok) reasons.push(consent.reason);
  } else if (cp) {
    const consent = checkConsent(input.consents ?? [], cp, channel, now, policy.consent);
    if (!consent.ok) reasons.push(consent.reason);
  } else if (input.contactEmail) {
    // linkedin: consent and revocations keyed by the contact's email.
    const consent = checkConsent(input.consents ?? [], { kind: "email", value: input.contactEmail }, channel, now, policy.consent);
    if (!consent.ok) reasons.push(consent.reason);
  } else if (policy.consent !== "none") {
    reasons.push("consent:no-contact");
  }

  if (policy.quietHours && !reasons.includes("clock:invalid")) {
    window = withinContactWindow(now, { state: input.recipientState, phone: cp?.kind === "phone" ? cp.value : undefined });
    if (!window.ok) reasons.push(window.unknownLocation ? "quiet-hours:unknown-location" : "quiet-hours");
  }

  if (input.sender && missing.length === 0) {
    const footer = footerFor(input.sender, channel);
    if (footer !== undefined && !input.message.body.replace(/\s+$/, "").endsWith(footer)) {
      reasons.push("disclosure:footer-missing");
    }
  }
  if (policy.requireLicenseDisclosure && (input.sender?.licenses ?? []).length === 0) {
    reasons.push("disclosure:license-not-configured");
  }

  return { sendable: reasons.length === 0, reasons, policy, ...(window ? { window } : {}) };
}

/** Thrown by assertSendable; `reasons` lists every blocking reason. */
export class NotSendableError extends Error {
  constructor(public readonly reasons: readonly string[]) {
    super(`not sendable: ${reasons.join(", ")}`);
    this.name = "NotSendableError";
  }
}

/** Throw unless the message may be sent now. Dispatchers call this right before sending. */
export function assertSendable(input: SendableInput): void {
  const verdict = checkSendable(input);
  if (!verdict.sendable) throw new NotSendableError(verdict.reasons);
}
