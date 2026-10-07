import type { CampaignRun } from "./models.js";
import type { Validated } from "./validator.js";

/** Local data-minimization defaults, not a statement of vendor/legal permission. */
export const RUN_RETENTION_DAYS: Readonly<Record<string, number>> = Object.freeze({
  "b2b-sdr": 365,
  "residential-re": 30,
  "commercial-re": 30,
});

/** Expire the whole record at its earliest applicable deadline, including vendor facts. */
export function runExpiresAt(run: Validated<CampaignRun>, now: number): number {
  const created = Math.min(Date.parse(run.createdAt), now);
  const days = Object.hasOwn(RUN_RETENTION_DAYS, run.vertical) ? RUN_RETENTION_DAYS[run.vertical]! : 30;
  let expires = created + days * 86_400_000;
  // Facts can occur in arbitrary attribute bags. A license on an object without
  // its own fetchedAt (e.g. Party) uses the run's creation time conservatively.
  function visit(value: unknown): void {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { for (const item of value) visit(item); return; }
    const obj = value as Record<string, unknown>;
    const terms = obj.licenseTerms as Record<string, unknown> | undefined;
    if (terms && typeof terms.retentionDays === "number") {
      const days = terms.retentionDays;
      if (!Number.isSafeInteger(days) || days <= 0) throw new Error("Invalid vendor retention period");
      const fetched = typeof obj.fetchedAt === "string" ? Date.parse(obj.fetchedAt) : created;
      if (!Number.isFinite(fetched)) throw new Error("Invalid retention timestamp");
      expires = Math.min(expires, Math.min(fetched, created) + days * 86_400_000);
    }
    for (const item of Object.values(obj)) visit(item);
  }
  visit(run);
  return expires;
}
