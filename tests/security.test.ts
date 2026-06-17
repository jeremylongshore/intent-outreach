/**
 * tests/security.test.ts — the secret-leak blocker (workflow finding #1).
 *
 * Proves that a failing keyed connector surfaces NO secret: not the Hunter
 * api_key (query-string), not the Clay webhook token (path/url). The fix is
 * redactUrl at the HttpError seam + sanitized raw in pipeline.ts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { redactUrl } from "../pipeline_core/http.js";
import { runResearch } from "../pipeline_core/pipeline.js";
import { _resetBuiltins, registerBuiltinConnectors } from "../pipeline_core/connectors/index.js";
import { _resetSecretCache } from "../pipeline_core/secrets.js";

function mockFetch(status: number) {
  return async () => ({ ok: false, status, text: async () => "error body" }) as unknown as Response;
}

describe("secret redaction (blocker)", () => {
  it("redactUrl masks secret query params, keeps the rest", () => {
    const out = redactUrl("https://api.hunter.io/v2/domain-search?domain=acme.com&api_key=SECRETKEY123");
    expect(out).not.toContain("SECRETKEY123");
    expect(out).toContain("REDACTED");
    expect(out).toContain("domain=acme.com");
  });

  describe("connector failures never leak keys", () => {
    const saved = { ...process.env };
    beforeEach(() => {
      _resetBuiltins();
      _resetSecretCache();
      for (const k of Object.keys(process.env)) {
        if (k.endsWith("_API_KEY") || k === "ZOOMINFO_JWT" || k === "CLAY_WEBHOOK_URL") delete process.env[k];
      }
      registerBuiltinConnectors();
    });
    afterEach(() => {
      process.env = { ...saved };
      vi.unstubAllGlobals();
    });

    it("a 401 from Hunter stores only a status — no api_key anywhere", async () => {
      process.env.HUNTER_API_KEY = "HUNTERSECRET_abc123xyz";
      vi.stubGlobal("fetch", mockFetch(401));
      const res = await runResearch("acme.com", "B2B SaaS founders");
      expect(JSON.stringify(res)).not.toContain("HUNTERSECRET_abc123xyz");
      expect(res.raw.hunter).toMatchObject({ failed: true, status: 401 });
      expect(res.skipped).toContain("hunter");
    });

    it("a Clay webhook failure never surfaces the webhook token", async () => {
      process.env.CLAY_API_KEY = "claykey";
      process.env.CLAY_WEBHOOK_URL = "https://hooks.clay.com/v1/CLAYTOKEN_secret999";
      vi.stubGlobal("fetch", mockFetch(403));
      const res = await runResearch("acme.com", "B2B SaaS founders");
      expect(JSON.stringify(res)).not.toContain("CLAYTOKEN_secret999");
    });
  });
});
