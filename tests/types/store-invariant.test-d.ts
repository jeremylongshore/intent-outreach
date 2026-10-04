// Compile-time proof of the load-bearing invariant: NO UN-VALIDATED MODEL OUTPUT REACHES STORAGE.
//
// Never executed. tsc --noEmit (npm run typecheck) compiles it; each expect-error below itself
// becomes a compile ERROR if the line underneath ever stops being one, so loosening saveRun's
// parameter type, or exporting the brand, fails CI rather than passing silently.
import type { CampaignRun } from "../../pipeline_core/models.js";
import type { JsonlRunStore, MemoryRunStore, RunStore } from "../../pipeline_core/store.js";
import { assertCampaignRun, type Validated } from "../../pipeline_core/validator.js";

declare const raw: CampaignRun;
declare const unknownFromModel: unknown;
declare const store: RunStore;
declare const jsonl: JsonlRunStore;
declare const memory: MemoryRunStore;

// Positive control: the gate's output is accepted, so the errors below are due to the brand alone.
export const ok = async (): Promise<void> => {
  await store.saveRun(assertCampaignRun(unknownFromModel));
  await jsonl.saveRun(assertCampaignRun(unknownFromModel));
  await memory.saveRun(assertCampaignRun(unknownFromModel));
};

export const rejected = async (): Promise<void> => {
  // @ts-expect-error a structurally valid but un-branded CampaignRun cannot be persisted
  await store.saveRun(raw);
  // @ts-expect-error same for the JSONL implementation
  await jsonl.saveRun(raw);
  // @ts-expect-error same for the in-memory implementation
  await memory.saveRun(raw);
  // @ts-expect-error raw model output (unknown) cannot be persisted
  await store.saveRun(unknownFromModel);
};


// A validated record is a read-only snapshot.
export const immutable = (v: Validated<CampaignRun>): void => {
  // @ts-expect-error validated records are deeply readonly
  v.messages = [];
};
