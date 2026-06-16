/**
 * tests/core.test.ts — Epic 1/2 invariants.
 *
 * Covers acceptance criteria 5 (validator gate) and 6 (deterministic connector
 * ordering) from 017-AT-DECR, plus the local store round-trip.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "../pipeline_core/models.js";
import { assertCampaignRun, validateMessage } from "../pipeline_core/validator.js";
import { JsonlRunStore, MemoryRunStore } from "../pipeline_core/store.js";
import { _resetSecretCache } from "../pipeline_core/secrets.js";
import {
  _resetBuiltins,
  getConfiguredConnectors,
  getSkippedConnectors,
  registerBuiltinConnectors,
} from "../pipeline_core/connectors/index.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const now = "2026-06-16T00:00:00.000Z";

function sampleRun(id = "run-1") {
  return {
    id,
    schemaVersion: SCHEMA_VERSION,
    icp: "B2B SaaS founders",
    domains: ["acme.com"],
    provider: "anthropic",
    model: "claude-opus-4-8",
    status: "complete" as const,
    leads: [{ domain: "acme.com", companyName: "Acme", source: "apollo" }],
    contacts: [{ name: "Jane Doe", leadDomain: "acme.com", source: "apollo" }],
    enrichments: [],
    messages: [
      {
        contactKey: "jane@acme.com",
        channel: "email" as const,
        body: "Hi Jane, noticed Acme just shipped X...",
        cta: "Open to a 15-min call next week?",
        model: "claude-opus-4-8",
        promptVersion: "outreach.v1",
        createdAt: now,
      },
    ],
    skippedConnectors: [],
    createdAt: now,
  };
}

describe("validator gate (acceptance #5)", () => {
  it("rejects model output missing the required body", () => {
    const r = validateMessage({ contactKey: "x", channel: "email", cta: "?", model: "m", promptVersion: "v", createdAt: now });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("Message");
  });

  it("accepts a well-formed message and brands it", () => {
    const r = validateMessage({
      contactKey: "jane@acme.com",
      channel: "email",
      body: "real body",
      cta: "book a call",
      model: "m",
      promptVersion: "outreach.v1",
      createdAt: now,
    });
    expect(r.ok).toBe(true);
  });

  it("assertCampaignRun throws on a structurally invalid run", () => {
    expect(() => assertCampaignRun({ id: "x" })).toThrow();
  });
});

describe("local RunStore round-trip", () => {
  it("MemoryRunStore stores and returns a validated run", async () => {
    const store = new MemoryRunStore();
    const run = assertCampaignRun(sampleRun());
    await store.saveRun(run);
    const back = await store.getRun("run-1");
    expect(back?.messages[0]?.body).toContain("noticed Acme");
    expect(await store.listRunIds()).toEqual(["run-1"]);
  });

  it("JsonlRunStore persists to a local file and re-validates on read", async () => {
    const dir = mkdtempSync(join(tmpdir(), "io-store-"));
    try {
      const store = new JsonlRunStore(join(dir, "runs.jsonl"));
      const run = assertCampaignRun(sampleRun("run-2"));
      await store.saveRun(run);
      const back = await store.getRun("run-2");
      expect(back?.id).toBe("run-2");
      expect(back?.schemaVersion).toBe(SCHEMA_VERSION);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("deterministic connector ordering (acceptance #6)", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    _resetBuiltins();
    _resetSecretCache();
    for (const k of Object.keys(process.env)) {
      if (k.endsWith("_API_KEY") || k === "ZOOMINFO_JWT" || k === "CLAY_WEBHOOK_URL") {
        delete process.env[k];
      }
    }
    registerBuiltinConnectors();
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("only configured connectors appear, in stable registration order", () => {
    process.env.APOLLO_API_KEY = "test";
    process.env.HUNTER_API_KEY = "test";
    const first = getConfiguredConnectors("research").map((c) => c.name);
    const second = getConfiguredConnectors("research").map((c) => c.name);
    expect(first).toEqual(second);
    expect(first).toEqual(["apollo", "hunter"]);
  });

  it("connectors without a key are silently skipped, not errored", () => {
    process.env.APOLLO_API_KEY = "test";
    const skipped = getSkippedConnectors("research").map((c) => c.name);
    expect(skipped).toContain("peopledatalabs");
    expect(skipped).toContain("exa");
    expect(getConfiguredConnectors("research").map((c) => c.name)).toEqual(["apollo"]);
  });

  it("nothing configured → empty list, never throws", () => {
    expect(getConfiguredConnectors("enrich")).toEqual([]);
  });
});
