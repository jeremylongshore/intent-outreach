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
 * Pure: no I/O, no clock, no model. Idempotent: a body that already ends with
 * the exact footer is returned unchanged.
 */

import { z } from "zod";

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
});
export type SenderIdentity = z.infer<typeof SenderIdentitySchema>;

/** The message fields the footer reads/writes. Structural so any Message fits. */
export interface FooterableMessage {
  channel: "email" | "linkedin";
  body: string;
}

const isBlank = (v: unknown) => typeof v !== "string" || v.trim() === "";

/** The required sender fields that are missing/blank (empty = identity is complete). */
export function missingSenderFields(sender: Partial<SenderIdentity> | undefined): string[] {
  const missing: string[] = [];
  if (isBlank(sender?.name)) missing.push("name");
  if (isBlank(sender?.company)) missing.push("company");
  if (isBlank(sender?.postalAddress)) missing.push("postalAddress");
  return missing;
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
    optOutOf(sender),
  ].join("\n");
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
  if (!sender || missingSenderFields(sender).length > 0) {
    return { ...message, needsSenderIdentity: true };
  }
  return { ...message, body: appendBlock(message.body, emailFooter(sender)), needsSenderIdentity: false };
}
