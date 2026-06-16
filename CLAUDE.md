# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What PipelinePilot Is

An agentic **SDR (sales development) orchestrator** that runs a Research → Enrich → Outreach
lead-generation workflow. A single Python ADK agent runs **inside Vertex AI Agent Engine**
(GCP project `pipelinepilot-prod`, region `us-central1`), calling paid data providers
(Clay, Apollo, Clearbit, Crunchbase) and drafting personalized outreach. A Next.js dashboard
on Firebase Hosting drives it through a thin Firebase Functions shim.

GitHub: `jeremylongshore/pipelinepilot`. Repo path is `~/000-projects/pipelinepilot/`
(NOT `iams/pipelinepilot` — older docs say that; it's wrong).

## ⚠️ Two implementations live in this tree — only one is current

This repo migrated from a TypeScript prototype to Python ADK. Both still exist on disk:

| Path | Status | Notes |
|---|---|---|
| `src/` (Python) | **CURRENT / authoritative** | The deployed system. `from google.adk` agent + tools. |
| `connectors/*.ts`, `agents/*.yaml`, `newsfeed-demo/` | **LEGACY / pre-migration** | The original TS prototype. `agents/` now holds only `_schemas/`. |
| `README.md`, `000-docs/008-AA-STAT-*` | **STALE** | Describe the legacy TS version and a pre-migration "ADK not in PyPI / no dashboard" status. Do not trust them for current state. |

**The README documents the legacy TypeScript path and is misleading — read `src/` and the recent AARs (`016`, `015`) instead.** The `agents/*.yaml` files are now *banned* by CI (see Policy CI below).

## Core architecture (the part that needs multiple files to see)

```
Next.js dashboard (Firebase Hosting)
  └─ POST /campaigns/start → Firestore queues/{id}
       └─ runQueuedCampaign (Firebase Function, onCreate)        ← pipelinepilot-dashboard/functions/src/index.ts
            └─ Vertex AI Agent Engine :query  (ONE orchestrator) ← src/agents/orchestrator.py
                 ├─ clay_lookup()        ┐
                 ├─ apollo_people()      │  all 4 tools on ONE agent  ← src/agents/tools.py
                 ├─ clearbit_enrich()    │
                 └─ crunchbase_company() ┘
            └─ writes results → Firestore campaigns/{id}/{leads,enriched_leads,messages}
```

**Why a single agent with all 4 tools (the central design constraint):** Vertex AI Agent
Engine rejects agents that have **2+ non-search function tools** at *query time*
(`400 Multiple tools are supported only when they are all search tools`). The agents deploy
fine but fail when called. The fix was to collapse the multi-agent design into **one
orchestrator holding all four tools**, with orchestration logic living *inside* Agent Engine
(not in Firebase Functions). See `000-docs/008-TQ-KNOW-agent-engine-limitations.md` and
`000-docs/016-AA-RETRO-orchestration-fix-aar.md`. Firebase Functions is intentionally a thin
shim — do not move workflow logic back into it.

**Secrets:** tools fetch provider keys from GCP Secret Manager at call time
(`_get_secret()` in `src/tools/secrets.py` / `src/agents/tools.py`), keyed by name
(`CLAY_API_KEY`, `APOLLO_API_KEY`, `CLEARBIT_API_KEY`, `CRUNCHBASE_API_KEY`, plus
`SALESNAV_*`/`ZOOMINFO_API_KEY` placeholders). The dashboard's `/keys/set` endpoint writes
new secret versions. No keys in code or `.env`.

## Deploy scripts — only one is canonical

`src/` contains three deploy scripts from different eras. **Use `src/deploy_orchestrator.py`.**

| Script | Use it? |
|---|---|
| `src/deploy_orchestrator.py` | ✅ **Canonical.** Deploys the single ADK `orchestrator_agent` via `google.adk.Deployer`. |
| `src/deploy_inline.py` | ❌ Deprecated multi-agent `Queryable` stub pattern (the design CI now forbids). |
| `src/deploy.py` | ❌ Stale/broken. Imports `create_orchestrator_agent`, which no longer exists in `orchestrator.py`. |

`src/agents/{research,enrich,outreach}.py` (with their `create_*_agent` factories) are the
**deprecated** multi-agent path, kept for reference. The live agent is the module-level
`orchestrator_agent` in `src/agents/orchestrator.py`.

Imports in deploy scripts are rooted at `src/` (e.g. `from agents.orchestrator import ...`),
so run them with `src/` on the path:

```bash
cd src && PROJECT_ID=pipelinepilot-prod LOCATION=us-central1 python3 deploy_orchestrator.py
# then wire the returned resource ID into Firebase Functions:
firebase functions:config:set agents.orchestrator_id="projects/.../reasoningEngines/XXXX"
```

**Agent Engine deploy gotchas (hard-won — `000-docs/005-TQ-LESS-cloudpickle-lessons-learned.md`):**
- Pin **`cloudpickle==3.1.1`** in the deploy `requirements=[...]` — version mismatch with the
  runtime causes `Can't get attribute '_class_setstate'`.
- Agent code must be **self-contained / inline-importable**; deploying agents that import
  custom sibling modules can fail at runtime with `No module named 'agents'` (cloudpickle
  serializes the import path). Don't rely on `extra_packages`.

## Commands

**Python (agents) — `pyproject.toml`:**
```bash
pip install -e ".[dev]"      # google-cloud-aiplatform[adk], google-genai, httpx, pydantic
pytest                       # tests/ (currently empty — asyncio_mode=auto)
black . && ruff check .      # line-length 88
```

**Node root (legacy TS validation/demo) — `package.json`:**
```bash
npm run arv                  # ARV (agent-readiness) validation: scripts/validate_arv.mjs
npm run typecheck            # tsc --noEmit
npm run demo                 # newsfeed-demo via tsx (legacy standalone demo)
```

**Dashboard — `pipelinepilot-dashboard/`:**
```bash
cd pipelinepilot-dashboard/dashboard && npm run dev    # Next.js 15 dev server
cd pipelinepilot-dashboard/functions && npm run build  # tsc → lib/  (Node 18 functions)
firebase deploy --only functions                       # or --only hosting
```
Auto-deploys on push via `pipelinepilot-dashboard/.github/workflows/deploy-dashboard.yml`.

**Test enforcement harness** (vendored `@intentsolutions/audit-harness`, v1.1.5):
```bash
scripts/audit-harness verify   # verify hash-pinned artifacts
scripts/audit-harness init     # re-pin after reviewed edits to harness-governed files
```

## Policy CI — what will block a PR

`.github/workflows/policy.yml` + `adk-guard.yml` enforce the migration's invariants. A PR
fails if it:
- adds a **stub orchestrator** (`status.*STUB` in `src/agents/orchestrator.py`),
- adds **YAML agent definitions** under `agents/` or `src/agents/`,
- imports a **forbidden framework** — LangChain, LlamaIndex, Genkit, or any `OPENAI_API_KEY`,
- drops `from google.adk` out of the orchestrator.

These exist because two prior sessions made unauthorized architecture changes (logic moved to
Functions, downgraded to Gen1, merged incomplete). **`main` is branch-protected.** Treat
changes to the orchestration topology, the agent/tool boundary, or the deploy path as
**architectural — get explicit approval before changing them**, and keep the relevant AAR in
`000-docs/` updated.

## Docs & conventions

All docs live flat in `000-docs/` under the `NNN-CC-ABCD-description.md` filing standard
(`000-INDEX.md` is the index). Category codes: PP (product), AT (architecture), TQ (testing),
OD (ops/deploy), DR (reference), AA/RA/LS (reports/status/logs). For current state, prefer the
**highest-numbered** AA-/status docs; lower numbers and the README predate the ADK migration.

Stack: Python 3.10+ (agents), TypeScript/Next.js 15 + Firebase Functions (dashboard/shim),
Gemini (`gemini-2.0-flash-exp`) as the agent model, Firestore + Secret Manager + Cloud Storage
staging on GCP. `tf-pipeline-multicloud/` is an empty placeholder (no `.tf` files yet).


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:7510c1e2 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
