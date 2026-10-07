/** Every generated output must remain structurally equivalent to its canonical Zod inference. */
import type { z } from "zod";
import type { EngineContracts } from "../../contracts/engine.js";
import type { CONTRACT_SCHEMAS } from "../../scripts/export-contracts.js";

type Canonical = { [K in keyof typeof CONTRACT_SCHEMAS]: z.infer<(typeof CONTRACT_SCHEMAS)[K]> };
type Assert<T extends true> = T;
export type GeneratedToCanonical = Assert<EngineContracts extends Canonical ? true : false>;
export type CanonicalToGenerated = Assert<Canonical extends EngineContracts ? true : false>;

// The old dashboard's consent shape cannot stand in for canonical evidence.
// @ts-expect-error Contact, scope, method and exact text are required.
const incompleteConsent: EngineContracts["ConsentRecord"] = { recordedAt: "2026-01-01T00:00:00Z", textVersion: "v1", sourceUrl: "fixture" };
// @ts-expect-error The engine distinguishes listed from unknown; blocked is a legacy CRM display value.
const legacyDnc: EngineContracts["DncStatus"] = "blocked";
void incompleteConsent;
void legacyDnc;
