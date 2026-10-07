# Workspace packages

The repository uses pnpm 10.8.1, pinned by the root `packageManager` field.
Install that version, then run `pnpm install --frozen-lockfile` from the root.
`pnpm-workspace.yaml` includes every package directly under `packages/`.
Commit `pnpm-lock.yaml` after intentional dependency changes; CI installs it frozen.

The engine, CLI, MCP server, skills and committed bundles stay at the repository
root. The plugin manifest and `CLAUDE_PLUGIN_ROOT` paths depend on that layout.
A package under this directory is a focused library, not a second engine.

Each package declares its own dependencies and exports in `package.json`.
Consumers use `workspace:*` for local packages, so installation cannot silently
substitute a registry package. Packages are private unless publication is
separately planned. `deal-math` is the first library: pure calculations with zod
and no framework or model dependencies.

Run the shared gates from the root:

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm bundle
pnpm exec tsx evals/run.ts --offline
scripts/audit-harness verify
```

The existing root TypeScript, Vitest and architecture checks cover workspace
source. Add package-specific checks only when a package needs an additional gate.
Only esbuild is approved to run a dependency install script; review new build
requirements before adding them to `onlyBuiltDependencies`.
