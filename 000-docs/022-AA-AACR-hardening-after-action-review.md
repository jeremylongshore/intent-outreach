# 022-AA-AACR — After-action review: hardening after the six-lens audit

**Filed:** 2026-10-04 · **Covers:** epic [#51](https://github.com/jeremylongshore/intent-outreach/issues/51),
PRs #45–#50, #58, #59, #61, #62 and the docs stream #57
**Plan:** `021-AT-PLAN-hardening-after-six-lens-audit.md`

## 1. Summary

About 80 audit findings became ten merged PRs across two waves in roughly a day, with a CI stream and this
docs stream closing out Wave 3. Every load-bearing invariant from `CLAUDE.md` now holds at runtime, not just
at compile time; the primary product surface (`save_run`) runs the same compliance chain as the CLI; and the
eval gate measures model quality instead of wiring. The main costs were merge churn on the committed bundle
and a test that flakes under load.

## 2. What went well

- **Streams split by file ownership.** Each stream owned a disjoint file set and ran in its own worktree,
  so six Wave 1 PRs merged within minutes of each other. When a stream had to touch a file it didn't own
  (`b2b-sdr.ts` in #58, two test assertions in #49), the PR body flagged it, which made review cheap.
- **Out-of-scope findings were handed forward, not dropped.** Each PR ended with a "Follow-up & deferred"
  list addressed to the owning stream. #59 and #62 were built largely from those lists (cache-aware cost,
  `failedConnectors` folding, `DraftRejectedError` → `rejectedDrafts`, `promptRef` provenance, friendly
  duplicate errors), and the docs stream used the same lists to find stale wording.
- **Shared helpers instead of a second implementation.** `applyMessageCompliance`, `finalizeDraft` and
  `campaignGate` live in `pipeline.ts` and are called by both `runCampaign` and MCP `save_run`, so the two
  paths cannot drift.
- **Fail-closed by construction.** The engine, not each pack, decides what "clean" means; a corrupt
  suppression file stops the run; a draft that fails the guard is recorded, never saved.
- **Honest verification notes.** PRs said what was mocked and what was not (no keyed model call in #61,
  no live plugin install in #47 and #62, vendor request shapes unverified in #50). That honesty is why the
  follow-up list below is concrete.
- **Additive schema discipline held** through three version bumps (v3, v4, v5), backed by the golden
  legacy fixture, and it surfaced a real older break (the narrowed `RunStatus`) that #59 repaired.

## 3. What didn't go well

- **Bundle-conflict churn.** `bundle/cli.mjs` and `bundle/server.mjs` are committed and checked for
  freshness, so every stream that touched `pipeline_core/`, `mcp/` or `cli.ts` rebuilt them. Parallel PRs
  therefore conflicted on the bundle, and each merge left the next PR to rebase and rebuild before CI's
  freshness check would pass. The
  same pattern showed up earlier with dependabot (#42 had to combine three bumps for this reason).
  *Lesson:* treat the bundle as a merge-time artifact (rebuild after rebase, or have a bot rebuild it)
  rather than something each parallel branch carries.
- **A flaky concurrency test under load.** `tests/store.test.ts` "many concurrent large saves…" timed out
  at the 5s default whenever the box was busy (load average 34–41 from parallel sessions). It failed in the
  local runs for #58, #59, #61 and #62 and passed every time it ran alone. It never indicated a store bug,
  but it trained everyone to ignore one red test. The CI stream owns the fix.
- **Worktree tests were collected by vitest.** Agent worktrees live under `.claude/worktrees/` inside the
  repo, and vitest's default glob picked up their copies of `tests/`, so a run from the main checkout also
  ran other branches' tests. Streams worked around it with `--exclude '.claude/**'`. The CI stream (#54)
  owns `vitest.config.ts` and is the place to make the default command exclude them.
- **Docs drifted the moment the code moved.** CLAUDE.md, README, CONTRIBUTING and SECURITY still described
  promptfoo, a Gemini adapter, an `env` block in `.mcp.json` and a type-only gate after the code had moved
  on. Code streams were right to stay out of files they didn't own, but it left one stream to reconcile
  everything at the end.
- **Mocks stood in for reality in three places:** the keyed eval gate, the installed-plugin tool names and
  two vendor request shapes. All three are listed below.

## 4. Open follow-ups

| # | Follow-up | Why it is open | Source |
|---|---|---|---|
| F1 | Verify the **Apollo people-search** (`mixed_people/api_search` with `q_organization_domains` + `q_keywords`) and **ZoomInfo** request bodies (`companyWebsite`, `keywords`, `maxResults`, `enrich/contact` email match) against live vendor docs. | No access to the vendor APIs during the hardening; both files carry `TODO(live-doc verification)` headers. | #50 |
| F2 | Run the **first keyed eval**, recalibrate the score bands from its record, and **promote `claude-sonnet-5-5`** (then change `DEFAULT_MODEL` as a separate reviewed edit). Re-run anthropic `claude-sonnet-4-6` and openai `gpt-4o` to turn their `verified: false` legacy claims into records. | No API credits during the hardening; the bands (strong 65–100, weak 0–30, thin 0–60, adversarial 0–30, no-funding 30–85) are unproven against a real model. | #61 |
| F3 | **Live plugin-install test** of the MCP tool names (`mcp__plugin_intent-outreach_intent-outreach__<tool>`) and of the manifest-over-`.mcp.json` precedence. | The name pattern is taken from the Claude Code docs; it was never exercised in an installed-plugin session. Both name forms are allowlisted, so the worst case is one unused entry. | #47, #62 |
| F4 | Add MCP **`list_runs`** (exposing `store.corruptLines()`) and **`suppress`** tools. | Out of scope for the MCP stream; today suppressions are CLI-only and corrupt lines only reach stderr. | #48, #59, #62 |
| F5 | **Export the draft-guard identifier helper** (`identifiersOf`) from `seam.ts` so `pipeline.draftIdentifiers` reuses it instead of mirroring it. | Owned by another stream at the time. Two copies of an allowlist builder can drift. | #62 |
| F6 | Handle **full-width CSV formula triggers** (`＝`, `＋`, …). | Some spreadsheet locales may evaluate them; only ASCII triggers are prefixed today. | #46 |
| F7 | Close the **stale-lock race window** in the store. | Two waiters can both judge a lock stale (older than 30s) and one can unlink the other's fresh lock. Narrow, and accepted for a local CLI, but real. | #48 |
| F8 | Stop the store **reading the whole file on every save**. | The duplicate-id scan makes `saveRun` O(file size). Fine for local JSONL today; a SQLite adapter behind the same interface is the documented escape hatch. | #48 |

Other items noted in PR bodies, lower priority: an idempotent-only retry policy for paid POSTs if a vendor
bills on 5xx (#50); surfacing connector per-item `failures` beyond `failedConnectors` (#50, #59);
the stale "env passthrough declared in .mcp.json" wording in the `mcp/server.ts` header comment (source
file, outside the docs stream; #47); and the policy workflow header comment still describing the invariant
as type-only (CI stream).

## 5. CI stream results

> **TODO (orchestrator):** fill in from the CI stream (#54) once it merges.
>
> - Coverage baseline (lines / branches / functions / statements) and the thresholds set:
> - Mutation score (Stryker on `compliance/` + `validator.ts`) and the break threshold:
> - Store concurrency test: root cause and fix:
> - Architecture/type tests added:
> - Required checks configured for branch protection:
> - Harness re-pin (`scripts/audit-harness init`) commit:

## 6. Lessons to carry forward

1. Split parallel work by file ownership and make every PR hand its out-of-scope findings to a named owner.
2. Rebuild committed artifacts at merge time, not on every parallel branch.
3. A test that is "only flaky under load" still needs a fix in the same wave, or it stops being a signal.
4. Keep agent worktrees out of the test collector by config, not by remembering a flag.
5. Ship docs alongside the code stream that changes the behaviour, or schedule the reconciliation up front
   as its own stream (as #57 was).
