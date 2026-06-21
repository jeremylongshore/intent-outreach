> **Recovery note (filed 2026-06-20).** This plan was authored in plan mode in a session whose
> working directory was `pipelinepilot` — this repo's *previous* name. The directory was later
> renamed to `intent-outreach`, so `/resume` from the new path could not list that session and the
> plan appeared lost. Nothing was lost: it was recovered verbatim from the session transcript
> (`d8e72b23-6259-4191-86ce-d1295104bca4`, original plan-mode timestamp `2026-06-21T00:58:32Z UTC`).
> Content below is unaltered.

---

# Unify lead/outreach into ONE engine + packs — Phase 0+1 slice

## Context

Four repos run the **same pipeline shape** (pull → enrich → score → draft/prep → deliver → record →
dashboard) but are fragmented and partly duplicated. The decision (locked last session) is to make
`intent-outreach/pipeline_core` the single engine and turn the others into declarative **vertical "packs"**,
zero-Google, VPS-hosted. The engine itself is **done and merged to `main`** (PRs #7/#13/#14): clean
`research→enrich→score→draft→validate→RunStore`, connector registry, provider seam, MCP + marketplace-grade
skill. The two remaining engine beads are both blocked (Tier 3B eval — out of Anthropic credits; extra model
providers).

**This plan executes the first slice the user chose: Phase 0 + Phase 1 only** — the monorepo skeleton plus
the compliance gate and the coastal/mandy collapse. It is the highest-value, lowest-risk wedge. The
residential-re pack, dashboard, and commercial-re-prep report pack stay **deferred** (listed at the bottom;
the architecture keeps those doors open with no rework).

**Re-validated this session (both confirmed accurate):**
- Engine wiring: npm + vitest, single package. `runCampaign()` stages `pipeline.ts:178-276`; insert point for
  compliance is after draft-validate (`:243`) and before run aggregation (`:257`). Prompts load via
  `loadPrompt(name)` in `seam.ts` (`scoreLead` `:44-56`, `draftMessage` `:68-82`) — swappable for `pack.prompts.*`.
  `SCHEMA_VERSION=1` at `models.ts:16`; `CampaignRunSchema` at `models.ts:132-152`. `Validated<T>` brand in
  `validator.ts`; `RunStore.saveRun(run: Validated<CampaignRun>)` only accepts minted values.
- Coastal `compliance.py` is **real, fail-closed, clock-injected** (`now` is a parameter; no `datetime.now()`),
  pure stdlib, ~36 tests with no mocking. Ports to vitest 1:1.
- **"mandy" is settled:** `coastal-realty-ops` IS the renamed `mandy-real-estate-skills`. No second codebase,
  no `~/000-projects/mandy*` dir. Phase-1's "confirm no second mandy" to-do is **already resolved**.

## Hard principle: BYOK, plug-and-play, zero-Google (non-negotiable)

Every external service — LLM provider, every connector, the DNC/compliance data source, any future delivery
router — is **bring-your-own-key and plug-and-play**:
- **Keys come from the operator** (env var / SOPS), never hardcoded, never baked into the build. Each connector
  already declares `keyEnvVar` + `isConfigured()` and self-skips when unconfigured (`connectors/registry.ts`
  → `getConfiguredConnectors`). Packs and the LLM provider seam (`provider?: LLMProvider`, keys from env) follow
  the same rule. New code added in this slice keeps that contract — no exceptions.
- **Nothing is tied to Google.** No GCP, no Google Workspace, no Google service may sit in the *required*
  dependency graph of the engine or any pack. The optional `@ai-sdk/google` provider may remain **only** as a
  user-chosen, user-keyed option among others — it is never a default, never required, never the only path.
  Removing it must never break a build or a default run.
- **Self-skip, don't fail.** A missing key disables that connector/provider for the run (recorded in
  `skippedConnectors`); it never hard-crashes the pipeline. This is what makes the engine drop-in for any
  operator who brings only the keys they have.

## Target architecture (unchanged)

```
ONE engine (pipeline_core, TS, local-first, zero-Google)
  └─ runCampaign(): research → enrich → COMPLIANCE → score → draft → VALIDATE → RunStore
        ▲ connectors (registry)   ▲ pack-supplied gate   ▲ pack prompts   ▲ Validated<T> brand
PACKS (declarative, registered like connectors — no core edits to add one):
  • b2b-sdr        = today's connectors + prompts + no-op compliance  ← built in this slice
  • residential-re = BatchLeads/Vulcan7/OpenCorporates + DNC/TCPA/geofence gate + RE prompts  ← DEFERRED
  • commercial-re-prep = BatchData/Regrid/ATTOM + reconcile + prep-one-pager PDF             ← DEFERRED
SURFACES: terminal/MCP/CLI → local JSONL RunStore (built) · VPS dashboard → SQLite RunStore  ← DEFERRED
```

## The new abstraction: the Pack

A **pack = a declarative composition over seams the engine already has** — it adds no new orchestration path;
`runCampaign()` stays the one loop. New files mirror the connector-registry pattern
(`pipeline_core/connectors/registry.ts` — a `Map`, insertion-order, register/get):
- `pipeline_core/packs/types.ts` — `Pack` interface: `{ id, displayName, compliance, prompts{score,draft},
  leadExtensions?(zod), defaultProfile?, renderer?, calculators? }`.
- `pipeline_core/packs/registry.ts` — `registerPack()` / `getPack()` / `activePack()` (Map, insertion-order).
- `pipeline_core/packs/index.ts` — registers built-in packs (only `b2b-sdr` in this slice).
- `b2b-sdr` lives in-engine (`packs/b2b-sdr.ts`) since it IS today's behavior — no separate package yet.
  Separate pack packages arrive only when `residential-re` lands (deferred Phase 2).

## Active work

> **Recommended internal order: do Stage A (compliance + pack seam) first, then Stage B (monorepo).**
> Stage A is where the value lands and it keeps the green engine intact; the monorepo split boundaries become
> self-evident once the pack module exists. (The original numbering was 0→1; value-first inverts to 1→0.
> If the in-place pack work proves awkward, fall back to converting first. Either order ends in the same place.)

### Stage A — compliance stage + pack seam (highest value, in-place)

1. **Port the compliance gate 1:1** → `pipeline_core/compliance/` (TS, pure, clock-injected, fail-closed):
   - `normalizePhone()` → E.164; `DncList` class (normalizes on construction); `dncScrub(phone, list)` →
     `"clean"|"blocked"` (malformed → `"blocked"`); `withinQuietHours(now, tz="America/Chicago")` → 7am–9pm
     window via `Temporal`/`Intl` or `date-fns-tz` (DST-correct); `inServiceArea(zip)` → the 11-zip set.
   - Keep `now` as an injected parameter (no `Date.now()` inside) so the determinism tests hold.
   - Source of truth: `coastal-realty-ops/src/orchestrator/compliance.py` + `tests/test_compliance.py` (~36 cases:
     9 normalize, 5 DncList, 5 dnc_scrub, 10 quiet-hours incl. DST, 7 service-area). Port the tests to
     `tests/compliance.test.ts` 1:1 — they need only datetime fixtures, no mocking.
2. **Define the Pack seam** (`packs/{types,registry,index}.ts` + `packs/b2b-sdr.ts`) per above. `b2b-sdr.compliance`
   is a **no-op pass-through** (every contact `"clean"`).
3. **Wire the gate into `runCampaign()`** — resolve `RunCampaignInput.pack ?? "b2b-sdr"`; run
   `pack.compliance.check(contact/lead, now)` **between draft-validate (`pipeline.ts:243`) and aggregation
   (`:257`)**; blocked contacts are recorded as skipped (not drafted/delivered). `b2b-sdr` no-op ⇒ byte-identical
   B2B behavior.
4. **Pack prompts**: have `seam.ts` use `pack.prompts.score/draft` (fall back to `loadPrompt("…")`) so a pack can
   swap prompts without core edits. `b2b-sdr` points at today's `research/enrich/outreach.v1.md`.
5. **Additive schema bump (critical correctness):** in `models.ts`, add `vertical: z.string().default("b2b-sdr")`
   to `CampaignRunSchema` and set `SCHEMA_VERSION=2`. **The current `schemaVersion: z.literal(SCHEMA_VERSION)`
   would REJECT old v1 JSONL on read** (the store re-validates every line, `store.ts:83-92`) — so change it to
   `schemaVersion: z.union([z.literal(1), z.literal(2)])`. New writes emit `2` + the pack's `vertical`; old v1
   lines (no `vertical`, version `1`) still parse, with `vertical` defaulting. This is the load-bearing
   "old JSONL survives" guarantee.

### Stage B — pnpm monorepo skeleton (mechanical, zero behavior change)

Convert `intent-outreach` from npm to a pnpm workspace; lift the current tree into `packages/engine`
(`pipeline_core` + `mcp` + `cli` + `prompts` + `tests`), with the `packs/` module from Stage A inside it.
Add `pnpm-workspace.yaml`; per-package `package.json`; fix tsconfig path mapping and the `dist/`+`bundle/`
(esbuild) build outputs; verify the prompt-loader candidate paths (`prompts.ts:15-39`, incl.
`INTENT_OUTREACH_PROMPTS_DIR`) still resolve post-move. No `residential-re`/`dashboard`/`commercial` packages
yet — they're created when their deferred phases run. Ships green: `pnpm -r test` + `tsc` clean.

## Critical files

**Reuse as-is (crown jewels — do not weaken):** `pipeline_core/connectors/registry.ts` (the pattern packs
mirror), `validator.ts` (`Validated<T>` brand), `store.ts` (`RunStore` + re-validate-on-read), `pipeline.ts`,
`seam.ts`, `prompts.ts`, `models.ts`.

**Port from coastal (real + tested — behavior-preserving):**
`coastal-realty-ops/src/orchestrator/compliance.py` + `tests/test_compliance.py` → `pipeline_core/compliance/`
(this slice). The RE `Lead` enums (`src/domain/lead.py`), `trade_up.py`, `opencorporates.py`, and
`web/dashboard/` are **deferred** to Phases 2–3 below — noted now so they're not re-discovered later.

## Key correctness risks to hold

- **Schema bump must be a union, not a re-literal** — see Stage A step 5. A naive `z.literal(2)` silently drops
  every existing run on read.
- **Keep the compliance gate pure + clock-injected.** A live DNC *lookup* belongs in a **BYOK enrich connector**
  (operator brings their own DNC data source/API key; self-skips when absent), never in the gate — which stays
  deterministic, key-free, and offline for the ported tests. The gate evaluates a `DncList` it's handed; it does
  not reach out to anyone.
- **Never weaken the `Validated<T>` brand.** Blocked-contact handling and any future dashboard read path expose
  already-validated projections only — they don't bypass the gate.
- **Monorepo churn is the riskiest mechanical step**, which is why value (Stage A) lands first and the green
  engine is the safety net.

## Verification (end-to-end)

- **Stage A:** ported `compliance.test.ts` passes 1:1 with the Python suite (all ~36 cases incl. DST boundaries);
  a `residential-re`-shaped dry-run (even before that pack exists, via a throwaway test pack) with a
  DNC/out-of-area/quiet-hours contact is blocked **before** drafting and recorded as skipped; a real `b2b-sdr`
  campaign produces a **byte-identical** run vs. pre-change (no-op gate + `vertical` default ⇒ no behavior change);
  an old v1 `runs.jsonl` line still loads after the schema bump.
- **Stage B:** `pnpm -r test` + `tsc` green across the workspace; CLI + MCP still build/run from
  `packages/engine`; prompt loader resolves post-move.

## Deferred tracks (preserved — not in this slice)

- **Phase 2 — `residential-re` pack:** port RE `Lead` enums + trade-up calc + OpenCorporates connector; **rebuild**
  BatchLeads/Vulcan7/Twilio as real engine connectors/delivery-routers — **all BYOK** (`keyEnvVar` + `isConfigured()`
  self-skip; no hardwired credentials) — (they're `NotImplementedError` stubs in coastal — build once, don't port
  empty shells). Ship `prompts/residential-re/*` + a profile.
- **Phase 3 — generalize dashboard + store adapter:** add `SqliteRunStore` behind `RunStore` (same brand gate,
  re-validate on read); lift coastal `web/dashboard` (Astro + Hono sidecar + scrypt/HMAC auth) into
  `packages/dashboard`; replace the Cloud-Run client with a `RunStore` projection (`GET /api/runs*`); deploy as a
  VPS systemd service behind Caddy (copy the `mandy-sidecar` pattern). Append-only RunStore IS the audit log.
- **Phase 4 — `commercial-re-prep` report pack (greenfield, last):** BatchData/Regrid/ATTOM connectors +
  `render/prep-onepager.ts` (trust-hierarchy reconcile → markdown → existing `/whiteglove-pdf` PDF path) +
  optional `trello-writeback`. A report, not outreach ⇒ no compliance/legal exposure ⇒ safest to defer.

**Do NOT port** coastal's stubbed orchestrator (enrich/score/draft/dispatch/sink, BatchLeads/Twilio/Vulcan7
clients), the Cloud-Run `OrchestratorClient`, BigQuery audit, APScheduler/FastAPI `main.py`, or Secret Manager —
all empty/GCP-shaped shells the engine already replaced. Rebuild as engine connectors when their phase runs.

## Beyond operator-first (deferred, not blocking)

Multi-tenant client-login SaaS stays deferred until the operator surface is proven across ≥2 live verticals.
The config-driven architecture keeps that door open with no rework.
