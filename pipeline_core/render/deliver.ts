/**
 * pipeline_core/render/deliver.ts — local-only delivery for rendered output.
 *
 * ALL TARGETS ARE LOCAL.  No network calls, no cloud destinations.
 *
 * Target contract:
 *   console     — return the rendered string (caller may print it).
 *   file        — write to opts.dir (defaults to process.cwd()); returns path written.
 *   email-draft — write a .eml-ish draft file to opts.dir; returns path written.
 *   slack       — write a slack-message.json to opts.dir OR return the object string.
 *                 Does NOT send to Slack.
 *
 * `rendered` is the discriminated RenderResult from render/index.ts.
 * `target` is a DeliveryTarget.
 * Returns a DeliveryReceipt describing what was done.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DeliveryTarget } from "../profiles.js";
import type { RenderResult, SlackMessage, EmailDraft } from "./index.js";

export interface DeliveryReceipt {
  target: DeliveryTarget;
  /** For file/email-draft/slack file targets: the path written. */
  path?: string;
  /** For console/slack-string targets: the string returned. */
  output?: string;
}

/** Options accepted by deliver(). */
export interface DeliverOptions {
  /** Local directory for file-based targets. Defaults to process.cwd(). */
  dir?: string;
  /** Base filename (without extension) for file targets. Defaults to the run id when available. */
  basename?: string;
}

// ── helpers ─────────────────────────────────────────────────────────────────

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

function resolvedDir(opts: DeliverOptions): string {
  return opts.dir ?? process.cwd();
}

function resolvedBasename(opts: DeliverOptions): string {
  return opts.basename ?? "outreach-report";
}

// ── target handlers ──────────────────────────────────────────────────────────

function deliverConsole(rendered: RenderResult): DeliveryReceipt {
  let output: string;
  switch (rendered.format) {
    case "markdown":
    case "html":
    case "json":
      output = rendered.value;
      break;
    case "csv":
      output = [
        "=== Leads ===",
        rendered.value.leads,
        "",
        "=== Contacts ===",
        rendered.value.contacts,
        "",
        "=== Messages ===",
        rendered.value.messages,
      ].join("\n");
      break;
    case "pdf":
      output = rendered.value.note + "\n\n" + rendered.value.markdown;
      break;
    case "slack":
      output = rendered.value.text;
      break;
    case "email-draft":
      output = `To: ${rendered.value.to ?? "(none)"}\nSubject: ${rendered.value.subject}\n\n${rendered.value.body}`;
      break;
  }
  return { target: "console", output };
}

function deliverFile(
  rendered: RenderResult,
  opts: DeliverOptions,
): DeliveryReceipt {
  const dir = resolvedDir(opts);
  const base = resolvedBasename(opts);
  ensureDir(dir);

  switch (rendered.format) {
    case "markdown": {
      const path = join(dir, `${base}.md`);
      writeFileSync(path, rendered.value, "utf8");
      return { target: "file", path };
    }
    case "html": {
      const path = join(dir, `${base}.html`);
      writeFileSync(path, rendered.value, "utf8");
      return { target: "file", path };
    }
    case "json": {
      const path = join(dir, `${base}.json`);
      writeFileSync(path, rendered.value, "utf8");
      return { target: "file", path };
    }
    case "csv": {
      const leads = join(dir, `${base}-leads.csv`);
      const contacts = join(dir, `${base}-contacts.csv`);
      const messages = join(dir, `${base}-messages.csv`);
      writeFileSync(leads, rendered.value.leads, "utf8");
      writeFileSync(contacts, rendered.value.contacts, "utf8");
      writeFileSync(messages, rendered.value.messages, "utf8");
      // Return the leads path as the primary; caller can find the others by convention.
      return { target: "file", path: leads };
    }
    case "pdf": {
      // Write the markdown; caller runs /whiteglove-pdf on it.
      const path = join(dir, `${base}-for-pdf.md`);
      writeFileSync(path, rendered.value.markdown, "utf8");
      return { target: "file", path };
    }
    case "slack": {
      const path = join(dir, `${base}-slack.json`);
      writeFileSync(path, JSON.stringify(rendered.value, null, 2), "utf8");
      return { target: "file", path };
    }
    case "email-draft": {
      // Handled by the email-draft target below; redirect there.
      return deliverEmailDraft(rendered.value, opts);
    }
  }
}

function deliverEmailDraft(draft: EmailDraft, opts: DeliverOptions): DeliveryReceipt {
  const dir = resolvedDir(opts);
  const base = resolvedBasename(opts);
  ensureDir(dir);

  const path = join(dir, `${base}.eml`);
  const content = [
    `To: ${draft.to ?? ""}`,
    `Subject: ${draft.subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    draft.body,
  ].join("\n");
  writeFileSync(path, content, "utf8");
  return { target: "email-draft", path };
}

function deliverSlack(rendered: RenderResult, opts: DeliverOptions): DeliveryReceipt {
  // LOCAL ONLY — write a slack-message JSON file to dir, or return the string.
  // Does NOT send to Slack.
  const dir = resolvedDir(opts);
  const base = resolvedBasename(opts);

  let msg: SlackMessage;
  if (rendered.format === "slack") {
    msg = rendered.value;
  } else {
    // Wrap whatever we have into a minimal Slack message.
    const text = (() => {
      switch (rendered.format) {
        case "markdown":
        case "html":
        case "json":
          return rendered.value.slice(0, 3000);
        case "csv":
          return rendered.value.leads.slice(0, 3000);
        case "pdf":
          return rendered.value.note;
        case "email-draft":
          return `Subject: ${rendered.value.subject}\n${rendered.value.body.slice(0, 2000)}`;
      }
    })();
    msg = { text };
  }

  if (opts.dir !== undefined) {
    ensureDir(dir);
    const path = join(dir, `${base}-slack.json`);
    writeFileSync(path, JSON.stringify(msg, null, 2), "utf8");
    return { target: "slack", path };
  }

  return { target: "slack", output: JSON.stringify(msg, null, 2) };
}

// ── Main entry-point ─────────────────────────────────────────────────────────

/**
 * Deliver a rendered result to the specified target.
 *
 * @param rendered   The discriminated RenderResult from render().
 * @param target     Where to send the output ("console" | "file" | "email-draft" | "slack").
 * @param opts       Optional directory and basename for file-based targets.
 */
export function deliver(
  rendered: RenderResult,
  target: DeliveryTarget,
  opts: DeliverOptions = {},
): DeliveryReceipt {
  switch (target) {
    case "console":
      return deliverConsole(rendered);
    case "file":
      return deliverFile(rendered, opts);
    case "email-draft":
      if (rendered.format === "email-draft") {
        return deliverEmailDraft(rendered.value, opts);
      }
      // Fallback: write whatever we have to a .eml using the console string.
      return deliverEmailDraft(
        {
          subject: "Intent Outreach report",
          body: deliverConsole(rendered).output ?? "",
        },
        opts,
      );
    case "slack":
      return deliverSlack(rendered, opts);
  }
}
