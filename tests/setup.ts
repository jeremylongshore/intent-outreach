/**
 * tests/setup.ts — hermetic test environment (vitest setupFiles, runs per test file).
 *
 * Every test file gets: a fresh INTENT_OUTREACH_HOME tmpdir (so nothing can touch the real
 * ~/.intent-outreach), no ambient provider/connector credentials or webhook URLs, no secrets
 * file, and a global fetch that THROWS. Tests that need HTTP stub it themselves with
 * vi.stubGlobal("fetch", ...) (which overrides this default); a test that forgets fails loudly
 * instead of silently reaching the network.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, vi } from "vitest";

const SECRET_NAME = /(_API_KEY|_WEBHOOK_URL|_JWT|_TOKEN|_SECRET)$/;

for (const k of Object.keys(process.env)) {
  if (SECRET_NAME.test(k)) delete process.env[k];
}
delete process.env.INTENT_OUTREACH_SECRETS_FILE;
delete process.env.INTENT_OUTREACH_STORE_KEY_FILE;
delete process.env.ANTHROPIC_BASE_URL;
delete process.env.INTENT_OUTREACH_MODEL;
delete process.env.INTENT_OUTREACH_PROMPTS_DIR;
delete process.env.INTENT_OUTREACH_ALLOW_UNGATED;
// Keyless public-records connectors (fl-dor-parcels, fema-nfhl) would otherwise count as configured in
// every suite. Their own tests turn them back on explicitly.
process.env.INTENT_OUTREACH_PUBLIC_RECORDS = "0";

const home = mkdtempSync(join(tmpdir(), "io-test-home-"));
process.env.INTENT_OUTREACH_HOME = home;

vi.stubGlobal(
  "fetch",
  vi.fn(async (input: unknown) => {
    throw new Error(`unexpected network call in test: ${String((input as { url?: string })?.url ?? input)}`);
  }),
);

afterAll(() => {
  rmSync(home, { recursive: true, force: true });
});
