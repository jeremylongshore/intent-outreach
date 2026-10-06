/**
 * pipeline_core/packs/service-areas.ts — built-in service areas (pack data).
 *
 * A service area is the ZIP set an agent works. It is DATA a pack or profile
 * owns, evaluated by the pure `inServiceArea` gate in ../compliance. Add an area
 * here (or build one at runtime with `defineServiceArea`); never edit the gate.
 */

import { defineServiceArea, type ServiceArea } from "../compliance/index.js";

/**
 * Coastal Alabama + the western Florida panhandle, south of I-10. Source of
 * truth: coastal-realty-ops CLAUDE.md § "Service Geography". 32507 covers both
 * Perdido Key and west Pensacola, so the set holds 11 ZIPs, not 12.
 */
export const GULF_COAST_AL_FL: ServiceArea = defineServiceArea("gulf-coast-al-fl", [
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

const BUILTIN: ReadonlyMap<string, ServiceArea> = new Map([[GULF_COAST_AL_FL.id, GULF_COAST_AL_FL]]);

/** Look up a built-in service area by id. Throws on an unknown id (fail loud). */
export function getServiceArea(id: string): ServiceArea {
  const area = BUILTIN.get(id);
  if (!area) throw new Error(`unknown service area ${JSON.stringify(id)}; built-in: ${[...BUILTIN.keys()].join(", ")}`);
  return area;
}
