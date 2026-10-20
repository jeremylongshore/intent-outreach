# Repository Guidelines

## Project Structure & Module Organization

`pipeline_core/` contains validation, connectors, compliance, storage, and rendering;
`mcp/` exposes tools; `cli.ts` provides the CLI. Shared financial calculations live
in `packages/deal-math/`. `prompts/`, `profiles/`, `agents/`, and `skills/` configure
workflows. Tests and fixtures live in `tests/`; model evaluations in `evals/`.
`bundle/` contains committed distributables; `dist/` is build output. Public demos
live in `demos/`; project records in `000-docs/`.

## Build, Test, and Development Commands

Use Node.js 22.16+ and pnpm 10.8.1.

- `pnpm install --frozen-lockfile`: install pinned dependencies.
- `pnpm run mcp`: run the TypeScript MCP server locally.
- `pnpm run typecheck` / `pnpm run lint`: check types and Biome rules.
- `pnpm test`: run Vitest; `pnpm run test:watch`: watch tests.
- `pnpm run test:e2e`: exercise the shipped CLI and MCP server.
- `pnpm run bundle`: regenerate committed bundles after source changes.
- `pnpm run build`: compile to `dist/` and copy prompts.
- `pnpm exec tsx evals/run.ts --offline`: check deterministic evaluation wiring.

## Coding Style & Naming Conventions

Use strict TypeScript, ESM, two-space indentation, LF endings, and final newlines.
Match adjacent code: camelCase functions, PascalCase types, double quotes, semicolons,
and `.js` relative imports. Follow `.editorconfig`; Biome linting is enabled,
automatic formatting is disabled.

## Testing Guidelines

Name tests `tests/**/*.test.ts`; keep fixtures in `tests/fixtures/`. Cover behavior
changes and failure paths. `pnpm run test:coverage` enforces V8 minimums: statements
88%, branches 79%, functions 89%, lines 90%. Never lower thresholds. Offline evals
prove wiring, not model quality.

## Commit & Pull Request Guidelines

Branch from `main`; never commit directly to it. Use subjects such as
`docs: clarify contributor setup` or `fix(mcp): preserve contacts`. Follow the PR
template: explain behavior and rationale, link the `io-*` bead, report validation,
and preserve policy invariants. Architecture changes require sign-off; see
[CONTRIBUTING.md](CONTRIBUTING.md).

## Brand, Security & Agent Workflow

Start marketing work at [brand/README.md](brand/README.md). Keep project identity
and research local; global skills supply methods only. Never commit secrets or
personal data. Use an absolute scratch `INTENT_OUTREACH_HOME` for testing.

Use `bd prime`, claim work with `bd update <id> --claim`, and record durable memory
with `bd remember`; no Markdown task lists. Dolt is authoritative; JSONL is an export.
Use non-interactive shell commands and preserve unrelated work. Before handoff,
record follow-ups, run relevant checks, close finished beads, commit, synchronize
with `git pull --rebase` from a clean worktree, run `bd dolt push`, push the branch,
and verify remote status. Never discard others' stashes or bypass branch protection.
