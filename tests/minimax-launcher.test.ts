/** Run secret-routing checks through the existing, hash-pinned test lane. */
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("MiniMax SOPS launcher", () => {
  it("keeps credentials in memory, refuses wrong selectors and removes the retired route", () => {
    const result = spawnSync("python3", ["-m", "unittest", "discover", "-s", "tests", "-p", "test_minimax_launcher.py"], {
      cwd: new URL("..", import.meta.url), encoding: "utf8", timeout: 15000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain("OK");
  });
});
