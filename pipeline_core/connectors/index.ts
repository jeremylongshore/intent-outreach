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

import { registerConnector, _clearRegistry } from "./registry.js";
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

/** Idempotently register all shipped connectors in deterministic order. */
export function registerBuiltinConnectors(): void {
  if (registered) return;
  // free
  registerConnector(apolloConnector);
  registerConnector(hunterConnector);
  registerConnector(peopledatalabsConnector);
  registerConnector(exaConnector);
  // paid
  registerConnector(crunchbaseConnector);
  registerConnector(leadmagicConnector);
  registerConnector(clayConnector);
  // legacy
  registerConnector(clearbitConnector);
  // enterprise
  registerConnector(zoominfoConnector);
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
