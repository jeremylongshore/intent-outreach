/**
 * pipeline_core/packs/registry.ts — deterministic pack registry.
 *
 * Mirrors connectors/registry.ts exactly: a Map (insertion-order), register/get,
 * plus `resolvePack` which applies the default. Users register their own vertical
 * with registerPack() — no core edits needed.
 */

import { DEFAULT_PACK_ID, type Pack } from "./types.js";

const REGISTRY = new Map<string, Pack>();

/** Register (or replace) a pack. Last registration of an id wins. */
export function registerPack(pack: Pack): void {
  REGISTRY.set(pack.id, pack);
}

/** Look up one pack by id. */
export function getPack(id: string): Pack | undefined {
  return REGISTRY.get(id);
}

/** All registered packs, in registration order. */
export function getPacks(): Pack[] {
  return [...REGISTRY.values()];
}

/**
 * Resolve the pack a run should use: the named one, or the default when unnamed.
 * Throws if a named pack isn't registered — a typo'd vertical must fail loud, not
 * silently fall back to b2b behavior.
 */
export function resolvePack(id?: string): Pack {
  const wanted = id ?? DEFAULT_PACK_ID;
  const pack = REGISTRY.get(wanted);
  if (!pack) {
    throw new Error(
      `pack not registered: ${wanted} (registered: ${[...REGISTRY.keys()].join(", ") || "none"})`,
    );
  }
  return pack;
}

/** Remove all packs. Tests only. */
export function _clearPackRegistry(): void {
  REGISTRY.clear();
}
