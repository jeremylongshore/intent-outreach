/**
 * tests/architecture.test.ts — the load-bearing invariants from CLAUDE.md, as executable tests.
 *
 * Replaces the grep guards that lived in policy.yml. Imports are extracted with a real parser
 * (esbuild's metafile — the TypeScript 7 native compiler ships no JS parsing API), so static
 * imports, `export ... from`, dynamic `import()` and `require()` are all seen, and strings or
 * comments that merely mention a package are not.
 */
import { buildSync } from "esbuild";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");
const abs = (p: string) => join(ROOT, p);

interface Edge {
  specifier: string;
  kind: string;
}

/** Runtime import edges of one TS source string (type-only imports are erased and do not count). */
function importsOfSource(contents: string, loader: "ts" | "js" = "ts"): Edge[] {
  const r = buildSync({
    stdin: { contents, loader, resolveDir: ROOT },
    bundle: false,
    write: false,
    metafile: true,
    format: "esm",
    platform: "node",
    outdir: "out",
    logLevel: "silent",
    tsconfigRaw: { compilerOptions: { verbatimModuleSyntax: true } },
  });
  return Object.values(r.metafile.outputs).flatMap((i) =>
    i.imports.map((e) => ({ specifier: e.path, kind: e.kind })),
  );
}

const importsOf = (file: string): Edge[] => importsOfSource(readFileSync(file, "utf8"));

function listTs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listTs(p));
    else if (p.endsWith(".ts") && !p.endsWith(".d.ts")) out.push(p);
  }
  return out.sort();
}

function resolveLocal(from: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(dirname(from), specifier);
  const candidates = [base.replace(/\.js$/, ".ts"), `${base}.ts`, join(base, "index.ts")];
  return candidates.find((c) => existsSync(c) && statSync(c).isFile()) ?? null;
}

/** Transitive closure: local files reached + every bare (package) specifier along the way. */
function closure(entry: string): { files: Set<string>; packages: Set<string> } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const stack = [entry];
  while (stack.length > 0) {
    const f = stack.pop() as string;
    if (files.has(f)) continue;
    files.add(f);
    for (const e of importsOf(f)) {
      const local = resolveLocal(f, e.specifier);
      if (local) stack.push(local);
      else if (!e.specifier.startsWith(".")) packages.add(e.specifier);
    }
  }
  return { files, packages };
}

const rel = (files: Iterable<string>) => [...files].map((f) => relative(ROOT, f)).sort();

/** Strip comments so prose that mentions a forbidden token does not trip a text rule. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

describe("importer sanity (the parser sees every import form)", () => {
  it("finds static, export-from, dynamic and require edges", () => {
    const edges = importsOfSource(
      [
        'import a from "pkg-static";',
        'export { b } from "pkg-reexport";',
        'export * from "pkg-star";',
        'const c = await import("pkg-dynamic");',
        'const d = require("pkg-require");',
        'import type { T } from "pkg-type-only";',
        'console.log(a, c, d); // import x from "pkg-in-comment"',
      ].join("\n"),
    );
    const bySpec = Object.fromEntries(edges.map((e) => [e.specifier, e.kind]));
    expect(bySpec["pkg-static"]).toBe("import-statement");
    expect(bySpec["pkg-reexport"]).toBe("import-statement");
    expect(bySpec["pkg-star"]).toBe("import-statement");
    expect(bySpec["pkg-dynamic"]).toBe("dynamic-import");
    expect(bySpec["pkg-require"]).toBe("require-call");
    expect(bySpec["pkg-type-only"]).toBeUndefined();
    expect(bySpec["pkg-in-comment"]).toBeUndefined();
  });
});

describe("invariant: storage is separated from the model layer", () => {
  for (const entry of ["pipeline_core/store.ts", "pipeline_core/validator.ts"]) {
    it(`${entry} transitively imports neither providers.ts, seam.ts, ai nor @ai-sdk/*`, () => {
      const { files, packages } = closure(abs(entry));
      const localFiles = rel(files);
      expect(localFiles).not.toContain("pipeline_core/providers.ts");
      expect(localFiles).not.toContain("pipeline_core/seam.ts");
      const bad = [...packages].filter((p) => p === "ai" || p.startsWith("ai/") || p.startsWith("@ai-sdk/"));
      expect(bad).toEqual([]);
    });
  }

  it("the closure walk is not vacuous (store.ts reaches validator.ts and secrets.ts)", () => {
    const localFiles = rel(closure(abs("pipeline_core/store.ts")).files);
    expect(localFiles).toContain("pipeline_core/validator.ts");
    expect(localFiles).toContain("pipeline_core/secrets.ts");
  });
});

describe("invariant: zero Google dependency in pipeline_core/ and mcp/", () => {
  const GOOGLE = /google|firebase|firestore|vertex|@google-cloud|secretmanager|aiplatform/i;
  const files = [...listTs(abs("pipeline_core")), ...listTs(abs("mcp"))];

  it("no import specifier mentions google/firebase/firestore/vertex/@google-cloud/secretmanager/aiplatform", () => {
    const offenders = files.flatMap((f) =>
      importsOf(f)
        .filter((e) => GOOGLE.test(e.specifier))
        .map((e) => `${relative(ROOT, f)} -> ${e.specifier} (${e.kind})`),
    );
    expect(offenders).toEqual([]);
  });

  it("retired Vertex Agent Engine / ADK references stay gone", () => {
    const re = /reasoningEngines|google\.adk|Agent Engine/;
    const offenders = files
      .filter((f) => re.test(stripComments(readFileSync(f, "utf8"))))
      .map((f) => relative(ROOT, f));
    expect(offenders).toEqual([]);
  });

  it("YAML agent definitions stay banned", () => {
    for (const dir of ["agents", "src/agents"]) {
      const p = abs(dir);
      if (!existsSync(p)) continue;
      const yaml = readdirSync(p, { recursive: true })
        .map(String)
        .filter((n) => /\.ya?ml$/.test(n));
      expect(yaml).toEqual([]);
    }
  });
});

describe("invariant: only validator.ts mints the Validated brand", () => {
  it("the brand type exists and storage requires Validated<CampaignRun>", () => {
    expect(readFileSync(abs("pipeline_core/validator.ts"), "utf8")).toMatch(/export type Validated/);
    expect(readFileSync(abs("pipeline_core/store.ts"), "utf8")).toMatch(/Validated<CampaignRun>/);
  });

  it("no `as Validated` / `as unknown as Validated` cast outside validator.ts (tests excluded)", () => {
    const targets = [
      ...listTs(abs("pipeline_core")),
      ...listTs(abs("mcp")),
      ...listTs(abs("evals")),
      abs("cli.ts"),
    ].filter((f) => !f.endsWith(join("pipeline_core", "validator.ts")));
    const cast = /\bas\s+(unknown\s+as\s+)?Validated\b/;
    const offenders = targets
      .filter((f) => cast.test(stripComments(readFileSync(f, "utf8"))))
      .map((f) => relative(ROOT, f));
    expect(offenders).toEqual([]);
  });
});

describe("invariant: no framework bloat", () => {
  it("package.json declares no LangChain / LlamaIndex / Genkit dependency", () => {
    const pkg = JSON.parse(readFileSync(abs("package.json"), "utf8")) as Record<
      string,
      Record<string, string> | undefined
    >;
    const names = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"].flatMap((k) =>
      Object.keys(pkg[k] ?? {}),
    );
    expect(names.filter((n) => /langchain|llamaindex|llama-index|genkit/i.test(n))).toEqual([]);
  });

  it("no source imports a heavyweight agent framework", () => {
    const files = [...listTs(abs("pipeline_core")), ...listTs(abs("mcp")), abs("cli.ts")];
    const offenders = files.flatMap((f) =>
      importsOf(f)
        .filter((e) => /langchain|llamaindex|llama_index|genkit/i.test(e.specifier))
        .map((e) => `${relative(ROOT, f)} -> ${e.specifier}`),
    );
    expect(offenders).toEqual([]);
  });
});

describe("invariant: connectors resolve credentials only through secrets.ts", () => {
  const re = /\bprocess\s*(\.\s*env\b|\[\s*["']env["']\s*\])|\{[^}]*\benv\b[^}]*\}\s*=\s*process\b/;

  it("the detector catches the forms it claims to", () => {
    for (const bad of ["process.env.X", "process . env", 'process["env"]', "const { env } = process;"]) {
      expect(re.test(bad)).toBe(true);
    }
    expect(re.test("getSecret(name)")).toBe(false);
  });

  it("no connector reads process.env directly", () => {
    const offenders = listTs(abs("pipeline_core/connectors"))
      .filter((f) => re.test(stripComments(readFileSync(f, "utf8"))))
      .map((f) => relative(ROOT, f));
    expect(offenders).toEqual([]);
  });
});
