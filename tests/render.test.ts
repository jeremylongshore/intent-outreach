/**
 * tests/render.test.ts — output-escaping guarantees for rendered reports.
 *
 * Every renderer receives connector data and model output, which are untrusted.
 * These tests feed hostile inputs through the real renderers and assert the
 * exact bytes that come out:
 *   - CSV: formula injection is neutralised (OWASP CSV Injection, CWE-1236).
 *   - .eml: header values cannot break out of their line (CWE-93), non-ASCII
 *     is RFC 2047-encoded, and To: is written only for a valid address.
 *   - HTML: run data in <title> (and the body) is entity-escaped (CWE-79).
 */

import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SCHEMA_VERSION } from "../pipeline_core/models.js";
import { assertCampaignRun } from "../pipeline_core/validator.js";
import { renderCsv } from "../pipeline_core/render/csv.js";
import { renderHtml } from "../pipeline_core/render/html.js";
import { render } from "../pipeline_core/render/index.js";
import { deliver } from "../pipeline_core/render/deliver.js";
import {
  encodeHeaderValue,
  isValidEmailAddress,
  stripHeaderControls,
  INVALID_RECIPIENT_NOTE,
} from "../pipeline_core/render/headers.js";

const now = "2026-06-16T00:00:00.000Z";
const tmpDirs: string[] = [];
afterAll(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});

interface Overrides {
  id?: string;
  subject?: string;
  contactKey?: string;
  companyName?: string;
}

function hostileRun(o: Overrides = {}) {
  return assertCampaignRun({
    id: o.id ?? "render-test-run",
    schemaVersion: SCHEMA_VERSION,
    icp: "B2B SaaS founders",
    domains: ["evil.test"],
    provider: "anthropic",
    model: "claude-opus-4-8",
    status: "complete" as const,
    leads: [
      {
        domain: "evil.test",
        companyName: o.companyName ?? '=HYPERLINK("http://evil.test","click")',
        industry: "+1",
        size: "-2+3",
        description: "@SUM(A1:A2)",
        source: "\t=cmd",
      },
      { domain: "ok.test", companyName: "Plain, Co", industry: "11-50 staff", source: "apollo" },
    ],
    contacts: [
      { name: "\r=1+1", leadDomain: "evil.test", email: "jane@acme.com", source: "apollo" },
    ],
    enrichments: [],
    messages: [
      {
        contactKey: o.contactKey ?? "jane@acme.com",
        channel: "email" as const,
        subject: o.subject ?? "Hello",
        body: "Hi Jane.",
        cta: "=cmd|' /C calc'!A0",
        fitScore: 88,
        model: "claude-opus-4-8",
        promptVersion: "outreach.v1",
        createdAt: now,
      },
    ],
    skippedConnectors: [],
    createdAt: now,
    finishedAt: now,
  });
}

function emlFor(run: ReturnType<typeof hostileRun>): string {
  const dir = mkdtempSync(join(tmpdir(), "io-render-esc-"));
  tmpDirs.push(dir);
  const receipt = deliver(render(run, "email-draft"), "email-draft", { dir, basename: "d" });
  return readFileSync(receipt.path as string, "utf8");
}

/** Header block of an .eml (everything before the first blank line). */
function headerBlock(eml: string): string {
  return eml.split("\n\n")[0] ?? "";
}

// ── CSV formula injection ───────────────────────────────────────────────────

describe("renderCsv — formula injection (OWASP CSV Injection)", () => {
  it("prefixes =, +, -, @ and TAB cells with a single quote and quotes them", () => {
    const lines = renderCsv(hostileRun(), "leads").split("\n");
    expect(lines[0]).toBe("domain,companyName,industry,size,description,source");
    expect(lines[1]).toBe(
      `evil.test,"'=HYPERLINK(""http://evil.test"",""click"")","'+1","'-2+3","'@SUM(A1:A2)","'\t=cmd"`,
    );
    // Benign strings: unprefixed; RFC 4180 quoting still applies to the comma.
    expect(lines[2]).toBe(`ok.test,"Plain, Co",11-50 staff,,,apollo`);
  });

  it("prefixes a cell that starts with CR", () => {
    const lines = renderCsv(hostileRun(), "contacts").split("\n");
    expect(lines[1]).toBe(`"'\r=1+1",evil.test,jane@acme.com,,,apollo`);
  });

  it("leaves genuine numbers emitted by our code (fitScore) unprefixed", () => {
    const lines = renderCsv(hostileRun(), "messages").split("\n");
    expect(lines[1]).toBe(
      `jane@acme.com,email,Hello,Hi Jane.,"'=cmd|' /C calc'!A0",88,claude-opus-4-8,outreach.v1,${now}`,
    );
  });

  it("prefixes a numeric-looking STRING from a connector (+1 / -5)", () => {
    const lines = renderCsv(hostileRun({ companyName: "-5" }), "leads").split("\n");
    expect(lines[1]?.startsWith(`evil.test,"'-5","'+1",`)).toBe(true);
  });
});

// ── Email header injection ──────────────────────────────────────────────────

describe("email-draft .eml — header injection and encoding", () => {
  it("strips CR/LF from a hostile subject so no Bcc header can be injected", () => {
    const eml = emlFor(hostileRun({ subject: "Quick question\r\nBcc: x@evil.test" }));
    const headers = headerBlock(eml).split("\n");
    expect(headers).toEqual([
      "To: jane@acme.com",
      "Subject: Quick question Bcc: x@evil.test",
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
    ]);
    expect(headers.some((h) => /^bcc:/i.test(h))).toBe(false);
  });

  it("strips a bare LF and a bare CR as well", () => {
    expect(stripHeaderControls("a\nBcc: x@evil.test")).toBe("a Bcc: x@evil.test");
    expect(stripHeaderControls("a\rBcc: x@evil.test")).toBe("a Bcc: x@evil.test");
    expect(stripHeaderControls("a\u0000b\u007Fc\td")).toBe("abc d");
  });

  it("RFC 2047 B-encodes a non-ASCII subject", () => {
    const eml = emlFor(hostileRun({ subject: "Café déjà vu — 你好" }));
    const headers = headerBlock(eml).split("\n");
    expect(headers[1]).toBe("Subject: =?UTF-8?B?Q2Fmw6kgZMOpasOgIHZ1IOKAlCDkvaDlpb0=?=");
  });

  it("splits a long non-ASCII value into ≤75-char encoded-words that decode back", () => {
    const original = "Ünïcödé " + "é".repeat(40);
    const encoded = encodeHeaderValue(original);
    const words = encoded.split("\n ");
    expect(words.length).toBe(3);
    let decoded = "";
    for (const w of words) {
      expect(w.length).toBeLessThanOrEqual(75);
      const m = /^=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=$/.exec(w);
      expect(m).not.toBeNull();
      decoded += Buffer.from(m?.[1] ?? "", "base64").toString("utf8");
    }
    expect(decoded).toBe(original);
  });

  it("omits To: and writes a note when contactKey is not a valid address", () => {
    const run = hostileRun({ contactKey: "Jane Doe@acme.com" });
    const result = render(run, "email-draft");
    expect(result.format).toBe("email-draft");
    if (result.format === "email-draft") {
      expect(result.value.to).toBeUndefined();
      expect(result.value.note).toBe(INVALID_RECIPIENT_NOTE);
    }
    const headers = headerBlock(emlFor(run)).split("\n");
    expect(headers).toEqual([
      `X-Intent-Outreach-Note: ${INVALID_RECIPIENT_NOTE}`,
      "Subject: Hello",
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
    ]);
  });

  it("re-validates To: in deliver() for a hand-built draft with a hostile recipient", () => {
    const dir = mkdtempSync(join(tmpdir(), "io-render-esc-"));
    tmpDirs.push(dir);
    const receipt = deliver(
      {
        format: "email-draft",
        value: { subject: "s", body: "b", to: "a@b.test\r\nBcc: x@evil.test" },
      },
      "email-draft",
      { dir, basename: "hand" },
    );
    const headers = headerBlock(readFileSync(receipt.path as string, "utf8")).split("\n");
    expect(headers[0]).toBe(`X-Intent-Outreach-Note: ${INVALID_RECIPIENT_NOTE}`);
    expect(headers.some((h) => /^(to|bcc):/i.test(h))).toBe(false);
  });

  it("console delivery also strips CR/LF from the subject and hides an invalid To", () => {
    const run = hostileRun({ contactKey: "Jane Doe@acme.com", subject: "Hi\r\nBcc: x@evil.test" });
    const out = deliver(render(run, "email-draft"), "console").output ?? "";
    expect(out.split("\n").slice(0, 2)).toEqual(["To: (none)", "Subject: Hi Bcc: x@evil.test"]);
  });

  it("isValidEmailAddress accepts real addresses and rejects fallbacks", () => {
    expect(isValidEmailAddress("jane@acme.com")).toBe(true);
    expect(isValidEmailAddress("first.last+tag@sub.acme.co")).toBe(true);
    expect(isValidEmailAddress("Jane Doe@acme.com")).toBe(false);
    expect(isValidEmailAddress("jane@acme")).toBe(false);
    expect(isValidEmailAddress("jane@acme.com\r\nBcc: x@evil.test")).toBe(false);
    expect(isValidEmailAddress("<jane@acme.com>")).toBe(false);
    expect(isValidEmailAddress(undefined)).toBe(false);
  });
});

// ── HTML escaping ───────────────────────────────────────────────────────────

describe("renderHtml — run data is entity-escaped", () => {
  it("escapes a hostile run.id inside <title>", () => {
    const html = renderHtml(hostileRun({ id: "</title><script>alert(1)</script>" }));
    expect(html).toContain(
      "<title>Intent Outreach Report — &lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;</title>",
    );
    expect(html).not.toContain("<script>");
  });

  it("escapes hostile company names in the body", () => {
    const html = renderHtml(hostileRun({ companyName: `<img src=x onerror='alert(1)'>` }));
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=&#39;alert(1)&#39;&gt;");
  });
});

describe("markdown table cell escaping", () => {
  it("escapes backslashes before pipes so a trailing backslash can't break the row", async () => {
    const { esc } = await import("../pipeline_core/render/markdown.js");
    expect(esc("a|b")).toBe("a\\|b");
    expect(esc("ends\\")).toBe("ends\\\\");
    expect(esc("x\\|y")).toBe("x\\\\\\|y");
    expect(esc("one\r\ntwo\nthree\rfour")).toBe("one two three four");
  });
});
