/**
 * pipeline_core/compliance/index.ts — DNC + TCPA quiet-hours + service-area gate.
 *
 * Ported 1:1 from coastal-realty-ops/src/orchestrator/compliance.py. This is the
 * hardest non-negotiable in the (deferred) residential-RE pack: an SMS to a cell
 * without consent is a $500–$1,500/violation TCPA exposure. Three checks ship
 * together because the dispatcher calls all three before any outbound leaves:
 *
 *   • dncScrub        — refuses numbers on an in-process DNC list.
 *   • withinQuietHours — TCPA quiet hours; outbound allowed 7am–9pm local only.
 *   • inServiceArea   — the agent works a fixed zip set; reject before enrichment
 *                       burns money.
 *
 * Design invariants (do not weaken):
 *   • FAIL-CLOSED. When a check is ambiguous, the answer is "do not send"
 *     ("blocked" / false). Malformed input never resolves to "clean".
 *   • PURE + CLOCK-INJECTED. `now` is an injected parameter — no Date.now()
 *     inside — so the gate is deterministic and the tests need only fixtures.
 *   • NO I/O, NO CLOUD, NO MODEL. A live DNC *lookup* belongs in a BYOK enrich
 *     connector (operator brings their own data source/key; self-skips when
 *     absent). This gate only evaluates a DncList it is handed; it never reaches
 *     out to anyone. That keeps it offline, key-free, and deterministic.
 */

/** Result of a DNC check. Fail-closed: malformed input resolves to "blocked". */
export type DncStatus = "clean" | "blocked";

// --- Service-area zip set ------------------------------------------------
//
// Source of truth: coastal CLAUDE.md § "Service Geography". South of I-10 only —
// Baldwin County coastal zips + Perdido Key + west Pensacola. Anything else is
// out-of-scope and must be rejected before enrichment.
export const SERVICE_AREA_ZIPS: ReadonlySet<string> = new Set([
  // Baldwin County, AL — coastal / south-of-I-10
  "36542", // Gulf Shores
  "36561", // Orange Beach
  "36535", // Foley
  "36567", // Robertsdale
  "36551", // Loxley
  "36527", // Spanish Fort
  "36533", // Fairhope
  "36530", // Elberta
  "36580", // Summerdale
  // Escambia County, FL — west Pensacola + Perdido Key
  "32507", // West Pensacola / Perdido Key
  "32506", // West Pensacola
]);

// --- TCPA quiet hours ----------------------------------------------------
//
// 7am–9pm in the recipient's local time. The window is closed at 7am and open at
// 9pm: 7:00:00 is allowed, 21:00:00 is not.
export const DEFAULT_TZ = "America/Chicago";
export const QUIET_START = { hour: 7, minute: 0 } as const; // 7:00am — allowed
export const QUIET_END = { hour: 21, minute: 0 } as const; // 9:00pm — NOT allowed

// --- DNC list ------------------------------------------------------------
//
// In-process DNC list. A production scrub (BYOK connector) can replace the source
// without changing this gate's signature — downstream never branches on it.
const E164_RE = /^\+\d{10,15}$/;

/**
 * Return the canonical E.164 form of `phone`.
 *
 * Strips spaces, dashes, dots, and parentheses. Adds `+1` for bare 10-digit US
 * numbers and `+` for 11-digit `1`-prefixed numbers. Throws for anything that
 * can't be coerced to E.164.
 */
export function normalizePhone(phone: string): string {
  if (typeof phone !== "string") {
    throw new Error("phone must be a string");
  }
  const stripped = phone.replace(/[\s\-.()]/g, "");
  if (!stripped) {
    throw new Error("phone is empty after normalization");
  }
  let candidate: string;
  if (stripped.startsWith("+")) {
    candidate = stripped;
  } else if (stripped.length === 10 && /^\d+$/.test(stripped)) {
    candidate = "+1" + stripped;
  } else if (
    stripped.length === 11 &&
    /^\d+$/.test(stripped) &&
    stripped.startsWith("1")
  ) {
    candidate = "+" + stripped;
  } else {
    throw new Error(`phone ${JSON.stringify(phone)} is not in a recognized US format`);
  }
  if (!E164_RE.test(candidate)) {
    throw new Error(`phone ${JSON.stringify(phone)} is not valid E.164`);
  }
  return candidate;
}

/**
 * Pluggable DNC registry.
 *
 * Construct with an iterable of phone numbers in any format `normalizePhone`
 * accepts; the list normalizes everything to E.164 at construction time so
 * lookups are O(1) and case/punctuation safe.
 */
export class DncList {
  private readonly phones = new Set<string>();

  constructor(phones: Iterable<string> = []) {
    for (const p of phones) {
      this.phones.add(normalizePhone(p));
    }
  }

  /** True if `phone` (in any accepted format) is on the list. Garbage → false. */
  has(phone: string): boolean {
    try {
      return this.phones.has(normalizePhone(phone));
    } catch {
      return false;
    }
  }

  get size(): number {
    return this.phones.size;
  }
}

/**
 * Return "blocked" if `phone` is on `dncList`, else "clean".
 *
 * Malformed phone numbers are treated as "blocked" — TCPA's design is
 * fail-closed: when in doubt, do not send.
 */
export function dncScrub(phone: string, dncList: DncList): DncStatus {
  let normalized: string;
  try {
    normalized = normalizePhone(phone);
  } catch {
    return "blocked";
  }
  return dncList.has(normalized) ? "blocked" : "clean";
}

/**
 * Return true if `now` falls inside the 7am–9pm outbound window in `tz`.
 *
 * `now` is an instant (a `Date`); it is converted to wall-clock time in `tz`
 * (DST-correct via `Intl.DateTimeFormat`). The window is closed at 7am and open
 * at 9pm: 7:00:00 is allowed, 21:00:00 is not. To express a "naive local"
 * fixture, encode the instant with the tz's UTC offset (e.g. a Central 7am is
 * `2026-05-02T07:00:00-05:00`).
 */
export function withinQuietHours(now: Date, tz: string = DEFAULT_TZ): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(now);
  const part = (type: string): number =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  // Some engines emit "24" for midnight under hour12:false — normalize to 0.
  const hour = part("hour") % 24;
  const secondsOfDay = hour * 3600 + part("minute") * 60 + part("second");
  const start = QUIET_START.hour * 3600 + QUIET_START.minute * 60;
  const end = QUIET_END.hour * 3600 + QUIET_END.minute * 60;
  return secondsOfDay >= start && secondsOfDay < end;
}

/**
 * Return true if `zipCode` is in {@link SERVICE_AREA_ZIPS}.
 *
 * Whitespace-tolerant. Anything not exactly 5 digits after trimming is rejected —
 * compliance must not depend on schema-side validation a future migration could
 * relax.
 */
export function inServiceArea(zipCode: string): boolean {
  if (typeof zipCode !== "string") {
    return false;
  }
  const cleaned = zipCode.trim();
  if (cleaned.length !== 5 || !/^\d+$/.test(cleaned)) {
    return false;
  }
  return SERVICE_AREA_ZIPS.has(cleaned);
}
