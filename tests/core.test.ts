/**
 * tests/core.test.ts — Epic 1/2 invariants.
 *
 * Covers acceptance criteria 5 (validator gate) and 6 (deterministic connector
 * ordering) from 017-AT-DECR, plus the local store round-trip.
 */

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { SCHEMA_VERSION } from "../pipeline_core/models.js";
import { assertCampaignRun, validateMessage } from "../pipeline_core/validator.js";
import { JsonlRunStore, MemoryRunStore } from "../pipeline_core/store.js";
import {
  _resetSecretCache,
  getSecret,
  hasSecret,
  isUnsetValue,
  localSecretsPath,
  MissingSecretError,
} from "../pipeline_core/secrets.js";
import {
  _resetBuiltins,
  getConfiguredConnectors,
  getSkippedConnectors,
  registerBuiltinConnectors,
} from "../pipeline_core/connectors/index.js";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

describe("secrets: placeholder/empty values are unset, getSecret and hasSecret agree", () => {
  const KEY = "IO_TEST_SECRET_KEY";
  const savedEnv = { ...process.env };
  let dir: string;
  let stderr: MockInstance<typeof process.stderr.write>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "io-secrets-"));
    process.env.INTENT_OUTREACH_SECRETS_FILE = join(dir, "secrets.json");
    delete process.env[KEY];
    _resetSecretCache();
    stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });
  afterEach(() => {
    stderr.mockRestore();
    process.env = { ...savedEnv };
    _resetSecretCache();
    rmSync(dir, { recursive: true, force: true });
  });

  const writeSecrets = (obj: unknown, mode = 0o600) => {
    const p = join(dir, "secrets.json");
    writeFileSync(p, JSON.stringify(obj));
    chmodSync(p, mode);
    _resetSecretCache();
  };

  for (const bad of ["", "   ", "${IO_TEST_SECRET_KEY}", "${user_config.apollo_key}"]) {
    it(`env value ${JSON.stringify(bad)} is treated as unset by both probes`, () => {
      process.env[KEY] = bad;
      expect(hasSecret(KEY)).toBe(false);
      expect(() => getSecret(KEY)).toThrow(MissingSecretError);
    });

    it(`file value ${JSON.stringify(bad)} is treated as unset by both probes`, () => {
      writeSecrets({ [KEY]: bad });
      expect(hasSecret(KEY)).toBe(false);
      expect(() => getSecret(KEY)).toThrow(MissingSecretError);
    });
  }

  for (const nonString of [123, true, { nested: "x" }, ["a"], null]) {
    it(`non-string file value ${JSON.stringify(nonString)} is unset for both probes`, () => {
      writeSecrets({ [KEY]: nonString });
      expect(hasSecret(KEY)).toBe(false);
      expect(() => getSecret(KEY)).toThrow(MissingSecretError);
    });
  }

  it("a placeholder env value falls through to a real file value", () => {
    process.env[KEY] = "${IO_TEST_SECRET_KEY}";
    writeSecrets({ [KEY]: "real-from-file" });
    expect(hasSecret(KEY)).toBe(true);
    expect(getSecret(KEY)).toBe("real-from-file");
  });

  it("isUnsetValue classifies values", () => {
    expect(isUnsetValue(undefined)).toBe(true);
    expect(isUnsetValue(" ${X} ")).toBe(true);
    expect(isUnsetValue("sk-live-123")).toBe(false);
    expect(isUnsetValue("pre${X}post")).toBe(false);
  });

  it("warns (without the value) on a group/other-readable secrets file", () => {
    writeSecrets({ [KEY]: "sk-very-secret" }, 0o644);
    expect(getSecret(KEY)).toBe("sk-very-secret");
    const out = stderr.mock.calls.map((c) => String(c[0])).join("");
    expect(out).toMatch(/readable by group\/other/);
    expect(out).not.toContain("sk-very-secret");
  });

  it("does not warn on an owner-only secrets file", () => {
    writeSecrets({ [KEY]: "sk-ok" }, 0o600);
    expect(getSecret(KEY)).toBe("sk-ok");
    expect(stderr).not.toHaveBeenCalled();
  });

  it("empty/placeholder INTENT_OUTREACH_SECRETS_FILE falls back to <home>/secrets.json", () => {
    process.env.INTENT_OUTREACH_SECRETS_FILE = "${INTENT_OUTREACH_SECRETS_FILE}";
    process.env.INTENT_OUTREACH_HOME = dir;
    expect(localSecretsPath()).toBe(join(dir, "secrets.json"));
    process.env.INTENT_OUTREACH_SECRETS_FILE = "";
    process.env.INTENT_OUTREACH_HOME = "  ";
    expect(localSecretsPath().endsWith(join(".intent-outreach", "secrets.json"))).toBe(true);
  });

  it("a relative secrets-file or home path is rejected loudly", () => {
    process.env.INTENT_OUTREACH_SECRETS_FILE = "secrets.json";
    expect(() => localSecretsPath()).toThrow(/absolute/);
    expect(() => hasSecret(KEY)).toThrow(/absolute/);
    delete process.env.INTENT_OUTREACH_SECRETS_FILE;
    process.env.INTENT_OUTREACH_HOME = "./rel";
    expect(() => localSecretsPath()).toThrow(/absolute/);
  });
});
