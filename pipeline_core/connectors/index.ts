/**
 * pipeline_core/connectors/index.ts — registers every shipped connector.
 *
 * Registration ORDER is the deterministic call order (017-AT-DECR acceptance #6):
 * free tiers first, then paid, then legacy, then enterprise. The LLM never picks
 * the order — this file does. A connector self-skips if its key is absent, so the
 * effective sequence for a given user is "the configured subset, in this order."
 *
 * To add your own provider: write an adapter implementing Connector (see
 * apollo.ts), import it here, and call registerConnector(...) — or call
 * registerConnector() at runtime from your own code. No other core edits.
 */

import { getConnector, registerConnector, _clearRegistry } from "./registry.js";
import type { Connector } from "./types.js";
import { apolloConnector } from "./apollo.js";
import { hunterConnector } from "./hunter.js";
import { peopledatalabsConnector } from "./peopledatalabs.js";
import { exaConnector } from "./exa.js";
import { crunchbaseConnector } from "./crunchbase.js";
import { leadmagicConnector } from "./leadmagic.js";
import { clayConnector } from "./clay.js";
import { clearbitConnector } from "./clearbit.js";
import { zoominfoConnector } from "./zoominfo.js";

let registered = false;

/** The shipped connectors, in deterministic call order: free → paid → legacy → enterprise. */
const BUILTIN_CONNECTORS: readonly Connector[] = [
  // free
  apolloConnector,
  hunterConnector,
  peopledatalabsConnector,
  exaConnector,
  // paid
  crunchbaseConnector,
  leadmagicConnector,
  clayConnector,
  // legacy
  clearbitConnector,
  // enterprise
  zoominfoConnector,
];

/**
 * Idempotently register all shipped connectors in deterministic order.
 *
 * A name the user ALREADY registered (e.g. their own "apollo" adapter, wired
 * before the first run) is never overwritten: the built-in is skipped and the
 * user's connector keeps its slot. Built-ins only fill names nobody claimed.
 */
export function registerBuiltinConnectors(): void {
  if (registered) return;
  for (const connector of BUILTIN_CONNECTORS) {
    if (getConnector(connector.name) === undefined) registerConnector(connector);
  }
  registered = true;
}

/** Clear the registry AND the idempotency flag, then nothing. Tests only. */
export function _resetBuiltins(): void {
  registered = false;
  _clearRegistry();
}

export * from "./types.js";
export * from "./registry.js";
export {
  apolloConnector,
  hunterConnector,
  peopledatalabsConnector,
  exaConnector,
  crunchbaseConnector,
  leadmagicConnector,
  clayConnector,
  clearbitConnector,
  zoominfoConnector,
};
