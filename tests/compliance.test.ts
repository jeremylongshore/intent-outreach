/**
 * tests/compliance.test.ts — ported 1:1 from
 * coastal-realty-ops/tests/test_compliance.py.
 *
 * Every public symbol has at least one positive, one negative, and one edge
 * case. The DST + zip + malformed-input branches are explicit because the gate
 * is fail-closed: when a check is ambiguous, the answer must be "do not send".
 *
 * The Python suite uses naive datetimes meaning "already-localized to the
 * default tz". JS `Date` is always an instant, so each naive fixture is encoded
 * with the tz's UTC offset (May 2026 in Central = CDT = UTC-5) — converting the
 * instant back to the tz reproduces the intended wall-clock reading.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_TZ,
  DncList,
  QUIET_END,
  QUIET_START,
  defineServiceArea,
  dncScrub,
  inServiceArea,
  normalizePhone,
  withinQuietHours,
} from "../pipeline_core/compliance/index.js";
import { GULF_COAST_AL_FL, getServiceArea } from "../pipeline_core/packs/service-areas.js";

const SERVICE_AREA_ZIPS = GULF_COAST_AL_FL.zips;

// --- normalizePhone ------------------------------------------------------

describe("normalizePhone", () => {
  it.each([
    ["+12515550100", "+12515550100"],
    ["2515550100", "+12515550100"],
    ["12515550100", "+12515550100"],
    ["(251) 555-0100", "+12515550100"],
    ["251-555-0100", "+12515550100"],
    ["251.555.0100", "+12515550100"],
    ["  251 555 0100  ", "+12515550100"],
    ["+442071234567", "+442071234567"], // UK number — non-US E.164 still accepted
  ])("accepts %j -> %j", (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });

  it.each([
    "",
    "   ",
    "555-0100", // too short
    "abcdefghij", // not digits
    "+", // only the plus
    "+1", // nothing after country code
    "12345678901234567", // over 15 digits
    "+12345abc6789", // mixed
    "5551234567890", // 13 digits no plus, doesn't fit US shapes
  ])("rejects garbage %j", (bad) => {
    expect(() => normalizePhone(bad)).toThrow();
  });

  it("rejects non-string", () => {
    expect(() => normalizePhone(2515550100 as unknown as string)).toThrow();
  });
});

// --- DncList -------------------------------------------------------------

describe("DncList", () => {
  it("empty default", () => {
    const dnc = new DncList();
    expect(dnc.size).toBe(0);
    expect(dnc.has("+12515550100")).toBe(false);
  });

  it("normalizes on construction", () => {
    const dnc = new DncList(["(251) 555-0100", "2515550101"]);
    expect(dnc.size).toBe(2);
    expect(dnc.has("+12515550100")).toBe(true);
    expect(dnc.has("251-555-0100")).toBe(true); // different format, same number
    expect(dnc.has("+12515550101")).toBe(true);
    expect(dnc.has("+12515550199")).toBe(false);
  });

  it("dedupes", () => {
    const dnc = new DncList(["+12515550100", "(251) 555-0100", "251.555.0100"]);
    expect(dnc.size).toBe(1);
  });

  it("has() fails CLOSED on garbage (unknown number is treated as listed)", () => {
    const dnc = new DncList(["+12515550100"]);
    expect(dnc.has("not-a-phone")).toBe(true);
    expect(dnc.has("")).toBe(true);
    expect(dnc.has(undefined as unknown as string)).toBe(true);
    // An empty list still refuses what it cannot check.
    expect(new DncList().has("garbage")).toBe(true);
  });
});

// --- dncScrub ------------------------------------------------------------

describe("dncScrub", () => {
  it("clean", () => {
    const dnc = new DncList(["+12515550100"]);
    expect(dncScrub("+12515550199", dnc)).toBe("clean");
  });

  it("blocked", () => {
    const dnc = new DncList(["+12515550100"]);
    expect(dncScrub("+12515550100", dnc)).toBe("blocked");
  });

  it("normalizes input before lookup", () => {
    const dnc = new DncList(["+12515550100"]);
    expect(dncScrub("(251) 555-0100", dnc)).toBe("blocked");
  });

  it("fails closed on malformed input", () => {
    const dnc = new DncList(["+12515550100"]);
    // A garbage phone fails closed: "blocked" so the dispatcher refuses to send.
    expect(dncScrub("not-a-phone", dnc)).toBe("blocked");
    expect(dncScrub("", dnc)).toBe("blocked");
  });

  it("with empty list returns clean", () => {
    const dnc = new DncList();
    expect(dncScrub("+12515550100", dnc)).toBe("clean");
  });
});

// --- withinQuietHours ----------------------------------------------------

describe("withinQuietHours", () => {
  it("default tz is Central", () => {
    expect(DEFAULT_TZ).toBe("America/Chicago");
  });

  it.each([
    // "Naive" Central wall times, encoded with the CDT offset (-05:00).
    ["2026-05-02T08:00:00-05:00", true], // 8:00am — boundary, allowed
    ["2026-05-02T08:00:01-05:00", true],
    ["2026-05-02T07:59:59-05:00", false], // 7:59:59am — TCPA window not open yet
    ["2026-05-02T07:00:00-05:00", false], // 7:00am — the ported gate's old (wrong) start
    ["2026-05-02T12:00:00-05:00", true], // mid-day
    ["2026-05-02T20:59:59-05:00", true], // 8:59:59pm
    ["2026-05-02T21:00:00-05:00", false], // 9:00pm — boundary, not allowed
    ["2026-05-02T21:00:01-05:00", false],
    ["2026-05-02T23:30:00-05:00", false], // late night
    ["2026-05-02T00:00:00-05:00", false], // midnight
    ["2026-05-02T06:59:59-05:00", false], // 6:59:59am
  ])("naive %s -> %s", (iso, expected) => {
    expect(withinQuietHours(new Date(iso))).toBe(expected);
  });

  it("aware UTC -> Central evening (9pm exactly is OUT)", () => {
    // 2026-05-02 02:00 UTC = 2026-05-01 21:00 CDT.
    expect(withinQuietHours(new Date("2026-05-02T02:00:00Z"))).toBe(false);
  });

  it("aware UTC -> Central afternoon", () => {
    // 2026-05-02 18:00 UTC = 2026-05-02 13:00 CDT.
    expect(withinQuietHours(new Date("2026-05-02T18:00:00Z"))).toBe(true);
  });

  it("DST spring-forward day resolves to a real CDT wall time (pre-dawn -> false)", () => {
    // 2026-03-08 the clock springs 02:00 CST -> 03:00 CDT. 08:30 UTC is after the
    // transition (CDT, -05:00) = 03:30 CDT — deep pre-dawn, no outbound.
    expect(withinQuietHours(new Date("2026-03-08T08:30:00Z"))).toBe(false);
  });

  it("DST fall-back day, pre-8am -> false", () => {
    // 2026-11-01 falls back 02:00 CDT -> 01:00 CST. 06:30 UTC is still CDT (-05:00)
    // = 01:30 CDT — before 8am, no outbound.
    expect(withinQuietHours(new Date("2026-11-01T06:30:00Z"))).toBe(false);
  });

  it("honors a non-default tz: 8pm Eastern is inside the window", () => {
    // 8pm EDT = 7pm Central; both inside the window. Evaluated in Eastern.
    expect(
      withinQuietHours(new Date("2026-05-02T20:00:00-04:00"), "America/New_York"),
    ).toBe(true);
  });

  it("honors a non-default tz: 9:30pm Eastern is outside the window", () => {
    expect(
      withinQuietHours(new Date("2026-05-02T21:30:00-04:00"), "America/New_York"),
    ).toBe(false);
  });
});

// --- inServiceArea -------------------------------------------------------

describe("inServiceArea", () => {
  it("service-area set size is 11", () => {
    // 32507 covers both Perdido Key + west Pensacola, so dedup means 11 not 12.
    expect(SERVICE_AREA_ZIPS.size).toBe(11);
  });

  it.each([...SERVICE_AREA_ZIPS].sort())("accepts listed zip %s", (zip) => {
    expect(inServiceArea(zip, GULF_COAST_AL_FL)).toBe(true);
  });

  it("strips whitespace", () => {
    expect(inServiceArea("  36542 ", GULF_COAST_AL_FL)).toBe(true);
  });

  it.each([
    "00000", // not a real US zip, definitely not in scope
    "36526", // Daphne — north of I-10, out of scope
    "36532", // not in the listed set
    "32501", // central Pensacola — not in service area
    "10001", // NYC
    "90210", // Beverly Hills
  ])("rejects out-of-area zip %s", (zip) => {
    expect(inServiceArea(zip, GULF_COAST_AL_FL)).toBe(false);
  });

  it.each([
    "",
    "365",
    "365422",
    "36542-1234",
    "abcde",
    "365 4",
    "3654a",
  ])("rejects malformed %j", (bad) => {
    expect(inServiceArea(bad, GULF_COAST_AL_FL)).toBe(false);
  });

  it("rejects non-string", () => {
    expect(inServiceArea(36542 as unknown as string, GULF_COAST_AL_FL)).toBe(false);
    expect(inServiceArea(null as unknown as string, GULF_COAST_AL_FL)).toBe(false);
  });
});

describe("service area as pack data", () => {
  it("a different area changes the verdict without touching the gate", () => {
    const mobile = defineServiceArea("mobile-al", ["36602", "36695"]);
    expect(inServiceArea("36602", mobile)).toBe(true);
    expect(inServiceArea("36542", mobile)).toBe(false); // Gulf Shores is not in this area
    expect(inServiceArea("36602", GULF_COAST_AL_FL)).toBe(false);
  });

  it("a missing area fails closed", () => {
    expect(inServiceArea("36542", undefined as unknown as typeof GULF_COAST_AL_FL)).toBe(false);
    expect(inServiceArea("36542", { id: "x", zips: ["36542"] } as unknown as typeof GULF_COAST_AL_FL)).toBe(false);
  });

  it.each([
    ["", ["36542"]],
    ["empty", []],
    ["bad-zip", ["36542", "3654"]],
    ["zip-plus-4", ["36542-1234"]],
  ])("defineServiceArea rejects %j", (id, zips) => {
    expect(() => defineServiceArea(id, zips)).toThrow();
  });

  it("defineServiceArea trims, dedupes and freezes", () => {
    const area = defineServiceArea("t", [" 36542", "36542"]);
    expect([...area.zips]).toEqual(["36542"]);
    expect(Object.isFrozen(area)).toBe(true);
  });

  it("getServiceArea resolves built-ins and fails loud on an unknown id", () => {
    expect(getServiceArea("gulf-coast-al-fl")).toBe(GULF_COAST_AL_FL);
    expect(() => getServiceArea("nowhere")).toThrow(/unknown service area/);
  });
});

// --- module surface ------------------------------------------------------

describe("module surface", () => {
  it("exports expected quiet-hours constants", () => {
    expect(QUIET_START.hour).toBe(8);
    expect(QUIET_END.hour).toBe(21);
    expect(DEFAULT_TZ).toBe("America/Chicago");
  });
});
