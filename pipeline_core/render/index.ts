/**
 * pipeline_core/render/index.ts — format dispatcher.
 *
 * `render(run, format, profile?)` is the single call-site for all rendering.
 * Every format is LOCAL — no network calls, no hosted services.
 *
 * Format → return value contract:
 *   markdown    → string (the canonical render)
 *   csv         → { leads: string, contacts: string, messages: string }
 *   json        → string (pretty-printed JSON)
 *   html        → string (self-contained HTML)
 *   pdf         → { markdown: string, note: string } — PDF is produced by
 *                 running /whiteglove-pdf on the markdown; no PDF dep here.
 *   slack       → SlackMessage { text: string, blocks?: SlackBlock[] }
 *   email-draft → EmailDraft { subject: string, body: string, to?: string }
 */

import type { Validated } from "../validator.js";
import type { CampaignRun } from "../models.js";
import type { ReportProfile, OutputFormat } from "../profiles.js";
import { renderMarkdown } from "./markdown.js";
import { renderCsv } from "./csv.js";
import { renderJson } from "./json.js";
import { renderHtml } from "./html.js";

// ── Return-type discriminated union ────────────────────────────────────────

export interface CsvBundle {
  leads: string;
  contacts: string;
  messages: string;
}

export interface PdfProxy {
  /** The markdown the /whiteglove-pdf skill should render. */
  markdown: string;
  /** Human-readable guidance string for the caller. */
  note: string;
}

export interface SlackBlock {
  type: string;
  text?: { type: string; text: string };
  [key: string]: unknown;
}

export interface SlackMessage {
  text: string;
  blocks?: SlackBlock[];
}

export interface EmailDraft {
  subject: string;
  /** Plain-text body derived from the markdown render. */
  body: string;
  /** Contact key of the first message, if any. */
  to?: string;
}

export type RenderResult =
  | { format: "markdown"; value: string }
  | { format: "csv"; value: CsvBundle }
  | { format: "json"; value: string }
  | { format: "html"; value: string }
  | { format: "pdf"; value: PdfProxy }
  | { format: "slack"; value: SlackMessage }
  | { format: "email-draft"; value: EmailDraft };

// ── Slack formatter ─────────────────────────────────────────────────────────

function toSlack(run: Validated<CampaignRun>): SlackMessage {
  const text = [
    `*Intent Outreach — ${run.id}*`,
    `ICP: ${run.icp} · Status: ${run.status}`,
    `Leads: ${run.leads.length} · Contacts: ${run.contacts.length} · Messages drafted: ${run.messages.length}`,
    run.costUsd !== undefined ? `Cost: $${run.costUsd.toFixed(6)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const blocks: SlackBlock[] = [
    {
      type: "section",
      text: { type: "mrkdwn", text },
    },
  ];

  if (run.messages.length > 0) {
    const preview = run.messages[0];
    if (preview) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*First draft → ${preview.contactKey}*\n${preview.body.slice(0, 200)}${preview.body.length > 200 ? "…" : ""}`,
        },
      });
    }
  }

  return { text, blocks };
}

// ── Email-draft formatter ───────────────────────────────────────────────────

function toEmailDraft(run: Validated<CampaignRun>, profile?: ReportProfile): EmailDraft {
  const md = renderMarkdown(run, profile);
  const firstMsg = run.messages[0];
  const subject = firstMsg?.subject ?? `Intent Outreach report — ${run.id}`;
  const to = firstMsg?.contactKey;
  return { subject, body: md, ...(to !== undefined ? { to } : {}) };
}

// ── Dispatcher ──────────────────────────────────────────────────────────────

/**
 * Render a validated CampaignRun to the requested format.
 *
 * All results are LOCAL — no network calls are made anywhere in this module.
 */
export function render(
  run: Validated<CampaignRun>,
  format: OutputFormat,
  profile?: ReportProfile,
): RenderResult {
  switch (format) {
    case "markdown":
      return { format: "markdown", value: renderMarkdown(run, profile) };

    case "csv":
      return {
        format: "csv",
        value: {
          leads: renderCsv(run, "leads"),
          contacts: renderCsv(run, "contacts"),
          messages: renderCsv(run, "messages"),
        },
      };

    case "json":
      return { format: "json", value: renderJson(run) };

    case "html":
      return { format: "html", value: renderHtml(run, profile) };

    case "pdf":
      return {
        format: "pdf",
        value: {
          markdown: renderMarkdown(run, profile),
          note:
            'PDF rendering requires the /whiteglove-pdf skill. ' +
            'Pass the `markdown` field to it as the source document.',
        },
      };

    case "slack":
      return { format: "slack", value: toSlack(run) };

    case "email-draft":
      return { format: "email-draft", value: toEmailDraft(run, profile) };
  }
}

// Re-export individual renderers for callers that want direct access.
export { renderMarkdown } from "./markdown.js";
export { renderCsv } from "./csv.js";
export { renderJson } from "./json.js";
export { renderHtml } from "./html.js";
