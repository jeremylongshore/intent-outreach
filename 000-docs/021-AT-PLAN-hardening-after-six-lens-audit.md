# 021-AT-PLAN — Hardening Intent Outreach after the six-lens audit

**Filed:** 2026-10-04 · **Tracking:** epic [#51](https://github.com/jeremylongshore/intent-outreach/issues/51)
**Status:** Waves 1 and 2 shipped (PRs #45–#50, #58, #59, #61, #62). Wave 3 in flight: CI enforcement
(#54) and docs (#57). Branch protection, the harness re-pin and the release cut follow.
**Companion:** `022-AA-AACR-hardening-after-action-review.md` (what went well, what didn't, open follow-ups).

## 1. Why this exists

By v0.2.0 the rebuild (`017-AT-DECR`) had a sound shape, but nobody had attacked it. On 2026-10-03 six
read-only auditors reviewed the repo, each through one lens, and found **about 80 gaps**. Several were
the kind a user only discovers in production: the shipped CLI binary did not start, cost metering recorded
$0 for every call, a pack gate that returned a mistyped verdict let contacts through, and the primary
product surface (MCP `save_run`) bypassed every compliance check.

This plan records how the findings were split into streams, the order they shipped in, the owner decisions
that shaped them, and what each PR delivered.

## 2. The audit

| Lens | Question it asked | Headline findings |
|---|---|---|
| Invariants | Do the six CLAUDE.md invariants hold at runtime, not just in `tsc`? | Three ways to persist an invalid record through the type-only brand (spread, post-validation `push`, `JSON.parse` cast); a narrowed `RunStatus` broke old v1 lines with no schema bump. |
| Security | Can keys or prospect data leak, or can output be weaponized? | CSV formula, `.eml` header and HTML injection in reports; secrets echoed in vendor error bodies; personal emails and phones stored by default; loose file permissions. |
| LLM layer | Is model output trusted anywhere it shouldn't be? | Raw connector text and payloads pasted straight into prompts; drafts only shape-checked; ungrounded score angles fed to drafting; AI SDK v7 usage fields not read, so cost was always zero. |
| Tests / CI | Do the gates prove what they claim? | Offline eval "gate" was a wiring check with n=1, no bands and no records; no end-to-end test of the shipped bundle; the shipped CLI crashed on start. |
| Connector resilience | What happens on a 5xx, a 404, a hang, or vendor shape drift? | One transient failure threw away every paid result in an enrich loop; a 401 was swallowed; no retries or deadlines; vendor drift surfaced as `TypeError`. |
| Product surfaces | Do the CLI, MCP server and plugin behave as documented? | `CONNECTION_CLOSED` in project scope; `save_run` skipped the gate, suppression and footer; CLI flags silently coerced; no CAN-SPAM handling. |

The per-finding list lives in the stream issues (#52–#57) and the PR bodies linked below; this document
does not repeat all 80.

## 3. Owner decisions (2026-10-04)

| # | Decision | Effect |
|---|---|---|
| O1 | **Drop the Google adapter.** | `google` removed from `ProviderName`, key lists and the detect order; `@ai-sdk/google` uninstalled; Gemini pricing rows and `GEMINI_API_KEY` removed. Supersedes the Gemini half of D4 in `017-AT-DECR`. (#58, #62) |
| O2 | **CAN-SPAM footer plus a suppression list** on default drafts. | Footer appended by code from profile `sender`, never by the model; a local opt-out list gates every pack. (#59, #62) |
| O3 | **Enable GitHub issues.** | Issues are on; the streams are tracked as sub-issues of #51. Security reports stay private (see `SECURITY.md`). |
| O4 | **Branch protection on `main`.** | Approved; applied after the CI stream (#54) lands so the required checks exist. Not yet in place when this was filed. |

Two stream-level decisions were made inside PRs and are worth keeping:

- **Suppression runs in the engine, ahead of every pack**, not inside `b2b-sdr`. A pack's gate is a static
  object while the list is per-run data, and an unsubscribe must survive a pack swap. (#59)
- **Fail-closed is enforced by the engine**, not trusted to each pack: only exactly `{status: "clean"}`
  passes. (#49)

## 4. Stream plan

The findings were grouped into streams that **do not share files**, so each could be built in its own
worktree and shipped as its own PR. Where a stream had to touch another stream's file, the PR flagged the
edit.

| Stream | Scope (files) | Issue | PR |
|---|---|---|---|
| CLI binary + MCP registration | bundle script, `.mcp.json`, plugin manifest, CI smoke | — | #47 |
| Real token usage and cost | `providers.ts` (usage only), `cost.ts` | — | #45 |
| Run store integrity | `store.ts`, `validator.ts`, `secrets.ts`, policy step | — | #48 |
| Connector resilience | `http.ts`, `connectors/*` | — | #50 |
| Pipeline failure isolation + fail-closed gate | `pipeline.ts`, `models.ts`, `packs/types.ts`, `compliance/` | — | #49 |
| Render output escaping | `render/` | — | #46 |
| Prompt fencing + draft guard + Google removal | `seam.ts`, `prompts/`, `prompts.ts`, `providers.ts`, `draft-guard.ts` | #52 | #58 |
| CAN-SPAM footer + suppression + Wave 1 follow-ups | `footer.ts`, `compliance/suppression.ts`, `suppressions.ts`, `pipeline.ts`, `models.ts`, `profiles.ts`, connectors, `render/index.ts`, `cli.ts` (suppress only) | #53 | #59 |
| Real per-model eval gate | `evals/*`, `providers.ts` (supported list only) | #56 | #61 |
| MCP + CLI gates and pipeline wiring | `mcp/server.ts` → `mcp/tools.ts`, `cli.ts`, registries, agents/skills | #55 | #62 |
| CI enforces the invariants + e2e | `.github/*`, vitest config, test setup, linter, mutation config | #54 | in flight |
| Docs, changelog, `000-docs` hygiene | docs only | #57 | this PR |

## 5. Waves

Dependencies set the order, not file overlap:

```text
Wave 1  (parallel)   #47 CLI/MCP  #45 cost  #48 store  #50 connectors  #49 pipeline  #46 render
                       │
Wave 2a (parallel)   #58 seam (#52) ─────────┐        #59 CAN-SPAM (#53) ──────┐     #54 CI (in flight)
                                             ▼                                 ▼
Wave 2b              #61 eval gate (#56)              #62 MCP/CLI gate (#55)
                       │
Wave 3               #57 docs  →  branch protection (after #54)  →  harness re-pin  →  release cut
```

- **Wave 1** landed on 2026-10-03; `main` was re-verified at 429/429 tests with the CLI and MCP smokes
  passing.
- **Wave 2a** ran three streams at once. #58 had to land before the eval gate (the harness reuses
  `draft-guard.ts`), and #59 before the MCP stream (which reuses the footer and suppression helpers).
- **Wave 2b**: #61 and #62 merged on 2026-10-03. `main` then ran 607/608, the one failure being the store
  concurrency test timing out under heavy box load (it passes alone; the CI stream owns the fix).
- **Wave 3** is docs (#57) and CI (#54), then branch protection, then a harness re-pin, then the release.
  The version number is chosen at release time, not here.

## 6. What shipped, per PR

| PR | Stream | Delivered |
|---|---|---|
| #47 | CLI + MCP registration | Removed the duplicate shebang and added a `createRequire` banner so `bundle/cli.mjs` runs. Registered the MCP server per scope (plugin manifest with `${CLAUDE_PLUGIN_ROOT}`, root `.mcp.json` relative), dropped the `env` passthrough, added CI smokes for the CLI and MCP `initialize`. |
| #45 | Cost | `usageFrom` maps AI SDK v7 usage (including cache tokens); new 5.x price rows; `claude-opus-4-8` corrected to $5/$25; prefix matching on a `-` boundary; one stderr warning per unknown model. |
| #48 | Store | `saveRun` re-validates at runtime; validated records deep-frozen (`DeepReadonly`); lockfile + fsync append with torn-tail repair; `corruptLines()`; `DuplicateRunError`; 0600/0700 permissions; placeholder/empty secrets treated as unset; golden legacy fixture; CI rejects `as Validated` casts. |
| #50 | Connectors | Retries with jitter and `Retry-After`, 5 MB cap, https-only, same-origin redirects, secret scrubbing (`useSecret`); `forEachContact` keeps partial results; vendor responses zod-checked; PII cut to a B2B allowlist (`INTENT_OUTREACH_KEEP_RAW=1` opts out); PDL, Crunchbase, Clearbit, Clay and Exa fixes. |
| #49 | Pipeline | Per-lead isolation into `run.errors`; `rejectedDrafts`; `failedConnectors` vs `skipped`; per-connector deadline; fail-closed gate with `enrichments` in `ComplianceContext`; `normalizeDomain`; `maxDomains`/`allowLarge`; `deriveRunStatus`; schema v3 and the `partial` status. |
| #46 | Render | CSV formula prefixing, `.eml` header sanitising and RFC 2047 encoding, `To:` only for valid addresses, HTML `<title>` escaping. |
| #58 | Seam | Allowlisted prompt views fenced as escaped JSON; prompts v2; `guardDraft` + `DraftRejectedError`; `groundAngles`; token, effort and timeout bounds; `generateText` + `Output.object`; `promptRef` = `file@sha8`; **Google removed**. |
| #59 | CAN-SPAM | Profile `sender`; `applyComplianceFooter`; `needsSenderIdentity` + `complianceWarnings`; suppression gate, file store and the `suppress` add/remove/list command; cache-aware run cost; connector failures folded into `failedConnectors`; signals and `contactName` in every adapter; Slack escaping; legacy `pending`/`drafted` statuses readable; schema v4. |
| #61 | Evals | Score bands, angle-laundering and draft-guard checks, `--repeat` (default 3), optional `--judge`, result records, `evals/supported.ts` per-model approval, `getProviderUnchecked` for the harness only, `npm run evals:promote`; promptfoo config deleted. |
| #62 | MCP + CLI | `save_run` runs suppression → pack gate → draft guard → footer through shared `applyMessageCompliance`; strict `contactKey`; bounds and a 2 MB cap; friendly duplicate/validation/lock errors; normalized research/enrich results (`debug` for raw); CLI flag validation with exit 2, `run --profile`, EPIPE handling; `DraftRejectedError` → `rejectedDrafts`; `promptRefs`, `droppedAngles`, `origin`; schema v5; both MCP tool-name forms allowlisted. |
| #57 | Docs | This plan, the AAR (`022`), `CHANGELOG.md` `[Unreleased]`, README/CONTRIBUTING/SECURITY/CLAUDE.md aligned with the code, pre-rebuild files moved to `000-docs/archive/`, 001–008 number collisions resolved. |
| #54 | CI | In flight at filing. Results (coverage baseline, mutation score) are recorded in `022`. |

## 7. Breaking changes users will notice

Collected in `CHANGELOG.md` under `[Unreleased]`: `--provider google` removed; schema v5 (older binaries
cannot read new runs, so fix forward); `save_run` rejects duplicate ids and is stricter; `promptVersion`
is now `file@sha8`; the CLI exits 2 on bad flags; relative `INTENT_OUTREACH_HOME` /
`INTENT_OUTREACH_SECRETS_FILE` throw; the `./prompts` cwd fallback is gone.

## 8. Not in scope

- Choosing the release version (done at release time).
- Promoting `claude-sonnet-5-5` to the default model: blocked on a keyed eval run (see `022`).
- Anything in `019`/`020` beyond what the hardening touched (packs beyond `b2b-sdr`, DealMachine).
