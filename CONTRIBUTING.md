# Contributing to Intent Outreach

Thanks for your interest. Intent Outreach is **proprietary software** (see `LICENSE`); contributions
are accepted via pull request and, per the license, become the property of Intent Solutions LLC.

## Ground rules

- **Branch, never commit to `main`** (it's protected). Use a feature branch and open a PR.
- Keep changes minimal and focused. Match the surrounding code's style and idiom.
- Every PR must keep the build green: `npm run typecheck` and `npm test` pass, and the
  policy-enforcement workflow's invariants hold.

## Dev setup

```bash
npm install
npm run typecheck      # tsc --noEmit
npm test               # vitest
npm run bundle         # rebuild bundle/ (what ships); commit it with any source change
npm run build          # tsc → dist/ (CI build check; nothing ships from dist/)
npm run mcp            # run the MCP server on stdio (tsx)
npx tsx evals/run.ts --offline   # free wiring check (CI); not a model-quality gate
```

Stack: TypeScript/Node (ESM), zod, Vercel AI SDK (`ai` + `@ai-sdk/*`), `@modelcontextprotocol/sdk`,
esbuild, vitest. Read `CLAUDE.md` for the architecture and the load-bearing invariants before changing
anything structural.

## The invariants (do not break — they're CI-enforced)

1. **No un-validated model output reaches storage.** `RunStore.saveRun` accepts only
   `Validated<CampaignRun>` (the brand is minted solely by `pipeline_core/validator.ts`), re-validates the
   record at runtime before writing, and validated records are deep-frozen. CI fails the typecheck on a
   violation and rejects any `as Validated` cast outside `validator.ts`.
2. **Zero Google dependency** in `pipeline_core/` and `mcp/` (no google/firebase/vertex/`@google-cloud`
   imports). The Google model adapter was removed; don't add one back.
3. **Deterministic control flow** — connectors run in fixed registration order; the LLM never chooses
   which API to call. The LLM is called only at the two seams in `pipeline_core/seam.ts`.
4. **Additive schema changes only.** The run schema is at v5; a bump adds defaulted or optional fields
   and a new member of the `schemaVersion` union. `tests/fixtures/runs.legacy.jsonl` must keep parsing.

Compliance is fail-closed and lives in code: the suppression list runs ahead of every pack's gate, any
non-`clean` verdict or throwing gate blocks the contact, every draft passes `guardDraft`, and the CAN-SPAM
footer is appended by `footer.ts`. Both `runCampaign` and the MCP `save_run` tool go through that chain;
a new persistence path must too.

Changes to the orchestration topology, the agent/tool boundary, the validator gate, or the supported-
provider set are **architectural** — open an issue/PR describing the change and get sign-off first.

## Adding a connector

Copy `pipeline_core/connectors/apollo.ts`, implement the `Connector` interface, use `httpJson`, read keys
with `useSecret` (never read `process.env` directly, never import a cloud SDK), keep only allowlisted B2B
fields, register it in `connectors/index.ts`, and add fixtures. See `CLAUDE.md` → "Adding a data
connector".

## Adding a model provider

Adapters for OpenAI and xAI exist in `pipeline_core/providers.ts`. Approval is per model: a model is
approved only by a passing keyed eval run, via
`npm run evals:promote -- --provider <name> --model <id>`. On a pass, commit the record it writes under
`evals/results/` and the updated `evals/supported.ts`. Don't edit `SUPPORTED_PROVIDERS` by hand; it is
derived from `supported.ts`. See `evals/README.md` and `CLAUDE.md` → "Adding a model provider".

## Trying your change locally

- **Keep your real data out of it.** Point `INTENT_OUTREACH_HOME` at a scratch directory (absolute path);
  runs, `suppressions.jsonl` and profiles are then read and written there (files 0600, directories 0700).
- **CLI:** `node bundle/cli.mjs run --icp … --domains … --profile <path|name>` after `npm run bundle`.
  Add a `sender` block to the profile to see the CAN-SPAM footer; leave it out to see
  `needsSenderIdentity`. Manage opt-outs with `node bundle/cli.mjs suppress add|remove|list`.
- **MCP:** opening Claude Code in this checkout loads the root `.mcp.json` (project scope, tools named
  `mcp__intent-outreach__<tool>`). The installed plugin uses the `mcpServers` entry in
  `.claude-plugin/plugin.json` instead (`mcp__plugin_intent-outreach_intent-outreach__<tool>`). Both run
  `bundle/server.mjs`, so rebuild the bundle before testing.
- **Raw vendor payloads** are dropped by default (PII minimization). Set `INTENT_OUTREACH_KEEP_RAW=1` only
  when you need them for debugging.

See `README.md` for the full list of settings, the data layout and the eval promote flow.

## Commit & PR conventions

- Conventional-commit-style subjects (`feat:`, `fix:`, `chore:`, `docs:`).
- Reference the relevant bead (`io-*`) and PR in the body.
- This repo tracks work with **beads** (`bd`); see `AGENTS.md`.

## Security

Never commit secrets. Report vulnerabilities privately per `SECURITY.md` — **not** via a public channel.
