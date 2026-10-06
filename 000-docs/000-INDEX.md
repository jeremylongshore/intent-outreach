# 000-INDEX — Intent Outreach Documentation Index

**Last Updated:** 2026-10-06
**Purpose:** Map of the docs in this directory. Current docs are `017`–`022` and `031` onward. Everything in `001`–`016`
and `023`–`030` predates the rebuild and describes the retired Gemini-on-Vertex "PipelinePilot" system;
it is kept for history only, and each of those files carries a "Historical (pre-rebuild)" banner.

---

## Current (the rebuild)

The product is **Intent Outreach** — a model-agnostic, Claude-Code-native SDR orchestrator
(TypeScript/Node, zero Google dependency, local-only, BYO keys). Start here:

- **`017-AT-DECR-rebuild-intent-outreach.md`** — the ISEDC Decision Record for the rebuild: the
  canon-thinker positions (Hickey / Thompson / Karpathy / Huyen) verbatim, the synthesis, the resolved
  decisions (D1–D5), the target architecture, and the acceptance criteria. **The canonical "why".** (Its
  Gemini option under D4 was withdrawn on 2026-10-04; see `021`.)
- **`018-DR-LAND-b2b-data-provider-landscape-2026.md`** — the 2026 connector landscape: which data
  providers are viable BYO-key, the corrected endpoints/auth, and the shipped connector roster.
- **`019-AT-PLAN-unify-engine-packs-phase0-1.md`** — the unify-engine Phase 0+1 plan (pack seam +
  compliance module), recovered verbatim from the pre-rename session; Stage A shipped in PR #16.
- **`020-AT-PLAN-dealmachine-residential-addendum.md`** — addendum to `019`: DealMachine as the
  residential data source for a future `residential-re` pack. Proposed, no code yet.
- **`021-AT-PLAN-hardening-after-six-lens-audit.md`** — the October 2026 six-lens audit (~80 findings),
  the owner decisions, the stream plan and waves, and what shipped in each PR.
- **`022-AA-AACR-hardening-after-action-review.md`** — after-action review of the hardening: what went
  well, what didn't, and the open follow-ups.
- **`031-AT-DECR-real-estate-engine-one-engine-many-packs.md`** — the real estate decision record: one engine,
  many packs, thin client repos; the three structural pieces that land first (send-time per-channel compliance,
  the property/owner model, capability routing with budgets); the repo boundaries with coastal-realty-ops and
  comehomealabama; alternatives rejected; open owner decisions.
- **`032-RA-SYNT-real-estate-engine-research-synthesis.md`** — synthesis of the five research reports behind
  `031` (market, data APIs, compliance, AI-native future-proofing, internal gap review), with sources, the
  unverified claims marked, and the contradictions the plan resolved.
- **`033-AT-DECR-social-intent-pack-decision.md`** — go/no-go for a `social-reply` pack that turns public
  comment friction into human-approved replies: conditional GO behind a 30-day manual pilot, the
  never-post boundary, and per-platform verdicts with sourced terms. Proposed.
- **`034-AT-PLAN-social-intent-pack-plan.md`** — the phased build on Pack v2: zod model sketch, scoring
  rubric, gate and draft rules, the fail-closed test list, the 30-day cadence and kill criteria. Proposed.

For how the system works and how to run it, read the repo root:

- `README.md` — install (plugin + CLI), keys and settings, sender identity / CAN-SPAM, suppression list,
  where data lives, the eval promote flow, architecture-in-one-screen.
- `CLAUDE.md` — architecture, the load-bearing invariants, and how to add a connector / provider / pack.
- `CHANGELOG.md` — release notes, including the breaking changes in `[Unreleased]`.

---

## Historical (pre-rebuild — Gemini on Vertex AI Agent Engine)

These document the original PipelinePilot system that the rebuild **replaced and removed** (Vertex Agent
Engine, Firebase Functions/Firestore, the Next.js dashboard, the Gemini single-orchestrator design, the
billing scaffold). They are retained only as a historical record — do **not** treat them as current.

| Range | Topic (historical) |
|---|---|
| `001`–`004` | Migration audit, migration-captain progress, Vertex-ADK architecture decision, Secret Manager |
| `005`–`008` | Cloudpickle lessons, deployment runbook, migration AAR, Agent Engine multi-tool limitation |
| `009`–`014` | Production/dashboard deployment reports, GCP setup, quick reference, exec briefs |
| `015`–`016` | Autonomous-decision diagnosis, orchestration-fix AAR |
| `023`–`030` | Original PipelinePilot product docs, renumbered on 2026-10-04 to resolve number collisions (see below) |

If a claim in a historical doc contradicts `017`–`022` or `031` onward, the README, or `CLAUDE.md`, the latter win.

### Renumbered on 2026-10-04 (number collisions)

`001`–`008` each had two files. The PipelinePilot product docs moved to the next free numbers; the
migration-series docs kept theirs because `015`, `016` and `017` cite them by name.

| Old name | New name |
|---|---|
| `001-PP-PROJ-project-overview.md` | `023-PP-PROJ-project-overview.md` |
| `002-PP-PROD-pipelinepilot-prd.md` | `024-PP-PROD-pipelinepilot-prd.md` |
| `003-AT-ARCH-system-architecture.md` | `025-AT-ARCH-system-architecture.md` |
| `004-DR-TECH-google-agent-frameworks-comparison.md` | `026-DR-TECH-google-agent-frameworks-comparison.md` |
| `005-PP-LEAS-leasing-model.md` | `027-PP-LEAS-leasing-model.md` |
| `006-OD-CICD-deployment-guide.md` | `028-OD-CICD-deployment-guide.md` |
| `007-AA-DASH-dashboard-deployment-complete.md` | `029-AA-DASH-dashboard-deployment-complete.md` |
| `008-AA-STAT-current-project-status.md` | `030-AA-STAT-current-project-status.md` |

Some historical docs still cite older document IDs that never existed under those names in this directory
(for example `003-DR-APIM-api-reference`, `004-DR-SCHM-json-schemas`); those were already dangling before
the rename and are left as written.

### `archive/` — loose pre-rebuild files

Unnumbered pre-rebuild material, moved out of the main listing on 2026-10-04:

| File | What it was |
|---|---|
| `archive/TODO-MIGRATION-CAPTAIN.md` | Checklist for the YAML → Vertex ADK migration |
| `archive/adk_migration_audit_raw.txt` | Raw output of that migration audit |
| `archive/ADR-0001-adopt-vertex-adk.md` | ADR adopting Vertex AI Agent Engine + Python ADK (was `adr/`) |
| `archive/adk_migration_audit.md` | Migration audit report (was `reports/`) |
| `archive/adk_migration_AAR.md` | Migration after-action report (was `reports/`) |
