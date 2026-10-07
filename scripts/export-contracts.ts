/** Deterministic external contracts from canonical Zod output schemas; no provider or store I/O. */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "json-schema-to-typescript";
import { z } from "zod";
import {
  SCHEMAS, SCHEMA_VERSION, AddressSchema, ChannelSchema, DncStatusSchema, LicenseTermsSchema,
} from "../pipeline_core/models.js";
import { ConsentRecordSchema } from "../pipeline_core/compliance/consent.js";

export const CONTRACT_SCHEMAS = {
  ...SCHEMAS,
  Address: AddressSchema,
  Channel: ChannelSchema,
  DncStatus: DncStatusSchema,
  LicenseTerms: LicenseTermsSchema,
  ConsentRecord: ConsentRecordSchema,
};

const HEADER = `/**
 * GENERATED from intent-outreach Zod output schemas. Do not edit.
 * Regenerate: pnpm run contracts:generate
 * Static types do not enforce refinements, formats, retention, approvals or send eligibility.
 * Validate external JSON through the canonical engine before use.
 */`;

export async function generateContracts(): Promise<Record<string, string>> {
  const definitions = Object.fromEntries(Object.entries(CONTRACT_SCHEMAS).map(([name, schema]) => {
    const { $schema: _dialect, ...body } = z.toJSONSchema(schema, { target: "draft-7", io: "output" });
    return [name, { ...body, title: name }];
  }));
  const schema = {
    $schema: "http://json-schema.org/draft-07/schema#",
    title: "EngineContracts",
    description: "Structural output contracts only; canonical Zod refinements remain authoritative.",
    type: "object",
    properties: Object.fromEntries(Object.keys(definitions).map((name) => [name, { $ref: `#/definitions/${name}` }])),
    required: Object.keys(definitions),
    additionalProperties: false,
    definitions,
  };
  const schemaText = `${JSON.stringify(schema, null, 2)}\n`;
  const declarations = await compile(schema as Parameters<typeof compile>[0], "EngineContracts", {
    bannerComment: HEADER,
    unknownAny: true,
    additionalProperties: false,
    ignoreMinAndMaxItems: true,
    $refOptions: { resolve: { external: false } },
    style: { printWidth: 110, tabWidth: 2 },
  });
  const artifacts = { "engine.schema.json": schemaText, "engine.d.ts": declarations };
  return {
    ...artifacts,
    "manifest.json": `${JSON.stringify({
      version: 1,
      schemaVersion: SCHEMA_VERSION,
      artifacts: Object.fromEntries(Object.entries(artifacts).map(([name, content]) =>
        [name, createHash("sha256").update(content).digest("hex")])),
    }, null, 2)}\n`,
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length && args[0] !== "--check")) throw new Error("usage: export-contracts.ts [--check]");
  const directory = fileURLToPath(new URL("../contracts/", import.meta.url));
  const artifacts = await generateContracts();
  if (!args.length) await mkdir(directory, { recursive: true });
  for (const [name, content] of Object.entries(artifacts)) {
    const path = resolve(directory, name);
    if (args.length) {
      if (await readFile(path, "utf8").catch(() => null) !== content) {
        throw new Error(`contracts/${name} is stale; run pnpm run contracts:generate`);
      }
    } else await writeFile(path, content);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
