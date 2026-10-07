import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { generateContracts } from "../scripts/export-contracts.js";

describe("generated external engine contracts", () => {
  it("committed schemas, declarations and hashes match the canonical Zod schemas", async () => {
    const artifacts = await generateContracts();
    for (const [name, content] of Object.entries(artifacts)) {
      const path = fileURLToPath(new URL(`../contracts/${name}`, import.meta.url));
      expect(await readFile(path, "utf8"), `${name}: run pnpm run contracts:generate`).toBe(content);
    }
    expect(artifacts["engine.d.ts"]).not.toMatch(/\bimport\s|:\s*any\b/);
  });
});
