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
npm run build          # → dist/ (also copies prompts/)
npm run mcp            # run the MCP server on stdio (tsx)
npx tsx evals/run.ts --offline   # deterministic, free eval gate
```

Stack: TypeScript/Node (ESM), zod, Vercel AI SDK (`ai` + `@ai-sdk/*`), `@modelcontextprotocol/sdk`,
vitest, promptfoo. Read `CLAUDE.md` for the architecture and the load-bearing invariants before changing
anything structural.

## The invariants (do not break — they're CI-enforced)

1. **No un-validated model output reaches storage.** `RunStore.saveRun` accepts only
   `Validated<CampaignRun>`; the brand is minted solely by `pipeline_core/validator.ts`. This is a
   `tsc` error if violated, not a style nit.
2. **Zero Google dependency** in `pipeline_core/` and `mcp/` (no google/firebase/vertex/`@google-cloud`
   imports).
3. **Deterministic control flow** — connectors run in fixed registration order; the LLM never chooses
   which API to call. The LLM is called only at the two seams in `pipeline_core/seam.ts`.

Changes to the orchestration topology, the agent/tool boundary, the validator gate, or the supported-
provider set are **architectural** — open an issue/PR describing the change and get sign-off first.

## Adding a connector

Copy `pipeline_core/connectors/apollo.ts`, implement the `Connector` interface, use `httpJson` +
`getSecret`/`hasSecret` (never read `process.env` directly, never import a cloud SDK), register it in
`connectors/index.ts`, and add fixtures. See `CLAUDE.md` → "Adding a data connector".

## Adding a model provider

Adapters for OpenAI/Google/xAI already exist behind the eval gate. A provider is promoted only after it
passes `evals/` with a real key. See `CLAUDE.md` → "Adding a model provider".

## Commit & PR conventions

- Conventional-commit-style subjects (`feat:`, `fix:`, `chore:`, `docs:`).
- Reference the relevant bead (`io-*`) and PR in the body.
- This repo tracks work with **beads** (`bd`); see `AGENTS.md`.

## Security

Never commit secrets. Report vulnerabilities privately per `SECURITY.md` — **not** via a public channel.
