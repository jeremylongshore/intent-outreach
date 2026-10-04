/**
 * Guard: the suite must never write the developer's real ~/.intent-outreach.
 * Snapshot its state before, compare after, fail the run if it changed.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function snapshot(): string {
  const dir = join(homedir(), ".intent-outreach");
  if (!existsSync(dir)) return "absent";
  const parts: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      const s = statSync(p);
      parts.push(`${p}:${s.size}:${s.mtimeMs}`);
      if (s.isDirectory()) walk(p);
    }
  };
  walk(dir);
  return parts.join("\n");
}

let before = "";
export function setup(): void {
  before = snapshot();
}
export function teardown(): void {
  if (snapshot() !== before) {
    throw new Error("test suite modified the real ~/.intent-outreach — a test is not isolated");
  }
}
