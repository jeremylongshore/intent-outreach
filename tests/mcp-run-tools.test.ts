/**
 * tests/mcp-run-tools.test.ts — Phase 8 MCP tools: list_runs, suppress, underwrite.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { handleListRuns, handleSuppress, handleUnderwrite } from "../mcp/tools.js";
import { SCHEMA_VERSION } from "../pipeline_core/models.js";
import { MemoryRunStore } from "../pipeline_core/store.js";
import { assertCampaignRun } from "../pipeline_core/validator.js";

const text = (r: { content: { text: string }[] }) => JSON.parse(r.content[0]!.text);
const run = (id: string, createdAt: string) =>
  assertCampaignRun({
    id,
    schemaVersion: SCHEMA_VERSION,
    icp: "x",
    domains: [],
    provider: "anthropic",
    model: "stub",
    status: "researched",
    createdAt,
    credits: { limit: 10, spent: 3, exhausted: false, byConnector: { x: 3 } },
  });

describe("list_runs", () => {
  it("orders by instant, not by string (fractional seconds)", async () => {
    const store = new MemoryRunStore();
    await store.saveRun(run("early", "2026-10-06T00:00:00Z"));
    await store.saveRun(run("late", "2026-10-06T00:00:00.500Z"));
    expect(text(await handleListRuns({ limit: 1 }, { store })).runs[0].id).toBe("late");
  });

  it("newest first, limited, with counts and credits", async () => {
    const store = new MemoryRunStore();
    await store.saveRun(run("old", "2026-10-01T00:00:00.000Z"));
    await store.saveRun(run("new", "2026-10-06T00:00:00.000Z"));
    const out = text(await handleListRuns({ limit: 1 }, { store }));
    expect(out.total).toBe(2);
    expect(out.runs).toEqual([
      expect.objectContaining({ id: "new", vertical: "b2b-sdr", status: "researched", messages: 0, credits: expect.any(Object) }),
    ]);
  });
});

describe("suppress", () => {
  const path = () => join(mkdtempSync(join(tmpdir(), "io-mcp-supp-")), "suppressions.jsonl");

  it("add (any kind) → list; the agent can never remove an opt-out", async () => {
    const p = path();
    expect(text(await handleSuppress({ action: "add", value: "(251) 555-0100", reason: "STOP" }, { path: p }))).toMatchObject({
      added: true,
      entry: { kind: "phone", value: "+12515550100" },
    });
    const removal = await handleSuppress({ action: "remove", value: "251-555-0100" }, { path: p });
    expect(removal.isError).toBe(true);
    expect(removal.content[0]?.text).toMatch(/suppress remove/);
    expect(text(await handleSuppress({ action: "list" }, { path: p }))).toHaveLength(1); // still suppressed
  });

  it("missing or malformed values are tool errors, nothing written", async () => {
    const p = path();
    expect((await handleSuppress({ action: "add" }, { path: p })).isError).toBe(true);
    expect((await handleSuppress({ action: "add", value: "acme.com", kind: "phone" }, { path: p })).isError).toBe(true);
    expect(text(await handleSuppress({ action: "list" }, { path: p }))).toEqual([]);
  });
});

describe("underwrite", () => {
  it("computes in code and returns the provenance envelope", () => {
    const r = text(
      handleUnderwrite({ calculation: "capRate", inputs: { noiCents: 71_400_00, priceCents: 1_100_000_00 } }),
    );
    expect(r).toMatchObject({ value: 649, inputs: { noiCents: 7_140_000 }, version: expect.any(String) });
  });

  it("the trade-up model needs explicit assumptions; bad input is a tool error", () => {
    const ok = text(
      handleUnderwrite({
        calculation: "tradeUp",
        inputs: { condoValueCents: 635_000_00, newHomePriceCents: 330_000_00 },
        assumptions: { sellCostBps: 750, loanRateBps: 675, loanTermYears: 30 },
      }),
    );
    expect(ok.value.netProceedsCents).toBe(587_375_00);
    expect(handleUnderwrite({ calculation: "tradeUp", inputs: { condoValueCents: 1 } }).isError).toBe(true);
    expect(handleUnderwrite({ calculation: "capRate", inputs: { noiCents: 1.5, priceCents: 1 } }).isError).toBe(true);
  });
});
