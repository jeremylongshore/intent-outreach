/**
 * tests/providers.test.ts — D4 "Claude-first, gate before run" invariants.
 *
 * Guards:
 *   - provider eval-gate (assertSupported fires BEFORE resolveModel/getSecret)
 *   - INTENT_OUTREACH_ALLOW_UNGATED bypass path
 *   - detectProvider() preference order (anthropic → openai → xai)
 *   - Google is gone entirely (owner decision): no provider name, no key lookup
 *   - listProviderStatus() reporting (configured + supported flags)
 *
 * No network calls — @ai-sdk/* constructors build a client object from the
 * supplied apiKey but never open a socket. Tests are purely synchronous from
 * the gate's perspective; resolveModel is async but instantaneous in CI.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { _resetSecretCache } from "../pipeline_core/secrets.js";
import {
  detectProvider,
  getProvider,
  listProviderStatus,
  supportsEffort,
  type ProviderName,
} from "../pipeline_core/providers.js";

// All provider key env-vars that might bleed between tests.
const PROVIDER_KEYS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  // Former Google key vars: kept here so a stray value proves they are ignored.
  "GEMINI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "XAI_API_KEY",
];
const GATE_VAR = "INTENT_OUTREACH_ALLOW_UNGATED";

/** Snapshot of the env-vars we touch, restored in afterEach. */
let savedEnv: Partial<Record<string, string>> = {};

beforeEach(() => {
  // Save current values (possibly undefined → omit from save to allow proper delete restore).
  savedEnv = {};
  for (const k of [...PROVIDER_KEYS, GATE_VAR]) {
    if (k in process.env) savedEnv[k] = process.env[k];
  }

  // Wipe them all so tests start from a known baseline.
  for (const k of [...PROVIDER_KEYS, GATE_VAR]) {
    delete process.env[k];
  }

  // Bust the secrets file-cache so stale lookups from a local secrets.json don't
  // contaminate results (important in dev environments where the file may exist).
  _resetSecretCache();
});

afterEach(() => {
  // Restore the env to exactly what it was before.
  for (const k of [...PROVIDER_KEYS, GATE_VAR]) {
    if (k in savedEnv) {
      process.env[k] = savedEnv[k];
    } else {
      delete process.env[k];
    }
  }
  _resetSecretCache();
});

// ---------------------------------------------------------------------------
// 1. eval-gate blocks unsupported providers BEFORE any key is needed
// ---------------------------------------------------------------------------
describe("eval-gate invariant", () => {
  it("openai is gated IN (passed the eval harness 2026-08-20) and resolves with a key", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const p = await getProvider({ provider: "openai" });
    expect(p.name).toBe("openai");
  });

  it('rejects getProvider({provider:"google"}): the adapter no longer exists', async () => {
    process.env.INTENT_OUTREACH_ALLOW_UNGATED = "1";
    process.env.GEMINI_API_KEY = "gemini-test-key";
    await expect(
      getProvider({ provider: "google" as unknown as ProviderName }),
    ).rejects.toThrow();
  });

  it('rejects getProvider({provider:"xai"}) with "eval gate" message before key resolution', async () => {
    // No XAI_API_KEY set — but the gate must fire before getSecret is reached.
    await expect(getProvider({ provider: "xai" })).rejects.toThrow(
      /eval gate/i,
    );
  });

  it("rejection happens before key resolution — xai throws eval gate even with a key present", async () => {
    process.env.XAI_API_KEY = "xai-test-key-present";
    await expect(getProvider({ provider: "xai" })).rejects.toThrow(
      /eval gate/i,
    );
  });
});

// ---------------------------------------------------------------------------
// 2. INTENT_OUTREACH_ALLOW_UNGATED=1 bypasses the gate
// ---------------------------------------------------------------------------
describe("ALLOW_UNGATED bypass", () => {
  beforeEach(() => {
    process.env.INTENT_OUTREACH_ALLOW_UNGATED = "1";
  });

  it("resolves getProvider({provider:'openai'}) with a dummy key", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const p = await getProvider({ provider: "openai" });
    expect(p.name).toBe("openai");
    expect(p.model).toBe("gpt-4o");
  });

  it("respects an explicit model override when gated-off", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const p = await getProvider({ provider: "openai", model: "gpt-3.5-turbo" });
    expect(p.name).toBe("openai");
    expect(p.model).toBe("gpt-3.5-turbo");
  });

  it("resolves getProvider({provider:'xai'}) with a dummy key", async () => {
    process.env.XAI_API_KEY = "xai-test-key";
    const p = await getProvider({ provider: "xai" });
    expect(p.name).toBe("xai");
    expect(p.model).toBe("grok-2-latest");
  });
});

// ---------------------------------------------------------------------------
// 3. anthropic — the one gated provider — resolves cleanly
// ---------------------------------------------------------------------------
describe("anthropic provider (in SUPPORTED_PROVIDERS)", () => {
  it("resolves with a dummy ANTHROPIC_API_KEY", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const p = await getProvider({ provider: "anthropic" });
    expect(p.name).toBe("anthropic");
    expect(p.model).toBe("claude-sonnet-4-6");
  });

  it("returned provider exposes .name and .model on the object", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const p = await getProvider({ provider: "anthropic" });
    expect(typeof p.name).toBe("string");
    expect(typeof p.model).toBe("string");
    expect(typeof p.generateObject).toBe("function");
  });

  it("explicit model option overrides the DEFAULT_MODEL", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const p = await getProvider({ provider: "anthropic", model: "claude-opus-4-5" });
    expect(p.model).toBe("claude-opus-4-5");
    expect(p.name).toBe("anthropic");
  });

  it("INTENT_OUTREACH_MODEL env overrides the default when no explicit model given", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.INTENT_OUTREACH_MODEL = "claude-haiku-3-5";
    const p = await getProvider({ provider: "anthropic" });
    expect(p.model).toBe("claude-haiku-3-5");
    delete process.env.INTENT_OUTREACH_MODEL;
  });

  it("explicit model option beats INTENT_OUTREACH_MODEL env", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.INTENT_OUTREACH_MODEL = "claude-haiku-3-5";
    const p = await getProvider({ provider: "anthropic", model: "claude-opus-4-5" });
    expect(p.model).toBe("claude-opus-4-5");
    delete process.env.INTENT_OUTREACH_MODEL;
  });
});

// ---------------------------------------------------------------------------
// 4. detectProvider() — Claude-first preference order
// ---------------------------------------------------------------------------
describe("detectProvider() preference order", () => {
  it("returns 'anthropic' when no keys are set (safe default)", () => {
    expect(detectProvider()).toBe("anthropic");
  });

  it("returns 'anthropic' when ANTHROPIC_API_KEY is set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    expect(detectProvider()).toBe("anthropic");
  });

  it("returns 'anthropic' when multiple keys are set (it wins as first in order)", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.OPENAI_API_KEY = "sk-openai-test";
    process.env.XAI_API_KEY = "xai-test";
    expect(detectProvider()).toBe("anthropic");
  });

  it("falls back to 'openai' when only OPENAI_API_KEY is present", () => {
    process.env.OPENAI_API_KEY = "sk-openai-test";
    expect(detectProvider()).toBe("openai");
  });

  it("falls back to 'xai' when only XAI_API_KEY is present", () => {
    process.env.XAI_API_KEY = "xai-test";
    expect(detectProvider()).toBe("xai");
  });

  it("ignores Google key vars entirely (falls back to the anthropic default)", () => {
    process.env.GEMINI_API_KEY = "gemini-test";
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "google-alt-test";
    expect(detectProvider()).toBe("anthropic");
  });

  it("openai beats xai (no anthropic key; Google vars ignored)", () => {
    process.env.OPENAI_API_KEY = "sk-openai-test";
    process.env.XAI_API_KEY = "xai-test";
    process.env.GEMINI_API_KEY = "gemini-test";
    expect(detectProvider()).toBe("openai");
  });

  it("xai wins when it is the only real key (Google vars ignored)", () => {
    process.env.XAI_API_KEY = "xai-test";
    process.env.GEMINI_API_KEY = "gemini-test";
    expect(detectProvider()).toBe("xai");
  });
});

// ---------------------------------------------------------------------------
// 5. listProviderStatus() — configured + supported flags
// ---------------------------------------------------------------------------
describe("listProviderStatus()", () => {
  it("returns an entry for each known provider", () => {
    const statuses = listProviderStatus();
    const names = statuses.map((s) => s.name);
    expect(names).toContain("anthropic");
    expect(names).toContain("openai");
    expect(names).toContain("xai");
    expect(names).not.toContain("google");
    expect(names).toEqual(["anthropic", "openai", "xai"]);
  });

  it("marks exactly the gated-in providers as supported: anthropic + openai", () => {
    const statuses = listProviderStatus();
    const supported = statuses.filter((s) => s.supported).map((s) => s.name);
    expect(supported.sort()).toEqual(["anthropic", "openai"]);
  });

  it("reports configured=false for all providers when no keys set", () => {
    const statuses = listProviderStatus();
    for (const s of statuses) {
      expect(s.configured).toBe(false);
    }
  });

  it("reports configured=true for anthropic when ANTHROPIC_API_KEY is set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const entry = listProviderStatus().find((s) => s.name === "anthropic")!;
    expect(entry.configured).toBe(true);
    expect(entry.supported).toBe(true);
  });

  it("reports configured=true AND supported=true for openai when OPENAI_API_KEY is set", () => {
    process.env.OPENAI_API_KEY = "sk-openai-test";
    const entry = listProviderStatus().find((s) => s.name === "openai")!;
    expect(entry.configured).toBe(true);
    expect(entry.supported).toBe(true);
  });

  it("no listed provider reads a Google key var", () => {
    for (const s of listProviderStatus()) {
      expect(s.keyEnvVars.join(",")).not.toMatch(/GEMINI|GOOGLE/);
    }
  });

  it("reports configured=true for xai when XAI_API_KEY is set", () => {
    process.env.XAI_API_KEY = "xai-test";
    const entry = listProviderStatus().find((s) => s.name === "xai")!;
    expect(entry.configured).toBe(true);
    expect(entry.supported).toBe(false);
  });

  it("exposes defaultModel for each entry", () => {
    const statuses = listProviderStatus();
    for (const s of statuses) {
      expect(typeof s.defaultModel).toBe("string");
      expect(s.defaultModel.length).toBeGreaterThan(0);
    }
  });

  it("anthropic defaultModel is 'claude-sonnet-4-6'", () => {
    const entry = listProviderStatus().find((s) => s.name === "anthropic")!;
    expect(entry.defaultModel).toBe("claude-sonnet-4-6");
  });

  it("exposes keyEnvVars array for each entry", () => {
    const statuses = listProviderStatus();
    for (const s of statuses) {
      expect(Array.isArray(s.keyEnvVars)).toBe(true);
      expect(s.keyEnvVars.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. supportsEffort(): effort is only sent where the API accepts it
// ---------------------------------------------------------------------------
describe("supportsEffort()", () => {
  it.each([
    "claude-sonnet-4-6",
    "claude-opus-4-5",
    "claude-opus-4-8",
    "claude-opus-5-5",
    "claude-sonnet-5-5",
    "claude-fable-5-1",
    "anthropic/claude-sonnet-5",
  ])("accepts %s", (id) => {
    expect(supportsEffort(id)).toBe(true);
  });

  it.each(["claude-haiku-4-5", "claude-sonnet-4-5", "claude-sonnet-4-0", "claude-opus-4-1", "claude-3-haiku-20240307"])(
    "rejects %s (the API would 400)",
    (id) => {
      expect(supportsEffort(id)).toBe(false);
    },
  );
});
