/**
 * tests/profiles.test.ts — Epic 4.5: Report Profiles + multi-format rendering.
 *
 * Coverage:
 *   - Every starter profile loads + validates against ReportProfileSchema.
 *   - applyProfileToCampaignInput maps knobs correctly.
 *   - mergeProfileOverrides deep-merges without losing untouched fields.
 *   - renderMarkdown, renderCsv, renderJson produce non-empty output.
 *   - renderHtml wraps the markdown output in a valid HTML document.
 *   - render() dispatcher returns the right discriminant for every format.
 *   - deliver(..., "file", { dir }) writes a file to a tmp dir.
 *   - deliver(..., "console") returns an output string.
 */

import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import { SCHEMA_VERSION } from "../pipeline_core/models.js";
import { assertCampaignRun } from "../pipeline_core/validator.js";
import {
  loadProfile,
  applyProfileToCampaignInput,
  mergeProfileOverrides,
  ReportProfileSchema,
} from "../pipeline_core/profiles.js";
import { renderMarkdown } from "../pipeline_core/render/markdown.js";
import { renderCsv } from "../pipeline_core/render/csv.js";
import { renderJson } from "../pipeline_core/render/json.js";
import { renderHtml } from "../pipeline_core/render/html.js";
import { render } from "../pipeline_core/render/index.js";
import { deliver } from "../pipeline_core/render/deliver.js";

// ── Fixtures ────────────────────────────────────────────────────────────────

const now = "2026-06-16T00:00:00.000Z";

/** Minimal valid sample run, mirroring the pattern in core.test.ts. */
function sampleRun() {
  return assertCampaignRun({
    id: "profile-test-run",
    schemaVersion: SCHEMA_VERSION,
    icp: "B2B SaaS founders",
    domains: ["example.com", "acme.io"],
    provider: "anthropic",
    model: "claude-opus-4-8",
    status: "complete" as const,
    leads: [
      { domain: "example.com", companyName: "Example Corp", industry: "SaaS", size: "11-50", source: "apollo" },
      { domain: "acme.io", companyName: "Acme Inc", source: "clearbit" },
    ],
    contacts: [
      {
        name: "Alice Smith",
        leadDomain: "example.com",
        email: "alice@example.com",
        title: "CEO",
        source: "apollo",
      },
      {
        name: "Bob Jones",
        leadDomain: "acme.io",
        title: "CTO",
        source: "clearbit",
        linkedin: "https://linkedin.com/in/bobjones",
      },
    ],
    enrichments: [
      {
        subjectType: "lead",
        subjectKey: "example.com",
        provider: "crunchbase",
        funding: { lastRound: "Series A", totalRaisedUsd: 5_000_000 },
        data: {},
        fetchedAt: now,
      },
    ],
    messages: [
      {
        contactKey: "alice@example.com",
        channel: "email" as const,
        subject: "Your recent launch",
        body: "Hi Alice, I noticed Example Corp just shipped your new feature — it directly addresses the pain point our ICP talks about most. Worth a 15-min call?",
        cta: "Open to a quick call next week?",
        fitScore: 88,
        model: "claude-opus-4-8",
        promptVersion: "outreach.v1",
        createdAt: now,
      },
    ],
    costUsd: 0.000412,
    skippedConnectors: ["zoominfo"],
    createdAt: now,
    finishedAt: now,
  });
}

// Resolve the absolute path to the profiles/ dir from this file's location.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const profilesDir = join(__dirname, "..", "profiles");

// Tmp dirs created during tests, cleaned up in afterAll.
const tmpDirs: string[] = [];

afterAll(() => {
  for (const dir of tmpDirs) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

// ── Starter profile loading ──────────────────────────────────────────────────

describe("starter profiles — load + validate", () => {
  const PROFILES = [
    "tech-founder-cold-outreach.json",
    "agency-multi-client-digest.json",
    "account-research.json",
    "linkedin-warm-intro.json",
  ];

  for (const filename of PROFILES) {
    it(`${filename} loads and validates against ReportProfileSchema`, () => {
      const path = join(profilesDir, filename);
      const profile = loadProfile(path);
      // Double-check: safeParse the loaded object directly to confirm it round-trips.
      const result = ReportProfileSchema.safeParse(profile);
      expect(result.success).toBe(true);
      expect(profile.name.length).toBeGreaterThan(0);
      expect(profile.description.length).toBeGreaterThan(0);
      expect(profile.output.formats.length).toBeGreaterThan(0);
      expect(profile.delivery.targets.length).toBeGreaterThan(0);
    });
  }

  it("loadProfile throws on a missing file", () => {
    expect(() => loadProfile("/nonexistent/path/profile.json")).toThrow();
  });

  it("loadProfile throws on an invalid JSON profile", () => {
    // A profile missing the required `output` and `delivery` sections.
    const tmpDir = mkdtempSync(join(tmpdir(), "io-profile-"));
    tmpDirs.push(tmpDir);
    const badPath = join(tmpDir, "bad.json");
    const { writeFileSync } = require("node:fs");
    writeFileSync(badPath, JSON.stringify({ name: "Bad", description: "Missing output/delivery" }));
    expect(() => loadProfile(badPath)).toThrow(/invalid profile/);
  });
});

// ── applyProfileToCampaignInput ──────────────────────────────────────────────

describe("applyProfileToCampaignInput — knob mapping", () => {
  const base = { id: "r1", icp: "SaaS founders", domains: ["example.com"] };

  it("maps filtering.minScore to minScore", () => {
    const profile = loadProfile(join(profilesDir, "tech-founder-cold-outreach.json"));
    const overrides = applyProfileToCampaignInput(profile, base);
    expect(overrides.minScore).toBe(75);
  });

  it("maps outreach.channel to channel", () => {
    const profile = loadProfile(join(profilesDir, "linkedin-warm-intro.json"));
    const overrides = applyProfileToCampaignInput(profile, base);
    expect(overrides.channel).toBe("linkedin");
  });

  it("maps outreach.maxContactsPerLead to maxContactsPerLead", () => {
    const profile = loadProfile(join(profilesDir, "agency-multi-client-digest.json"));
    const overrides = applyProfileToCampaignInput(profile, base);
    expect(overrides.maxContactsPerLead).toBe(3);
  });

  it("synthesises styleOverride from tone + maxLength + templateNotes", () => {
    const profile = loadProfile(join(profilesDir, "tech-founder-cold-outreach.json"));
    const overrides = applyProfileToCampaignInput(profile, base);
    expect(typeof overrides.styleOverride).toBe("string");
    const so = overrides.styleOverride as string;
    // Should contain the tone and the maxLength constraint.
    expect(so).toContain("Direct, founder-to-founder");
    expect(so).toContain("600");
  });

  it("returns no styleOverride when outreach section is absent", () => {
    // account-research has no tone/maxLength/templateNotes in outreach.
    const profile = loadProfile(join(profilesDir, "account-research.json"));
    const overrides = applyProfileToCampaignInput(profile, base);
    expect(overrides.styleOverride).toBeUndefined();
  });

  it("maps channel to undefined when no channel is specified", () => {
    const profile = loadProfile(join(profilesDir, "account-research.json"));
    const overrides = applyProfileToCampaignInput(profile, base);
    expect(overrides.channel).toBeUndefined();
  });
});

// ── mergeProfileOverrides ────────────────────────────────────────────────────

describe("mergeProfileOverrides — NL patch path", () => {
  it("overrides a single field without wiping sibling fields", () => {
    const base = loadProfile(join(profilesDir, "tech-founder-cold-outreach.json"));
    const merged = mergeProfileOverrides(base, {
      filtering: { minScore: 60 },
    });
    expect(merged.filtering?.minScore).toBe(60);
    // Sibling fields should be preserved.
    expect(merged.filtering?.contactTitles).toEqual(base.filtering?.contactTitles);
  });

  it("overrides the channel while preserving other outreach fields", () => {
    const base = loadProfile(join(profilesDir, "tech-founder-cold-outreach.json"));
    const merged = mergeProfileOverrides(base, {
      outreach: { channel: "linkedin" },
    });
    expect(merged.outreach?.channel).toBe("linkedin");
    expect(merged.outreach?.tone).toBe(base.outreach?.tone);
    expect(merged.outreach?.maxLength).toBe(base.outreach?.maxLength);
  });

  it("overrides the name and description at the top level", () => {
    const base = loadProfile(join(profilesDir, "agency-multi-client-digest.json"));
    const merged = mergeProfileOverrides(base, {
      name: "Custom Agency Profile",
      description: "Adapted for a specific client.",
    });
    expect(merged.name).toBe("Custom Agency Profile");
    // Other sections should be untouched.
    expect(merged.output.formats).toEqual(base.output.formats);
  });

  it("throws on a merge that produces an invalid profile", () => {
    const base = loadProfile(join(profilesDir, "linkedin-warm-intro.json"));
    expect(() =>
      mergeProfileOverrides(base, {
        // Removing output by providing an empty formats array is invalid (min(1)).
        output: { formats: [] as never },
      }),
    ).toThrow(/invalid/);
  });
});

// ── Renderers ────────────────────────────────────────────────────────────────

describe("renderMarkdown", () => {
  it("produces non-empty markdown containing the run id", () => {
    const run = sampleRun();
    const md = renderMarkdown(run);
    expect(md.length).toBeGreaterThan(0);
    expect(md).toContain("profile-test-run");
  });

  it("includes all default sections when no profile is supplied", () => {
    const run = sampleRun();
    const md = renderMarkdown(run);
    expect(md).toContain("## Summary");
    expect(md).toContain("## Leads");
    expect(md).toContain("## Contacts");
    expect(md).toContain("## Drafted Messages");
    expect(md).toContain("## Cost");
  });

  it("respects structure.sections from a profile", () => {
    const run = sampleRun();
    const profile = loadProfile(join(profilesDir, "account-research.json"));
    const md = renderMarkdown(run, profile);
    // account-research has: summary, leads, contacts, cost — no messages.
    expect(md).toContain("## Summary");
    expect(md).toContain("## Leads");
    expect(md).toContain("## Contacts");
    expect(md).toContain("## Cost");
    expect(md).not.toContain("## Drafted Messages");
  });

  it("includes lead company names and contact names", () => {
    const run = sampleRun();
    const md = renderMarkdown(run);
    expect(md).toContain("Example Corp");
    expect(md).toContain("Alice Smith");
  });

  it("includes the drafted message body", () => {
    const run = sampleRun();
    const md = renderMarkdown(run);
    expect(md).toContain("Hi Alice");
  });

  it("includes the cost when present", () => {
    const run = sampleRun();
    const md = renderMarkdown(run);
    expect(md).toContain("0.000412");
  });
});

describe("renderCsv", () => {
  it("produces non-empty leads CSV with a header row", () => {
    const run = sampleRun();
    const csv = renderCsv(run, "leads");
    expect(csv.length).toBeGreaterThan(0);
    const lines = csv.split("\n");
    expect(lines[0]).toContain("domain");
    expect(lines[0]).toContain("companyName");
    // Two leads → header + 2 data rows.
    expect(lines.length).toBeGreaterThanOrEqual(3);
  });

  it("produces non-empty contacts CSV with a header row", () => {
    const run = sampleRun();
    const csv = renderCsv(run, "contacts");
    expect(csv.length).toBeGreaterThan(0);
    expect(csv).toContain("Alice Smith");
    expect(csv).toContain("Bob Jones");
  });

  it("produces non-empty messages CSV with a header row", () => {
    const run = sampleRun();
    const csv = renderCsv(run, "messages");
    expect(csv.length).toBeGreaterThan(0);
    const lines = csv.split("\n");
    expect(lines[0]).toContain("contactKey");
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });

  it("quotes fields that contain commas", () => {
    const run = sampleRun();
    // Description field in leads can contain commas; test with the contacts CSV
    // which has linkedin URLs (those contain slashes, not commas, but body might).
    const csv = renderCsv(run, "messages");
    // The body contains a comma — it must be quoted.
    expect(csv).toMatch(/"[^"]*,/);
  });
});

describe("renderJson", () => {
  it("produces non-empty JSON string", () => {
    const run = sampleRun();
    const json = renderJson(run);
    expect(json.length).toBeGreaterThan(0);
  });

  it("parses back to an object with the run id", () => {
    const run = sampleRun();
    const json = renderJson(run);
    const obj = JSON.parse(json) as { id: string };
    expect(obj.id).toBe("profile-test-run");
  });

  it("is pretty-printed (contains newlines)", () => {
    const run = sampleRun();
    const json = renderJson(run);
    expect(json).toContain("\n");
  });
});

describe("renderHtml", () => {
  it("produces non-empty HTML with a DOCTYPE", () => {
    const run = sampleRun();
    const html = renderHtml(run);
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain("<!DOCTYPE html>");
  });

  it("contains the run id in the <title>", () => {
    const run = sampleRun();
    const html = renderHtml(run);
    expect(html).toContain("profile-test-run");
  });

  it("contains an <h1> with the run id", () => {
    const run = sampleRun();
    const html = renderHtml(run);
    expect(html).toContain("<h1>");
    expect(html).toContain("profile-test-run");
  });
});

// ── render() dispatcher ──────────────────────────────────────────────────────

describe("render() dispatcher", () => {
  it("dispatches to markdown and returns format discriminant", () => {
    const run = sampleRun();
    const result = render(run, "markdown");
    expect(result.format).toBe("markdown");
    expect(typeof result.value).toBe("string");
    expect((result.value as string).length).toBeGreaterThan(0);
  });

  it("dispatches to csv and returns a CsvBundle", () => {
    const run = sampleRun();
    const result = render(run, "csv");
    expect(result.format).toBe("csv");
    if (result.format === "csv") {
      expect(typeof result.value.leads).toBe("string");
      expect(typeof result.value.contacts).toBe("string");
      expect(typeof result.value.messages).toBe("string");
    }
  });

  it("dispatches to json", () => {
    const run = sampleRun();
    const result = render(run, "json");
    expect(result.format).toBe("json");
    expect(typeof result.value).toBe("string");
  });

  it("dispatches to html", () => {
    const run = sampleRun();
    const result = render(run, "html");
    expect(result.format).toBe("html");
    if (result.format === "html") {
      expect(result.value).toContain("<!DOCTYPE html>");
    }
  });

  it("dispatches to pdf and returns a PdfProxy with markdown + note", () => {
    const run = sampleRun();
    const result = render(run, "pdf");
    expect(result.format).toBe("pdf");
    if (result.format === "pdf") {
      expect(result.value.markdown.length).toBeGreaterThan(0);
      expect(result.value.note).toContain("whiteglove-pdf");
    }
  });

  it("dispatches to slack and returns a SlackMessage", () => {
    const run = sampleRun();
    const result = render(run, "slack");
    expect(result.format).toBe("slack");
    if (result.format === "slack") {
      expect(typeof result.value.text).toBe("string");
      expect(result.value.text.length).toBeGreaterThan(0);
    }
  });

  it("dispatches to email-draft and returns an EmailDraft", () => {
    const run = sampleRun();
    const result = render(run, "email-draft");
    expect(result.format).toBe("email-draft");
    if (result.format === "email-draft") {
      expect(typeof result.value.subject).toBe("string");
      expect(result.value.body.length).toBeGreaterThan(0);
    }
  });
});

// ── deliver() ────────────────────────────────────────────────────────────────

describe("deliver()", () => {
  it('deliver(..., "console") returns an output string', () => {
    const run = sampleRun();
    const rendered = render(run, "markdown");
    const receipt = deliver(rendered, "console");
    expect(receipt.target).toBe("console");
    expect(typeof receipt.output).toBe("string");
    expect((receipt.output as string).length).toBeGreaterThan(0);
  });

  it('deliver(markdown, "file", { dir }) writes a .md file', () => {
    const dir = mkdtempSync(join(tmpdir(), "io-render-"));
    tmpDirs.push(dir);
    const run = sampleRun();
    const rendered = render(run, "markdown");
    const receipt = deliver(rendered, "file", { dir, basename: "test-report" });
    expect(receipt.target).toBe("file");
    expect(receipt.path).toBeDefined();
    expect(receipt.path).toMatch(/test-report\.md$/);
    expect(existsSync(receipt.path as string)).toBe(true);
  });

  it('deliver(json, "file", { dir }) writes a .json file', () => {
    const dir = mkdtempSync(join(tmpdir(), "io-render-"));
    tmpDirs.push(dir);
    const run = sampleRun();
    const rendered = render(run, "json");
    const receipt = deliver(rendered, "file", { dir, basename: "run-data" });
    expect(existsSync(receipt.path as string)).toBe(true);
    expect(receipt.path).toMatch(/\.json$/);
  });

  it('deliver(csv, "file", { dir }) writes a leads CSV file', () => {
    const dir = mkdtempSync(join(tmpdir(), "io-render-"));
    tmpDirs.push(dir);
    const run = sampleRun();
    const rendered = render(run, "csv");
    const receipt = deliver(rendered, "file", { dir, basename: "run-csv" });
    expect(existsSync(receipt.path as string)).toBe(true);
    expect(receipt.path).toMatch(/run-csv-leads\.csv$/);
  });

  it('deliver(html, "file", { dir }) writes an .html file', () => {
    const dir = mkdtempSync(join(tmpdir(), "io-render-"));
    tmpDirs.push(dir);
    const run = sampleRun();
    const rendered = render(run, "html");
    const receipt = deliver(rendered, "file", { dir, basename: "run-html" });
    expect(existsSync(receipt.path as string)).toBe(true);
    expect(receipt.path).toMatch(/\.html$/);
  });

  it('deliver(email-draft, "email-draft", { dir }) writes an .eml file', () => {
    const dir = mkdtempSync(join(tmpdir(), "io-render-"));
    tmpDirs.push(dir);
    const run = sampleRun();
    const rendered = render(run, "email-draft");
    const receipt = deliver(rendered, "email-draft", { dir, basename: "outreach-draft" });
    expect(receipt.target).toBe("email-draft");
    expect(existsSync(receipt.path as string)).toBe(true);
    expect(receipt.path).toMatch(/\.eml$/);
  });

  it('deliver(slack, "slack", { dir }) writes a slack-message JSON file', () => {
    const dir = mkdtempSync(join(tmpdir(), "io-render-"));
    tmpDirs.push(dir);
    const run = sampleRun();
    const rendered = render(run, "slack");
    const receipt = deliver(rendered, "slack", { dir, basename: "slack-msg" });
    expect(receipt.target).toBe("slack");
    expect(existsSync(receipt.path as string)).toBe(true);
    expect(receipt.path).toMatch(/slack-msg-slack\.json$/);
  });

  it('deliver(slack, "slack") without dir returns output string', () => {
    const run = sampleRun();
    const rendered = render(run, "slack");
    const receipt = deliver(rendered, "slack");
    expect(receipt.target).toBe("slack");
    expect(typeof receipt.output).toBe("string");
  });
});
