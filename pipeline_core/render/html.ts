/**
 * pipeline_core/render/html.ts — self-contained HTML renderer.
 *
 * Derives from the markdown renderer — converts the markdown output to minimal
 * HTML.  No external markdown library; handles the subset that renderMarkdown
 * produces: ATX headings (h1–h3), GFM tables, bold (**text**), italic (_text_),
 * horizontal rules (---), and paragraphs.
 *
 * No external dependencies.
 */

import type { Validated } from "../validator.js";
import type { CampaignRun } from "../models.js";
import type { ReportProfile } from "../profiles.js";
import { renderMarkdown } from "./markdown.js";

/** Escape HTML special characters. */
function he(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Apply inline markdown to HTML: bold, italic, code. */
function inlineToHtml(s: string): string {
  return he(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/_(.+?)_/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}

/**
 * Convert the markdown produced by renderMarkdown() to minimal HTML.
 * Handles: h1/h2/h3, GFM tables, hr, and paragraphs with inline markup.
 */
function markdownToHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inTable = false;
  let tableHeaderDone = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";

    // ATX headings
    if (/^### /.test(line)) {
      if (inTable) { out.push("</tbody></table>"); inTable = false; tableHeaderDone = false; }
      out.push(`<h3>${inlineToHtml(line.slice(4))}</h3>`);
      continue;
    }
    if (/^## /.test(line)) {
      if (inTable) { out.push("</tbody></table>"); inTable = false; tableHeaderDone = false; }
      out.push(`<h2>${inlineToHtml(line.slice(3))}</h2>`);
      continue;
    }
    if (/^# /.test(line)) {
      if (inTable) { out.push("</tbody></table>"); inTable = false; tableHeaderDone = false; }
      out.push(`<h1>${inlineToHtml(line.slice(2))}</h1>`);
      continue;
    }

    // Horizontal rule (--- on its own line, not a table separator)
    if (/^---+$/.test(line.trim()) && !inTable) {
      out.push("<hr />");
      continue;
    }

    // GFM table rows: start with |
    if (line.startsWith("|")) {
      // Table separator row (| --- | --- |) — skip, already consumed as header
      if (/^\|[\s|:-]+\|$/.test(line) && inTable && !tableHeaderDone) {
        tableHeaderDone = true;
        continue;
      }

      const cells = line
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((c) => c.trim());

      if (!inTable) {
        out.push('<table><thead><tr>');
        out.push(cells.map((c) => `<th>${inlineToHtml(c)}</th>`).join(""));
        out.push("</tr></thead>");
        // peek ahead: next line should be separator
        const next = lines[i + 1] ?? "";
        if (/^\|[\s|:-]+\|$/.test(next)) {
          out.push("<tbody>");
          i++; // skip separator
          tableHeaderDone = true;
        } else {
          out.push("<tbody>");
          tableHeaderDone = true;
        }
        inTable = true;
        continue;
      }

      // Table separator after header (shouldn't reach here normally)
      if (/^\|[\s|:-]+\|$/.test(line)) continue;

      out.push("<tr>");
      out.push(cells.map((c) => `<td>${inlineToHtml(c)}</td>`).join(""));
      out.push("</tr>");
      continue;
    }

    // Close table if we were in one
    if (inTable) {
      out.push("</tbody></table>");
      inTable = false;
      tableHeaderDone = false;
    }

    // Blank line
    if (line.trim() === "") {
      continue;
    }

    // Paragraph
    out.push(`<p>${inlineToHtml(line)}</p>`);
  }

  if (inTable) out.push("</tbody></table>");

  return out.join("\n");
}

const CSS = `
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
         max-width: 960px; margin: 40px auto; padding: 0 24px; color: #1a1a2e; }
  h1 { font-size: 1.8em; border-bottom: 2px solid #4a90d9; padding-bottom: 8px; }
  h2 { font-size: 1.3em; margin-top: 2em; color: #2c3e50; }
  h3 { font-size: 1.1em; margin-top: 1.6em; color: #2c3e50; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 0.9em; }
  th { background: #4a90d9; color: #fff; padding: 8px 12px; text-align: left; }
  td { border: 1px solid #dde; padding: 6px 12px; }
  tr:nth-child(even) { background: #f5f7fa; }
  hr { border: none; border-top: 1px solid #dde; margin: 2em 0; }
  code { background: #f0f2f5; padding: 2px 4px; border-radius: 3px; font-size: 0.9em; }
  em { color: #666; }
`.trim();

/**
 * Render a validated CampaignRun to a self-contained HTML document.
 * Derives from renderMarkdown so content is always consistent.
 */
export function renderHtml(run: Validated<CampaignRun>, profile?: ReportProfile): string {
  const md = renderMarkdown(run, profile);
  const bodyHtml = markdownToHtml(md);

  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="UTF-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `  <title>Intent Outreach Report — ${run.id}</title>`,
    `  <style>${CSS}</style>`,
    "</head>",
    "<body>",
    bodyHtml,
    "</body>",
    "</html>",
  ].join("\n");
}
