/** Fixed pack configuration for normalized data. Debug raw responses are a separate, explicit boundary. */
import { ContactPointSchema, ContactSchema, EntityLinkSchema, LeadSchema, OwnershipSchema, PartySchema, PropertySchema, type Enrichment, type Property } from "./models.js";
import type { ResearchOutput } from "./connectors/types.js";
import { isFcraSensitiveKey, keyTokens } from "./compliance/risk.js";

export interface PiiPolicy {
  kind: "business" | "property-owner";
  /** Additional property fact keys approved in trusted pack code, never vendor/model input. */
  propertyAttributes?: readonly string[];
}
export const BUSINESS_PII: PiiPolicy = Object.freeze({ kind: "business" });
export const PROPERTY_PII: PiiPolicy = Object.freeze({ kind: "property-owner" });
export const PII_POLICY_VERSION = 1;
const PROPERTY_FACTS = new Set([
  "justValueCents", "marketValueCents", "assessedValueCents", "landValueCents", "improvementValueCents",
  "landUseCode", "propertyType", "yearBuilt", "livingAreaSqft", "landSqft", "lotAcres", "bedrooms", "bathrooms",
  "homesteadExemption", "lastSalePriceCents", "lastSaleDate", "lastSaleYear", "floodZone", "floodRisk",
  "listingStatus", "distressSignals", "taxDelinquent", "taxAmountCents", "taxesOwedCents", "mortgageBalanceCents",
  "annualRentalIncome", "lienAmountCents", "rentCents", "noiCents", "capRateBps", "occupancyRateBps",
]);

/** Strip known person-sensitive fields recursively; no claim of free-text PII detection. */
export function minimizeBusinessData(value: Record<string, unknown>): Record<string, unknown> {
  const scrub = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(scrub);
    if (!v || typeof v !== "object") return v;
    return Object.fromEntries(Object.entries(v).filter(([key]) => {
      const tokens = keyTokens(key);
      return !isFcraSensitiveKey(key) && !tokens.some((t) => /^(personal|mobile|home|residential|passport)$/.test(t));
    }).map(([key, inner]) => [key, scrub(inner)]));
  };
  return scrub(value) as Record<string, unknown>;
}

export function minimizeProperty(input: Property, policy: PiiPolicy = PROPERTY_PII): Property {
  const p = PropertySchema.parse(input);
  const extra = new Set(policy.propertyAttributes ?? []);
  p.attributes = Object.fromEntries(Object.entries(p.attributes).filter(([key]) =>
    (PROPERTY_FACTS.has(key) || extra.has(key)) && !isFcraSensitiveKey(key),
  ).map(([key, fact]) => [key, { ...fact, value: fact.value && typeof fact.value === "object"
    ? minimizeBusinessData(fact.value as Record<string, unknown>) : fact.value }]));
  return p;
}

export function minimizeResearch(out: ResearchOutput, policy: PiiPolicy): ResearchOutput {
  return {
    leads: out.leads.map((p) => LeadSchema.parse(p)),
    contacts: out.contacts.map((p) => ContactSchema.parse(p)),
    ...(policy.kind === "property-owner" ? {
      properties: (out.properties ?? []).map((p) => minimizeProperty(p, policy)),
      parties: (out.parties ?? []).map((p) => PartySchema.parse(p)),
      ownerships: (out.ownerships ?? []).map((p) => OwnershipSchema.parse(p)),
      entityLinks: (out.entityLinks ?? []).map((p) => EntityLinkSchema.parse(p)),
      contactPoints: (out.contactPoints ?? []).map((p) => ContactPointSchema.parse(p)),
    } : {}),
    ...(out.failures ? { failures: out.failures } : {}),
    ...(out.raw !== undefined ? { raw: out.raw } : {}),
  };
}

export function minimizeEnrichment(e: Enrichment): Enrichment {
  return { ...e, data: minimizeBusinessData(e.data) };
}
