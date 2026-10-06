/**
 * pipeline_core/footer.ts — the CAN-SPAM footer, appended by CODE, never by the LLM.
 *
 * CAN-SPAM (15 U.S.C. 7704) requires every commercial email to identify the
 * sender, carry a valid physical postal address, and give a clear way to opt
 * out. Asking the model to write those lines would make a legal requirement
 * probabilistic (it can drop, paraphrase or invent an address). So the model
 * drafts the message, the validator accepts it, and THEN this pure function
 * appends the footer from operator-configured sender identity.
 *
 * Rules:
 *   • EMAIL: sender name + company, postal address, optional reply-to, opt-out line.
 *   • EMAIL with no (or incomplete) sender identity: NOTHING is appended — we never
 *     fabricate a name or an address — and the message is flagged
 *     `needsSenderIdentity: true`. runCampaign records a run-level warning.
 *   • LINKEDIN: no postal footer. A LinkedIn message is delivered inside LinkedIn,
 *     not as email, so the CAN-SPAM postal-address requirement does not attach,
 *     and a street address in a DM reads as spam and leaks the operator's address.
 *     The opt-out sentence is still useful courtesy, so it is OPT-IN per sender
 *     (`optOutOnLinkedin: true`); default off keeps LinkedIn drafts unchanged.
 *
 *   • SMS: sender name + company (+ license disclosure) and "Reply STOP to opt
 *     out." on every text. No postal address (it does not fit and is not required).
 *   • MAIL: the email footer block (identity, postal address, license, opt-out).
 *   • CALL_SCRIPT: a "say this" disclosure block for the human caller: who is
 *     calling, for which company, the license, and what to do on "don't call".
 *   • A real estate sender adds `licenses`; every channel's footer then carries
 *     the brokerage + license number line(s) the AL and FL commissions require.
 *
 * Pure: no I/O, no clock, no model. Idempotent: a body that already ends with
 * the exact footer is returned unchanged.
 */

import { z } from "zod";
import type { Channel } from "./models.js";

/** SMS opt-out line (CTIA / carrier standard wording). */
export const SMS_OPT_OUT_TEXT = "Reply STOP to opt out.";

/** Default opt-out line. Plain reply-based opt-out (no tracking link to host). */
export const DEFAULT_OPT_OUT_TEXT =
  'Not the right person or not interested? Reply "unsubscribe" and I won\'t contact you again.';

/** Separator between the drafted body and the footer (RFC 3676 signature delimiter). */
export const FOOTER_DELIMITER = "-- ";

const nonBlank = z.string().trim().min(1);

/** Operator-configured sender identity (Report Profile `sender`). */
export const SenderIdentitySchema = z.object({
  /** The human the message is from, e.g. "Jeremy Longshore". */
  name: nonBlank,
  /** The sending company, e.g. "intentsolutions.io LLC". */
  company: nonBlank,
  /** A valid physical postal address (street or registered PO box). May be multi-line. */
  postalAddress: nonBlank,
  /** Optional reply-to address shown in the footer. */
  replyToEmail: z.string().trim().email().optional(),
  /** Opt-out sentence. Defaults to DEFAULT_OPT_OUT_TEXT. */
  optOutText: nonBlank.optional(),
  /** Append the opt-out sentence to LinkedIn drafts too (no postal footer). Default false. */
  optOutOnLinkedin: z.boolean().optional(),
  /**
   * Real estate licenses to disclose on every outbound message, e.g.
   * `{ state: "AL", number: "000123", brokerage: "Example Realty" }`.
   */
  licenses: z
    .array(
      z.object({
        state: z.string().regex(/^[A-Z]{2}$/, "expected a 2-letter state code"),
        number: nonBlank,
        brokerage: nonBlank,
      }),
    )
    .optional(),
});
export type SenderIdentity = z.infer<typeof SenderIdentitySchema>;

/** The message fields the footer reads/writes. Structural so any Message fits. */
export interface FooterableMessage {
  channel: Channel;
  body: string;
}

const isBlank = (v: unknown) => typeof v !== "string" || v.trim() === "";

/**
 * The required sender fields that are missing/blank (empty = identity is
 * complete). Email and mail need a postal address; sms and call_script need
 * only a name and company. Defaults to the email requirement.
 */
export function missingSenderFields(sender: Partial<SenderIdentity> | undefined, channel: Channel = "email"): string[] {
  const missing: string[] = [];
  if (isBlank(sender?.name)) missing.push("name");
  if (isBlank(sender?.company)) missing.push("company");
  if ((channel === "email" || channel === "mail") && isBlank(sender?.postalAddress)) missing.push("postalAddress");
  return missing;
}

/** One line per license: "Example Realty, AL license #000123". */
export function licenseLines(sender: Partial<SenderIdentity> | undefined): string[] {
  return (sender?.licenses ?? []).map((l) => `${oneLine(l.brokerage)}, ${l.state} license #${oneLine(l.number)}`);
}

const oneLine = (s: string) => s.replace(/\s*[\r\n]+\s*/g, " ").trim();

function optOutOf(sender: Partial<SenderIdentity> | undefined): string {
  return isBlank(sender?.optOutText) ? DEFAULT_OPT_OUT_TEXT : oneLine(sender!.optOutText!);
}

/** The email footer block for a complete sender identity. */
export function emailFooter(sender: SenderIdentity): string {
  const address = sender.postalAddress
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
  return [
    FOOTER_DELIMITER,
    `${oneLine(sender.name)}, ${oneLine(sender.company)}`,
    address,
    ...(sender.replyToEmail ? [`Reply-To: ${sender.replyToEmail.trim()}`] : []),
    ...licenseLines(sender),
    optOutOf(sender),
  ].join("\n");
}

/** The SMS footer: who is texting, the license, and the STOP line. */
export function smsFooter(sender: SenderIdentity): string {
  const licenses = licenseLines(sender);
  return [`- ${oneLine(sender.name)}, ${oneLine(sender.company)}`, ...licenses, SMS_OPT_OUT_TEXT].join("\n");
}

/** The disclosure block a human caller reads; the engine never dials. */
export function callScriptFooter(sender: SenderIdentity): string {
  const licenses = licenseLines(sender);
  return [
    "[Required disclosures]",
    `Open with: "This is ${oneLine(sender.name)} with ${oneLine(sender.company)}."`,
    ...licenses.map((l) => `State the license: ${l}.`),
    "If they ask not to be called again: end the call politely and add the number to the suppression list.",
  ].join("\n");
}

/** The exact footer block a channel's message must END with; undefined for linkedin. */
export function footerFor(sender: SenderIdentity, channel: Channel): string | undefined {
  switch (channel) {
    case "email":
    case "mail":
      return emailFooter(sender);
    case "sms":
      return smsFooter(sender);
    case "call_script":
      return callScriptFooter(sender);
    default:
      return undefined;
  }
}

function appendBlock(body: string, block: string): string {
  const trimmed = body.replace(/\s+$/, "");
  if (trimmed.endsWith(block)) return body; // idempotent
  return `${trimmed}\n\n${block}`;
}

/**
 * Append the compliance footer to a drafted message. Returns a NEW message
 * (input untouched) with `needsSenderIdentity` set:
 *   email + complete sender   → footer appended, needsSenderIdentity=false
 *   email + missing sender    → body unchanged,  needsSenderIdentity=true
 *   linkedin                  → no postal footer (opt-out sentence only if
 *                               sender.optOutOnLinkedin), needsSenderIdentity=false
 */
export function applyComplianceFooter<M extends FooterableMessage>(
  message: M,
  sender: SenderIdentity | undefined,
): M & { needsSenderIdentity: boolean } {
  if (message.channel === "linkedin") {
    const body =
      sender?.optOutOnLinkedin === true ? appendBlock(message.body, optOutOf(sender)) : message.body;
    return { ...message, body, needsSenderIdentity: false };
  }
  if (!sender || missingSenderFields(sender, message.channel).length > 0) {
    return { ...message, needsSenderIdentity: true };
  }
  const footer = footerFor(sender, message.channel) ?? ""; // email and mail carry the full postal block
  return { ...message, body: appendBlock(message.body, footer), needsSenderIdentity: false };
}
