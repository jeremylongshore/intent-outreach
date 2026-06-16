/**
 * pipeline_core/render/markdown.ts — canonical markdown renderer.
 *
 * Markdown is the source-of-truth render for a CampaignRun.  All other formats
 * (html, slack, email-draft) derive from or mirror the same content.
 *
 * renderMarkdown respects `profile.structure.sections` to determine which
 * sections appear and in which order.  When no profile is supplied all sections
 * are emitted in the default order: summary, leads, contacts, messages, cost.
 *
 * No external dependencies — pure string construction.
 */

import type { Validated } from "../validator.js";
import type { CampaignRun } from "../models.js";
import type { ReportProfile } from "../profiles.js";

const DEFAULT_SECTIONS = ["summary", "leads", "contacts", "messages", "cost"] as const;

/** Escape pipe characters inside table cells. */
function esc(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function renderSummary(run: Validated<CampaignRun>): string {
  const rows: Array<[string, string]> = [
    ["Run ID", run.id],
    ["ICP", run.icp],
    ["Status", run.status],
    ["Domains", run.domains.join(", ")],
    ["Provider / Model", `${run.provider} / ${run.model}`],
    ["Leads found", String(run.leads.length)],
    ["Contacts found", String(run.contacts.length)],
    ["Messages drafted", String(run.messages.length)],
    ["Skipped connectors", run.skippedConnectors.length ? run.skippedConnectors.join(", ") : "none"],
    ["Created", run.createdAt],
    ...(run.finishedAt ? [["Finished", run.finishedAt] as [string, string]] : []),
  ];

  const lines = [
    "## Summary",
    "",
    "| Field | Value |",
    "| --- | --- |",
    ...rows.map(([k, v]) => `| ${esc(k)} | ${esc(v)} |`),
    "",
  ];
  return lines.join("\n");
}

function renderLeads(run: Validated<CampaignRun>): string {
  if (run.leads.length === 0) return "## Leads\n\n_No leads found._\n";
  const header = "| Domain | Company | Industry | Size | Description | Source |";
  const sep = "| --- | --- | --- | --- | --- | --- |";
  const rows = run.leads.map(
    (l) =>
      `| ${esc(l.domain)} | ${esc(l.companyName)} | ${esc(l.industry ?? "")} | ${esc(l.size ?? "")} | ${esc(l.description ?? "")} | ${esc(l.source)} |`,
  );
  return ["## Leads", "", header, sep, ...rows, ""].join("\n");
}

function renderContacts(run: Validated<CampaignRun>): string {
  if (run.contacts.length === 0) return "## Contacts\n\n_No contacts found._\n";
  const header = "| Name | Title | Email | LinkedIn | Company Domain | Source |";
  const sep = "| --- | --- | --- | --- | --- | --- |";
  const rows = run.contacts.map(
    (c) =>
      `| ${esc(c.name)} | ${esc(c.title ?? "")} | ${esc(c.email ?? "")} | ${esc(c.linkedin ?? "")} | ${esc(c.leadDomain)} | ${esc(c.source)} |`,
  );
  return ["## Contacts", "", header, sep, ...rows, ""].join("\n");
}

function renderMessages(run: Validated<CampaignRun>): string {
  if (run.messages.length === 0) return "## Drafted Messages\n\n_No messages drafted._\n";
  const parts = ["## Drafted Messages", ""];
  for (const msg of run.messages) {
    parts.push(`### ${esc(msg.contactKey)} — ${msg.channel}`);
    if (msg.subject) parts.push(`**Subject:** ${esc(msg.subject)}`, "");
    if (msg.fitScore !== undefined) parts.push(`**Fit score:** ${msg.fitScore}`, "");
    parts.push(msg.body, "", `**CTA:** ${esc(msg.cta)}`, "");
    parts.push(
      `_${msg.model} · ${msg.promptVersion} · ${msg.createdAt}_`,
      "",
      "---",
      "",
    );
  }
  return parts.join("\n");
}

function renderCost(run: Validated<CampaignRun>): string {
  const cost =
    run.costUsd !== undefined ? `$${run.costUsd.toFixed(6)}` : "_not metered_";
  return ["## Cost", "", `Total LLM spend: **${cost}**`, ""].join("\n");
}

/**
 * Render a validated CampaignRun to markdown.
 *
 * @param run     The validated run record.
 * @param profile Optional profile; `structure.sections` controls section order/selection.
 */
export function renderMarkdown(run: Validated<CampaignRun>, profile?: ReportProfile): string {
  const sections = profile?.structure?.sections ?? [...DEFAULT_SECTIONS];

  const title = `# Intent Outreach Report — ${run.id}\n`;

  const renderers: Record<string, () => string> = {
    summary: () => renderSummary(run),
    leads: () => renderLeads(run),
    contacts: () => renderContacts(run),
    messages: () => renderMessages(run),
    cost: () => renderCost(run),
  };

  const body = sections
    .map((s) => (renderers[s] ? renderers[s]() : `## ${s}\n\n_Custom section._\n`))
    .join("\n");

  return `${title}\n${body}`;
}
