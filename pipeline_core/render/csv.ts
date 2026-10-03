/**
 * pipeline_core/render/csv.ts — CSV renderer for leads, contacts, and messages.
 *
 * Hand-rolled — no external CSV library dependency.  RFC 4180 compliant:
 * fields containing commas, double-quotes, or newlines are quoted, and embedded
 * double-quotes are doubled.  String cells beginning with a spreadsheet formula
 * trigger (= + - @ TAB CR) are neutralised with a leading single quote.
 */

import type { Validated } from "../validator.js";
import type { CampaignRun } from "../models.js";

/**
 * Characters that make a spreadsheet (Excel, LibreOffice, Google Sheets) treat
 * a cell as a formula.  OWASP "CSV Injection": = + - @ TAB CR.
 */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

/**
 * Encode one CSV field.
 *
 * Genuine numbers and booleans (typed fields our own code emits, e.g. fitScore)
 * are written verbatim — `-3` stays a number.  Every string (connector or LLM
 * data, which is untrusted) that starts with a formula trigger gets a leading
 * single quote and is always double-quoted, per OWASP CSV Injection guidance
 * (OWASP A03:2021 Injection, CWE-1236).  Otherwise RFC 4180 quoting applies:
 * quote if the value contains , " CR or LF; embedded quotes are doubled.
 */
function csvField(value: string | number | boolean | undefined | null): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const s = value;
  if (FORMULA_TRIGGER.test(s)) {
    return `"'${s.replace(/"/g, '""')}"`;
  }
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(fields: (string | number | boolean | undefined | null)[]): string {
  return fields.map(csvField).join(",");
}

function csvLeads(run: Validated<CampaignRun>): string {
  const header = csvRow(["domain", "companyName", "industry", "size", "description", "source"]);
  const rows = run.leads.map((l) =>
    csvRow([l.domain, l.companyName, l.industry, l.size, l.description, l.source]),
  );
  return [header, ...rows].join("\n");
}

function csvContacts(run: Validated<CampaignRun>): string {
  const header = csvRow(["name", "leadDomain", "email", "title", "linkedin", "source"]);
  const rows = run.contacts.map((c) =>
    csvRow([c.name, c.leadDomain, c.email, c.title, c.linkedin, c.source]),
  );
  return [header, ...rows].join("\n");
}

function csvMessages(run: Validated<CampaignRun>): string {
  const header = csvRow([
    "contactKey",
    "channel",
    "subject",
    "body",
    "cta",
    "fitScore",
    "model",
    "promptVersion",
    "createdAt",
  ]);
  const rows = run.messages.map((m) =>
    csvRow([
      m.contactKey,
      m.channel,
      m.subject,
      m.body,
      m.cta,
      m.fitScore,
      m.model,
      m.promptVersion,
      m.createdAt,
    ]),
  );
  return [header, ...rows].join("\n");
}

/**
 * Render a single entity type from the run as CSV.
 *
 * @param run   The validated run record.
 * @param which Which entity table to emit.
 */
export function renderCsv(
  run: Validated<CampaignRun>,
  which: "leads" | "contacts" | "messages",
): string {
  switch (which) {
    case "leads":
      return csvLeads(run);
    case "contacts":
      return csvContacts(run);
    case "messages":
      return csvMessages(run);
  }
}
