/**
 * pipeline_core/packs/index.ts — registers every shipped pack.
 *
 * Mirrors connectors/index.ts: idempotent built-in registration the pipeline
 * calls before resolving a pack. Only `b2b-sdr` ships in this slice; residential-re
 * and commercial-re-prep register here when their deferred phases land.
 *
 * To add your own vertical: implement Pack (see b2b-sdr.ts), import it here and
 * call registerPack(...), or call registerPack() at runtime from your own code.
 */

import { getPack, registerPack, _clearPackRegistry } from "./registry.js";
import { b2bSdrPack } from "./b2b-sdr.js";

let registered = false;

/**
 * Idempotently register all shipped packs. An id the user already registered
 * (e.g. their own "b2b-sdr" override, wired before the first run) is never
 * overwritten — the built-in only fills ids nobody claimed.
 */
export function registerBuiltinPacks(): void {
  if (registered) return;
  for (const pack of [b2bSdrPack]) {
    if (getPack(pack.id) === undefined) registerPack(pack);
  }
  registered = true;
}

/** Clear the registry AND the idempotency flag. Tests only. */
export function _resetPacks(): void {
  registered = false;
  _clearPackRegistry();
}

export * from "./types.js";
export * from "./registry.js";
export { b2bSdrPack };
