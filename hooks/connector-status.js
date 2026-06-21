#!/usr/bin/env node
/**
 * Intent Outreach — SessionStart hook.
 *
 * Emits ONE concise line stating which data connectors are configured (have a
 * BYO key in the environment). Pure read of process.env; no I/O, no network.
 * A hook must never break a session, so this never throws and always exits 0.
 */
try {
  const KEYS = {
    apollo: "APOLLO_API_KEY",
    hunter: "HUNTER_API_KEY",
    peopledatalabs: "PDL_API_KEY",
    exa: "EXA_API_KEY",
    crunchbase: "CRUNCHBASE_API_KEY",
    leadmagic: "LEADMAGIC_API_KEY",
    clay: "CLAY_API_KEY",
    clearbit: "CLEARBIT_API_KEY",
    zoominfo: "ZOOMINFO_JWT",
  };
  const configured = Object.entries(KEYS)
    .filter(([, env]) => (process.env[env] ?? "").trim().length > 0)
    .map(([name]) => name);
  const total = Object.keys(KEYS).length;
  const msg = configured.length
    ? `Intent Outreach: ${configured.length}/${total} data connectors configured (${configured.join(", ")}).`
    : `Intent Outreach: 0/${total} data connectors configured — set provider keys (e.g. APOLLO_API_KEY, HUNTER_API_KEY; both have free tiers) to enable research/enrich.`;
  process.stdout.write(msg + "\n");
} catch {
  // Stay silent on any error — a hook must never break a session.
}
process.exit(0);
