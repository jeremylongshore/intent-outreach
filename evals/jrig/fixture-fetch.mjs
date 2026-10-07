// Test-only preload for the UNMODIFIED shipped bundle. Never forwards network.
import { appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const home = process.env.INTENT_OUTREACH_HOME;
if (!home || process.env.HUNTER_API_KEY !== "jrig-offline-fixture") {
  throw new Error("fixture environment required");
}
writeFileSync(join(home, "mcp.pid"), String(process.pid), { mode: 0o600 });
globalThis.fetch = async (input) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  const valid = url.origin === "https://api.hunter.io" && url.searchParams.get("api_key") === "jrig-offline-fixture" && url.searchParams.get("domain") === "example.test";
  if (!valid) throw new Error("fixture refuses all unlisted network requests");
  let data;
  if (url.pathname === "/v2/domain-search") {
    data = { organization: "Example Fixture Labs", emails: [{ first_name: "Riley", last_name: "Example", position: "Founder" }] };
  } else if (url.pathname === "/v2/email-finder" && url.searchParams.get("full_name") === "Riley Example") {
    data = { email: "riley@example.test", score: 98 };
  } else {
    throw new Error("fixture endpoint or parameters not allowlisted");
  }
  appendFileSync(join(home, "fetches.jsonl"), JSON.stringify({ path: url.pathname }) + "\n", { mode: 0o600 });
  return new Response(JSON.stringify({ data }), { headers: { "content-type": "application/json" } });
};
