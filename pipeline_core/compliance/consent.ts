/**
 * pipeline_core/compliance/consent.ts — the consent ledger (pure).
 *
 * A ConsentRecord is the evidence that a person agreed to be contacted on a
 * channel: when, how, where, and the EXACT text they were shown. Field names
 * match coastal-realty-ops `web/shared/types/consent.ts` (recordedAt,
 * textVersion, sourceUrl, method) so the two records merge without a mapping
 * layer; this one adds the contact, the scope and revocation.
 *
 * Rules (fail closed):
 *   • A record counts only for the exact contact (normalized phone, email or
 *     mailing address), only for the channels in its scope, and only from
 *     `recordedAt` on.
 *   • REVOKE-ALL: once any record for a contact is revoked, no consent for
 *     that contact counts on any channel. A person who says stop once has
 *     said stop.
 *   • "Written" consent (what the TCPA requires for marketing texts and for
 *     autodialed or prerecorded calls to a cell) is only a method that leaves
 *     a written record the person signed or submitted: web_form, signed_form.
 *     Verbal and imported consents never count as written.
 *
 * Pure: no I/O, no clock (now is injected). The I/O that stores records lives
 * with the business system (coastal / ERPNext); the engine evaluates the
 * records it is handed.
 */

import { z } from "zod";
import { ChannelSchema, type Channel, type ContactPoint } from "../models.js";
import { normalizePhone } from "./index.js";
import { normalizeMailingAddress, normalizeSuppressionEmail } from "./suppression.js";

export const CONSENT_METHODS = ["web_form", "signed_form", "verbal_documented", "in_person", "sphere_import"] as const;
/** Methods that produce a written record the person submitted or signed. */
export const WRITTEN_CONSENT_METHODS: ReadonlySet<string> = new Set(["web_form", "signed_form"]);

export const ConsentRecordSchema = z.object({
  id: z.string().min(1),
  contact: z.object({ kind: z.enum(["phone", "email", "mail"]), value: z.string().min(1) }),
  /** Channels this consent covers. */
  scope: z.array(ChannelSchema).min(1),
  method: z.enum(CONSENT_METHODS),
  /** ISO 8601 instant the consent was given. */
  recordedAt: z.string().datetime({ offset: true }),
  /** The exact consent language shown, verbatim. */
  textShown: z.string().min(1),
  /** Versioned consent copy; bump when the language changes. */
  textVersion: z.string().min(1),
  /** Where it was captured (form URL, document id). */
  sourceUrl: z.string().min(1).optional(),
  remoteAddress: z.string().optional(),
  userAgent: z.string().optional(),
  revokedAt: z.string().datetime({ offset: true }).optional(),
  revocationMethod: z.string().min(1).optional(),
});
export type ConsentRecord = z.infer<typeof ConsentRecordSchema>;

export type ConsentRequirement = "none" | "any" | "written";

function contactKey(kind: ContactPoint["kind"], value: string): string | null {
  try {
    if (kind === "phone") return `phone:${normalizePhone(value)}`;
    if (kind === "email") return `email:${normalizeSuppressionEmail(value)}`;
    return `mail:${normalizeMailingAddress(value)}`;
  } catch {
    return null;
  }
}

export type ConsentVerdict =
  | { ok: true; record?: ConsentRecord }
  | { ok: false; reason: "consent:missing" | "consent:revoked" | "consent:not-written" | "consent:unreadable-contact" };

/**
 * Does the ledger hold consent good enough to contact `contact` on `channel` at
 * `now`? `requirement` comes from the channel policy: "none" always passes
 * (unless revoked: a revocation still blocks), "any" needs a valid record,
 * "written" needs a valid record with a written method.
 */
export function checkConsent(
  records: readonly ConsentRecord[],
  contact: Pick<ContactPoint, "kind" | "value">,
  channel: Channel,
  now: Date,
  requirement: ConsentRequirement,
): ConsentVerdict {
  const key = contactKey(contact.kind, contact.value);
  if (key === null) return { ok: false, reason: "consent:unreadable-contact" };
  const mine = records.filter((r) => contactKey(r.contact.kind, r.contact.value) === key);
  if (mine.some((r) => r.revokedAt !== undefined && Date.parse(r.revokedAt) <= now.getTime())) {
    return { ok: false, reason: "consent:revoked" };
  }
  if (requirement === "none") return { ok: true };
  const valid = mine.filter((r) => r.scope.includes(channel) && Date.parse(r.recordedAt) <= now.getTime());
  if (valid.length === 0) return { ok: false, reason: "consent:missing" };
  if (requirement === "written") {
    const written = valid.find((r) => WRITTEN_CONSENT_METHODS.has(r.method));
    return written ? { ok: true, record: written } : { ok: false, reason: "consent:not-written" };
  }
  return { ok: true, record: valid[0] };
}
