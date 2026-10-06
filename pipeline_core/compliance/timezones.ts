/**
 * pipeline_core/compliance/timezones.ts — recipient-local contact windows (pure).
 *
 * TCPA (47 CFR 64.1200(c)(1)) allows telephone solicitation 8am–9pm in the
 * CALLED PARTY's local time. Florida's Telephone Solicitation Act (Fla. Stat.
 * 501.059(8)(a)) narrows that to 8am–8pm. A recipient's time zone is a guess
 * from two signals: the state of their mailing address and their phone's area
 * code. They can disagree (people keep numbers when they move), so this module
 * is deliberately conservative:
 *
 *   • every candidate zone from EITHER signal must be inside the window;
 *   • a signal that maps to more than one zone (Florida's 850 spans Central
 *     and Eastern) contributes all of them;
 *   • with no usable signal, every US zone is a candidate and the strictest
 *     known window (8am–8pm) applies: the most restrictive reading.
 *
 * The area-code table covers the Gulf Coast markets the packs work today.
 * An unlisted area code is treated as unknown (all zones), never guessed.
 */

const ET = "America/New_York";
const CT = "America/Chicago";
const MT = "America/Denver";
const AZ = "America/Phoenix";
const PT = "America/Los_Angeles";
const AK = "America/Anchorage";
const HT = "Pacific/Honolulu";
const PRT = "America/Puerto_Rico";

export const ALL_US_ZONES: readonly string[] = [ET, CT, MT, AZ, PT, AK, HT, PRT];

const STATE_ZONES: Readonly<Record<string, readonly string[]>> = {
  AL: [CT], AK: [AK, "America/Adak"], AZ: [AZ], AR: [CT], CA: [PT], CO: [MT], CT: [ET], DE: [ET], DC: [ET],
  FL: [ET, CT], GA: [ET], HI: [HT], ID: [MT, PT], IL: [CT], IN: [ET, CT], IA: [CT], KS: [CT, MT],
  KY: [ET, CT], LA: [CT], ME: [ET], MD: [ET], MA: [ET], MI: [ET, CT], MN: [CT], MS: [CT], MO: [CT],
  MT: [MT], NE: [CT, MT], NV: [PT], NH: [ET], NJ: [ET], NM: [MT], NY: [ET], NC: [ET], ND: [CT, MT],
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

/** Local-time windows: [startHour, endHour) in 24h. */
export const TCPA_WINDOW = { startHour: 8, endHour: 21 } as const;
const STATE_WINDOWS: Readonly<Record<string, { startHour: number; endHour: number }>> = {
  FL: { startHour: 8, endHour: 20 }, // Fla. Stat. 501.059(8)(a)
};
const STRICTEST_WINDOW = { startHour: 8, endHour: 20 } as const;

export interface RecipientLocation {
  /** 2-letter state of the recipient's mailing address, when known. */
  state?: string | undefined;
  /** The recipient's phone, E.164, when known. */
  phone?: string | undefined;
}

export interface WindowCheck {
  ok: boolean;
  zones: string[];
  window: { startHour: number; endHour: number };
  /** True when no usable location signal existed, so every US zone was checked. */
  unknownLocation: boolean;
}

function areaCodeOf(phone: string | undefined): string | undefined {
  const m = phone ? /^\+1(\d{3})\d{7}$/.exec(phone) : null;
  return m?.[1];
}

/** Hour and minute of `now` in `zone` (DST-correct via Intl). */
function localMinutes(now: Date, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour12: false, hour: "2-digit", minute: "2-digit" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  return (get("hour") % 24) * 60 + get("minute");
}

/**
 * Is `now` inside the contact window for this recipient? Checks every
 * candidate zone and applies the narrowest window of every candidate state.
 */
export function withinContactWindow(now: Date, recipient: RecipientLocation): WindowCheck {
  const zones = new Set<string>();
  const states = new Set<string>();
  const state = recipient.state?.trim().toUpperCase();
  if (state && STATE_ZONES[state]) {
    states.add(state);
    for (const z of STATE_ZONES[state]!) zones.add(z);
  }
  const area = AREA_CODES[areaCodeOf(recipient.phone) ?? ""];
  if (area) {
    states.add(area.state);
    for (const z of area.zones) zones.add(z);
  }
  const unknownLocation = zones.size === 0;
  let window: { startHour: number; endHour: number } = unknownLocation ? { ...STRICTEST_WINDOW } : { ...TCPA_WINDOW };
  for (const s of states) {
    const w = STATE_WINDOWS[s];
    if (w) window = { startHour: Math.max(window.startHour, w.startHour), endHour: Math.min(window.endHour, w.endHour) };
  }
  const candidates = unknownLocation ? [...ALL_US_ZONES] : [...zones];
  const ok = candidates.every((z) => {
    const m = localMinutes(now, z);
    return m >= window.startHour * 60 && m < window.endHour * 60;
  });
  return { ok, zones: candidates, window, unknownLocation };
}
