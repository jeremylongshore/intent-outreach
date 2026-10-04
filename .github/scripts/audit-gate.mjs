#!/usr/bin/env node
// audit-gate.mjs — fail CI on high/critical production advisories that are not explicitly allowlisted.
//
// npm audit --audit-level=high alone cannot express "known and unreachable"; this wraps it with an
// allowlist (audit-allowlist.json next to the workflows) whose entries carry a reason and an expiry.
// Usage: node .github/scripts/audit-gate.mjs   (run from the repo root)
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const LEVELS = ["high", "critical"];
const allowFile = JSON.parse(readFileSync(".github/audit-allowlist.json", "utf8"));
const today = new Date().toISOString().slice(0, 10);
const allowed = new Map();
let bad = 0;
for (const e of allowFile.allow ?? []) {
  const ok = typeof e.id === "string" && e.id.startsWith("GHSA-") && e.reason && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(e.expires ?? "");
  if (!ok) {
    console.error("::error::malformed allowlist entry (need id GHSA-*, reason, expires YYYY-MM-DD): " + JSON.stringify(e));
    bad++;
    continue;
  }
  if (e.expires < today) {
    console.error("::error::allowlist entry " + e.id + " expired " + e.expires + ": re-verify it is still unreachable or fix the dependency");
    bad++;
    continue;
  }
  allowed.set(e.id, e);
}

const r = spawnSync("npm", ["audit", "--omit=dev", "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
let report;
try {
  report = JSON.parse(r.stdout);
} catch {
  console.error("::error::npm audit did not return JSON:\n" + r.stdout + r.stderr);
  process.exit(1);
}
if (report.error) {
  console.error("::error::npm audit failed: " + JSON.stringify(report.error));
  process.exit(1);
}

const findings = [];
for (const [name, v] of Object.entries(report.vulnerabilities ?? {})) {
  for (const via of v.via ?? []) {
    if (typeof via !== "object" || !LEVELS.includes(via.severity)) continue;
    const id = (via.url ?? "").split("/").pop();
    findings.push({ pkg: name, id, severity: via.severity, title: via.title });
  }
}

const unallowed = findings.filter((f) => !allowed.has(f.id));
for (const f of findings.filter((x) => allowed.has(x.id))) {
  console.log("allowlisted: " + f.id + " (" + f.pkg + "): " + allowed.get(f.id).reason);
}
for (const f of unallowed) console.error("::error::" + f.severity + " advisory " + f.id + " in " + f.pkg + ": " + f.title);
if (unallowed.length > 0 || bad > 0) process.exit(1);
console.log("audit gate: no un-allowlisted high/critical production advisories (" + findings.length + " seen, " + allowed.size + " allowlisted).");
