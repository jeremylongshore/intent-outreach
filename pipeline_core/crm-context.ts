/** Short-lived CRM exclusions. A supplied snapshot is never treated as empty on error. */
import { z } from "zod";
import { buildSuppressionList, normalizeSuppression, type SuppressionList } from "./compliance/suppression.js";
import { propertyKey, type ResearchQuery } from "./models.js";
import type { PropertyModel } from "./pipeline.js";
import { formatAddress } from "./property-seam.js";
import { checkSuppression } from "./compliance/suppression.js";

export const CRM_MAX_AGE_MS = 15 * 60_000;
const IdentitySchema = z.object({
  kind: z.enum(["parcel", "party", "email", "phone", "address", "domain"]),
  value: z.string().min(1).max(1000),
}).strict().transform((entry, ctx) => {
  try {
    if (entry.kind === "parcel") {
      const match = /^(\d{5}):(.+)$/.exec(entry.value);
      if (!match || match[2] !== match[2]!.trim()) throw new Error();
      return { ...entry, value: propertyKey(match[1]!, match[2]!) };
    }
    if (entry.kind === "party") return entry;
    return { ...entry, value: normalizeSuppression(entry.kind, entry.value) };
  } catch {
    ctx.addIssue({ code: "custom", message: "invalid CRM identifier" });
    return z.NEVER;
  }
});
export const CrmContextSchema = z.object({
  version: z.literal(1),
  source: z.literal("erpnext"),
  generatedAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }),
  suppressions: z.array(IdentitySchema).max(100_000),
  doNotResearch: z.array(IdentitySchema).max(100_000),
}).strict();
export type CrmContext = z.infer<typeof CrmContextSchema>;
type Identity = CrmContext["suppressions"][number];

/** Generic errors deliberately omit CRM identifiers and untrusted values. */
export function parseCrmContext(raw: unknown, now: number): CrmContext {
  const parsed = CrmContextSchema.safeParse(raw);
  if (!parsed.success) throw new Error("CRM context is invalid");
  assertFreshCrmContext(parsed.data, now);
  return parsed.data;
}
export function assertFreshCrmContext(context: CrmContext, now: number): void {
  const start = Date.parse(context.generatedAt);
  const end = Date.parse(context.expiresAt);
  if (!Number.isFinite(now) || start > now || end <= now || end <= start || end - start > CRM_MAX_AGE_MS) {
    throw new Error("CRM context is expired or has an invalid freshness window; pull it again");
  }
}
function contacts(entries: readonly Identity[]): SuppressionList {
  return buildSuppressionList(entries.flatMap((e) => e.kind === "parcel" || e.kind === "party" ? [] : [{ kind: e.kind, value: e.value }]));
}
export function mergeCrmSuppressions(base: SuppressionList, context: CrmContext): SuppressionList {
  const crm = contacts(context.suppressions);
  return {
    emails: new Set([...base.emails, ...crm.emails]),
    phones: new Set([...base.phones, ...crm.phones]),
    addresses: new Set([...base.addresses, ...crm.addresses]),
    domains: new Set([...base.domains, ...crm.domains]),
  };
}
export function crmQueryExcluded(query: ResearchQuery, context: CrmContext): boolean {
  if (query.kind !== "parcel") return false;
  const entries = [...context.doNotResearch, ...context.suppressions];
  if (query.countyFips && query.apn && entries.some((e) => e.kind === "parcel" && e.value === propertyKey(query.countyFips!, query.apn!))) return true;
  const address = formatAddress(query.address);
  return !!address && checkSuppression(contacts(entries), { domains: [], addresses: [address] }).status !== "clean";
}

/** Match every co-owner and contact point; malformed contact data fails closed. */
export function crmExcludedProperties(model: PropertyModel, entries: readonly Identity[]): Set<string> {
  const excluded = new Set(entries.filter((e) => e.kind === "parcel").map((e) => e.value));
  const parties = new Set(entries.filter((e) => e.kind === "party").map((e) => e.value));
  const list = contacts(entries);
  for (const party of model.parties) {
    const points = model.contactPoints.filter((p) => p.partyKey === party.key);
    const mailing = formatAddress(party.mailingAddress);
    const subject = {
      domains: [],
      phones: points.filter((p) => p.kind === "phone").map((p) => p.value),
      addresses: [...(mailing ? [mailing] : []), ...points.filter((p) => p.kind === "mail").map((p) => p.value)],
    };
    const emails = points.filter((p) => p.kind === "email").map((p) => p.value);
    if ((emails.length ? emails : [undefined]).some((email) => checkSuppression(list, { ...subject, email }).status !== "clean")) parties.add(party.key);
  }
  // Entity resolution connects a person to an owning entity. Exclude the connected component.
  let changed = true;
  while (changed) {
    changed = false;
    for (const link of model.entityLinks) {
      if (parties.has(link.entityKey) || parties.has(link.personKey)) {
        for (const key of [link.entityKey, link.personKey]) if (!parties.has(key)) { parties.add(key); changed = true; }
      }
    }
  }
  for (const own of model.ownerships) if (parties.has(own.partyKey)) excluded.add(own.propertyKey);
  for (const property of model.properties) {
    const address = formatAddress(property.address);
    if (address && checkSuppression(list, { domains: [], addresses: [address] }).status !== "clean") excluded.add(property.key);
  }
  return excluded;
}

/** Keep no discovered owner/contact records belonging only to excluded parcels. */
export function removeCrmExcluded(model: PropertyModel, excluded: ReadonlySet<string>): PropertyModel {
  const properties = model.properties.filter((p) => !excluded.has(p.key));
  const keys = new Set(properties.map((p) => p.key));
  const ownerships = model.ownerships.filter((o) => keys.has(o.propertyKey));
  const partyKeys = new Set(ownerships.map((o) => o.partyKey));
  let changed = true;
  while (changed) {
    changed = false;
    for (const link of model.entityLinks) {
      if (partyKeys.has(link.entityKey) || partyKeys.has(link.personKey)) {
        for (const key of [link.entityKey, link.personKey]) if (!partyKeys.has(key)) { partyKeys.add(key); changed = true; }
      }
    }
  }
  return {
    properties, ownerships,
    parties: model.parties.filter((p) => partyKeys.has(p.key)),
    contactPoints: model.contactPoints.filter((p) => partyKeys.has(p.partyKey)),
    entityLinks: model.entityLinks.filter((e) => partyKeys.has(e.entityKey) && partyKeys.has(e.personKey)),
  };
}
