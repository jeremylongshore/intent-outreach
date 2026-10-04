import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// One version, declared once in package.json. Every other place a version is
// published (plugin manifest, marketplace entry, skill/agent frontmatter, the
// bundled MCP server's serverInfo) must agree, so a release can't ship drifted.
const root = join(import.meta.dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const version = JSON.parse(read("package.json")).version as string;

function frontmatterVersion(file: string): string | undefined {
  return /^version:\s*(\S+)\s*$/m.exec(read(file))?.[1];
}

describe("version is single-sourced from package.json", () => {
  it("is a SemVer string", () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("matches the plugin manifest and marketplace entry", () => {
    expect(JSON.parse(read(".claude-plugin/plugin.json")).version).toBe(version);
    const market = JSON.parse(read(".claude-plugin/marketplace.json"));
    const entry = market.plugins.find((p: { name: string }) => p.name === "intent-outreach");
    expect(entry?.version).toBe(version);
  });

  it("matches every skill and agent frontmatter version", () => {
    const files = [
      ...readdirSync(join(root, "skills")).map((d) => `skills/${d}/SKILL.md`),
      ...readdirSync(join(root, "agents"))
        .filter((f) => f.endsWith(".md"))
        .map((f) => `agents/${f}`),
    ];
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect([f, frontmatterVersion(f)]).toEqual([f, version]);
  });

  it("is injected into the committed MCP server bundle", () => {
    expect(read("bundle/server.mjs")).toContain(`var VERSION = true ? "${version}" : "dev";`);
  });

  it("has a matching CHANGELOG release heading", () => {
    const headings = read("CHANGELOG.md")
      .split("\n")
      .filter((line) => line.startsWith(`## [${version}] - `));
    expect(headings).toHaveLength(1);
    expect(headings[0]).toMatch(/^## \[\d+\.\d+\.\d+\] - \d{4}-\d{2}-\d{2}$/);
  });
});
