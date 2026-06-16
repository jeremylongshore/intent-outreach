## What & why

<!-- What does this change and why? Link the bead (io-*) and any related PR. -->

## Type

- [ ] feat
- [ ] fix
- [ ] chore / docs / refactor
- [ ] architectural (orchestration topology, agent/tool boundary, validator gate, or supported-provider set — needs sign-off)

## Checklist

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] Policy-enforcement invariants hold (no un-validated output reaches storage; zero Google imports in `pipeline_core`/`mcp`; deterministic connector order)
- [ ] No secrets committed; BYO-key handling stays local
- [ ] Docs updated if behavior/architecture changed (`README.md` / `CLAUDE.md` / `000-docs/`)

## Notes for the reviewer

<!-- Anything risky, any follow-ups, anything you want a second pair of eyes on. -->
