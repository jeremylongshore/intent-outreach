import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Agent checkouts live under .claude/ and must not be collected as duplicate copies of the suite.
    exclude: ["**/node_modules/**", ".claude/**", "bundle/**", "dist/**", "coverage/**", ".stryker-tmp/**"],
    setupFiles: ["tests/setup.ts"],
    globalSetup: ["tests/global-setup.ts"],
    // The concurrent-write store tests contend on a file lock; 5s is too tight on loaded runners.
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["pipeline_core/**/*.ts", "mcp/**/*.ts", "cli.ts"],
      reporter: ["text-summary", "lcov"],
      thresholds: { statements: 0, branches: 0, functions: 0, lines: 0 },
    },
  },
});
