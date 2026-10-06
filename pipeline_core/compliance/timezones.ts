/**
 * pipeline_core/compliance/timezones.ts — recipient-local contact windows (pure).
 *
 * TCPA (47 CFR 64.1200(c)(1)) allows telephone solicitation 8am–9pm in the
 * CALLED PARTY's local time. Several states are stricter: Florida (Fla. Stat.
 * 501.059(8)(a)) ends at 8pm, and as we understand them Louisiana and
 * Mississippi also end at 8pm and bar Sundays, and Texas starts at 9am. Rather
 * than encode each statute's fine print, every phone channel uses ONE
 * conservative window that sits inside all of them:
 *
 *     8am–8pm local, Monday–Saturday (Texas: from 9am)
 *
 * That gives up an hour against the federal rule and is NOT legal advice:
 * holidays are not modeled, and counsel review before SMS or call automation is
 * an open owner decision (000-docs/031).
 *
 * A recipient's time zone is a guess from two signals, the state of their
 * mailing address and their phone's area code, which can disagree (people keep
 * numbers when they move). So:
 *   • every candidate zone from EITHER signal must be inside the window;
 *   • a signal that maps to more than one zone contributes all of them;
 *   • an area code missing from the Gulf table, a non-US number, or no signal
 *     at all makes EVERY US zone a candidate. Nothing is guessed.
 */

const ET = "America/New_York";
const CT = "America/Chicago";
const MT = "America/Denver";
const AZ = "America/Phoenix";
const PT = "America/Los_Angeles";
const AK = "America/Anchorage";
const HT = "Pacific/Honolulu";
const PRT = "America/Puerto_Rico";

export const ALL_US_ZONES: readonly string[] = [ET, CT, MT, AZ, PT, AK, "America/Adak", HT, PRT];

const STATE_ZONES: Readonly<Record<string, readonly string[]>> = {
  AL: [CT], AK: [AK, "America/Adak"], AZ: [AZ, MT], // AZ: the Navajo Nation observes DST AR: [CT], CA: [PT], CO: [MT], CT: [ET], DE: [ET], DC: [ET],
  FL: [ET, CT], GA: [ET], HI: [HT], ID: [MT, PT], IL: [CT], IN: [ET, CT], IA: [CT], KS: [CT, MT],
  KY: [ET, CT], LA: [CT], ME: [ET], MD: [ET], MA: [ET], MI: [ET, CT], MN: [CT], MS: [CT], MO: [CT],
  MT: [MT], NE: [CT, MT], NV: [PT, MT], // NV: West Wendover is Mountain NH: [ET], NJ: [ET], NM: [MT], NY: [ET], NC: [ET], ND: [CT, MT],
  OH: [ET], OK: [CT], OR: [PT, MT], PA: [ET], RI: [ET], SC: [ET], SD: [CT, MT], TN: [ET, CT],
  TX: [CT, MT], UT: [MT], VT: [ET], VA: [ET], WA: [PT], WV: [ET], WI: [CT], WY: [MT], PR: [PRT],
};

// Gulf Coast area codes. A code that serves more than one zone lists all of them.
const AREA_CODES: Readonly<Record<string, { state: string; zones: readonly string[] }>> = {};
function codes(state: string, zones: readonly string[], list: string): void {
  for (const c of list.split(" ")) (AREA_CODES as Record<string, { state: string; zones: readonly string[] }>)[c] = { state, zones };
}
codes("AL", [CT], "205 251 256 334 659 938");
codes("FL", [ET], "239 305 321 324 352 386 407 561 645 656 689 727 728 754 772 786 813 863 904 941 954");
codes("FL", [ET, CT], "448 850");
codes("MS", [CT], "228 601 662 769");
codes("LA", [CT], "225 318 337 504 985");
codes("GA", [ET], "229 404 470 478 678 706 762 770 912 943");
codes("TN", [CT], "615 629 731 901");
codes("TN", [ET, CT], "423 865 931");

/** A local-time window: [startHour, endHour) in 24h, and whether Sundays are allowed. */
export interface ContactWindow {
  startHour: number;
  endHour: number;
  sundays: boolean;
}

/** The federal TCPA window, for reference. Phone channels use the stricter PHONE_WINDOW. */
export const TCPA_WINDOW: ContactWindow = Object.freeze({ startHour: 8, endHour: 21, sundays: true });
/** The conservative window every phone channel uses (see the header). */
export const PHONE_WINDOW: ContactWindow = Object.freeze({ startHour: 8, endHour: 20, sundays: false });
const STATE_STARTS: Readonly<Record<string, number>> = { TX: 9 };

export interface RecipientLocation {
  /** 2-letter state of the recipient's mailing address, when known. */
  state?: string | undefined;
  /** The recipient's phone, E.164, when known. */
  phone?: string | undefined;
}

export interface WindowCheck {
  ok: boolean;
  zones: string[];
  window: ContactWindow;
  /** True when some signal was missing or unrecognized, so every US zone was checked. */
  unknownLocation: boolean;
}

/** Day of week (0 = Sunday) and minutes past midnight of `now` in `zone` (DST-correct). */
function localTime(now: Date, zone: string): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour12: false,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { day, minutes: (Number(get("hour")) % 24) * 60 + Number(get("minute")) };
}

/**
 * Is `now` inside the phone contact window for this recipient? Checks every
 * candidate zone against PHONE_WINDOW, with any later state start applied.
 */
export function withinContactWindow(now: Date, recipient: RecipientLocation): WindowCheck {
  const zones = new Set<string>();
  const states = new Set<string>();
  let unknownLocation = false;

  const state = recipient.state?.trim().toUpperCase();
  if (state && STATE_ZONES[state]) {
    states.add(state);
    for (const z of STATE_ZONES[state]!) zones.add(z);
  } else if (state) {
    unknownLocation = true; // an unrecognized state is not a location
  }

  if (recipient.phone !== undefined) {
    const code = /^\+1(\d{3})\d{7}$/.exec(recipient.phone)?.[1];
    const area = code !== undefined ? AREA_CODES[code] : undefined;
    if (area) {
      states.add(area.state);
      for (const z of area.zones) zones.add(z);
    } else {
      unknownLocation = true; // unlisted code or non-US number: never guess
    }
  }

  if (zones.size === 0) unknownLocation = true;
  const candidates = unknownLocation ? [...new Set([...zones, ...ALL_US_ZONES])] : [...zones];
  const startHour = Math.max(PHONE_WINDOW.startHour, ...[...states].map((s) => STATE_STARTS[s] ?? 0));
  const window: ContactWindow = { ...PHONE_WINDOW, startHour };
  const ok = candidates.every((z) => {
    const t = localTime(now, z);
    if (t.day < 0) return false;
    if (!window.sundays && t.day === 0) return false;
    return t.minutes >= window.startHour * 60 && t.minutes < window.endHour * 60;
  });
  return { ok, zones: candidates, window, unknownLocation };
}
