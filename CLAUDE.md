# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Intent Outreach Is

A **model-agnostic, Claude-Code-native SDR orchestrator**: research → enrich → outreach over B2B data
providers, drafting personalized cold outreach. It runs **fully on the user's machine**, with **their
own** connector + model keys, and **zero Google dependency**. Claude is the default model. It drafts and
records; it **never sends** a message to a prospect.

Two surfaces, one core:

1. **Claude Code plugin** (`skills/intent-outreach/SKILL.md` + bundled MCP server): the primary surface.
2. **Standalone CLI** (`cli.ts` → `intent-outreach`): the same pipeline from the terminal.

GitHub: `jeremylongshore/intent-outreach`. This repo was rebuilt from "PipelinePilot", a retired
Gemini-on-Vertex agent; see `000-docs/017-AT-DECR` for the decision record. **Do not reintroduce
Google/Vertex/Firebase** anywhere.

## Architecture (the part that needs multiple files to see)

```text
Claude Code skill ─┐                          ┌─ list_connectors ──┐
 (deterministic    ├─► Intent Outreach MCP ───┤  research_domain    ├─► pipeline_core/ (framework-free)
  R→E→O phases)    │   server (mcp/server.ts, │  enrich_lead        │
standalone CLI ────┘   handlers mcp/tools.ts) └─ save_run ──────────┘
```

`pipeline_core/` is the framework-free spine (no http SDK lock-in, **no Google/cloud imports**, CI-guarded):

| File | Role |
|---|---|
| `models.ts` | The five B2B value types (Lead/Contact/Enrichment/Message/CampaignRun) as **zod** schemas, the v6 property/owner model (Property keyed `FIPS:APN`, Party, Ownership, EntityLink, ContactPoint with DNC defaulting `unknown`, every vendor value a `Fact` with provenance + license terms) and the typed `ResearchQuery` (domain/area/parcel), plus `SCHEMA_VERSION` (now **6**) and `SUPPORTED_SCHEMA_VERSIONS`. `source` is an open string so custom connectors stamp their own. |
| `validator.ts` | **The gate.** Mints `Validated<T>` (`DeepReadonly<T>` plus a brand only this module can name) and deep-freezes every record it returns. |
| `store.ts` | `RunStore`, local JSONL (`~/.intent-outreach/runs.jsonl`). `saveRun` takes only `Validated<CampaignRun>` **and re-validates at runtime**. Lockfile + fsync append, torn-tail repair, `DuplicateRunError` unless `{overwrite: true}`, `corruptLines()`, files 0600 / dirs 0700. Never a hosted DB. |
| `secrets.ts` | `getSecret()` = env (default) or a local file. Empty and `${...}` values count as unset; path env vars must be absolute. **No cloud secret store.** |
| `http.ts` | `httpJson`: retries 408/429/5xx with jitter and `Retry-After` (cap 10s), never retries other 4xx, follows same-origin redirects only, caps bodies at 5 MB, https-only (loopback excepted), redacts registered secrets from errors. |
| `connectors/` | Registry + 9 adapters in deterministic order; each self-skips without its key. Shared helpers: `_per-item.ts` (`forEachContact`: per-contact isolation, partial results, 401/403 rethrow), `_domain.ts` (`normalizeDomain`), `_shared.ts` (`useSecret`, `pickAllowed` PII allowlist, `keepRawOptIn` for `INTENT_OUTREACH_KEEP_RAW=1`, `parseVendor` zod check). |
| `compliance/` | `index.ts`: DNC, TCPA quiet-hours and service-area checks. `suppression.ts`: the pure opt-out gate (`suppressionGate`, `composeGates`; email, domain, phone, mailing address). `send.ts`: **the send-time check** (`checkSendable`/`assertSendable`, per-channel `ChannelPolicy`, tighten-only pack overrides) every dispatcher calls; CLI `check-send`. `consent.ts`: the consent ledger (written vs verbal, revoke-all). `timezones.ts`: the conservative phone window (8am–8pm local Mon–Sat, TX from 9; unknown location → every US zone). `fair-housing.ts`: the HARD/WARN lint (ported from comehomealabama, plus age/familial terms) as `fairHousingDraftRule`. `risk.ts`: manual-review signals (probate, divorce, pre-foreclosure), the active-listing check, FCRA field stripping. **Pure, clock-injected, fail-closed**, no I/O. A live DNC *lookup* belongs in a BYOK enrich connector, never here. |
| `suppressions.ts` | File I/O for `~/.intent-outreach/suppressions.jsonl`: atomic writes under a lock; a corrupt line throws instead of being skipped. |
| `packs/` | Pack registry + built-in `b2b-sdr`. A **pack** = compliance gate + prompt files over the existing seams; no new orchestration path. `runCampaign` resolves `input.pack ?? "b2b-sdr"`. |
| `pipeline.ts` | `runResearch()/runEnrich()` (fixed connector order, per-connector deadline, `failedConnectors` kept apart from `skipped`) and `runCampaign()` (per-lead failure isolation into `run.errors`, fail-closed gate, draft guard, footer, validate → record). Shared with MCP: `applyMessageCompliance`, `finalizeDraft`, `campaignGate`, `deriveRunStatus`, `normalizeDomain`, `loadProfileRef`. |
| `providers.ts` | Vercel AI SDK wrapper (`generateText` + `Output.object`). Providers: anthropic, openai, minimax (OpenAI-compatible, JSON mode + `minimax.ts` middleware), xai. `SUPPORTED_PROVIDERS` is **derived** from `evals/supported.ts`. |
| `seam.ts` | `scoreLead()` + `draftMessage()`, the ONLY LLM calls. Builds prompts from allowlisted fields, fences connector data as escaped JSON in `<lead_data>`-style tags, grounds score angles, bounds tokens and time. The drafter may **decline** an out-of-ICP lead; a decline is a `DraftRejectedError` (`"declined: …"`) recorded in `run.rejectedDrafts`, never sent. |
| `draft-guard.ts` | Pure `guardDraft()` (rejects urls/emails/phones absent from the inputs, over-long body or subject, CR/LF or fake `Re:` subjects, stock openers) and `groundAngles()`. A failing draft lands in `run.rejectedDrafts`. |
| `footer.ts` | Pure `applyComplianceFooter()`: the CAN-SPAM footer, appended **in code** from the profile `sender`. |
| `profiles.ts`, `render/` | Report Profiles (including `sender`) and the escaped renderers (CSV formula, `.eml` header, HTML, Slack). |
| `routing.ts`, `rate-limit.ts` | The provider layer's runtime controls, all fixed configuration (never the LLM): capability routing (`first-hit` waterfall / `ordered-fallback` / `all`, from a pack's `dataSources`), a per-run `CreditBudget` charged before each paid call (exhausted ⇒ no further paid calls; recorded in `run.credits`), a response cache (`MemoryResponseCache`, `FileResponseCache` 0600) for connectors that declare `cacheTtlMs`, and per-connector token-bucket limits enforced in `httpJson` (`rateLimit`). |
| `cost.ts`, `prompts.ts` | `CostMeter` (real AI SDK v7 usage, cache-aware). `loadPrompt` returns `{text, sha256}`; `promptRef()` = `"<file>@<sha8>"`. |

Standalone libraries live under `packages/` (npm workspaces; the engine itself stays at the repo root,
which is the plugin root): `packages/deal-math` is pure deal math (integer cents, basis points, half-even,
explicit assumptions, zod only, CI-guarded in `tests/architecture.test.ts`).

Outside the spine: `mcp/tools.ts` holds every MCP handler (`server.ts` is a thin stdio entrypoint);
`evals/supported.ts` holds the approved `{provider, model}` records and `evals/promote.ts` the promote flow.

## Load-bearing invariants (enforced by `.github/workflows/policy.yml`)

**Treat them as architectural: get approval before changing.**

1. **No un-validated model output reaches storage.** Three layers: the type brand (`RunStore.saveRun`
   accepts only `Validated<CampaignRun>`, minted solely by `validator.ts`); `saveRun` **re-validates at
   runtime** with `assertCampaignRun` and persists that output; validated records are deep-frozen. CI runs
   `npm run typecheck` and rejects any `as Validated` / `as unknown as Validated` cast in `pipeline_core/`,
   `mcp/` and `cli.ts` outside `validator.ts`.
2. **Zero Google dependency.** No import of google / firebase / firestore / vertex / `@google-cloud` /
   secretmanager / aiplatform in `pipeline_core/` or `mcp/` (CI greps import lines). The Google model
   adapter and `@ai-sdk/google` were **removed** (owner decision, 2026-10-04); do not re-add them.
3. **`store.ts` never imports the model/provider layer** (separation).
4. **No framework bloat** (LangChain/LlamaIndex/Genkit): use the Vercel AI SDK.
5. **Determinism:** connectors are called in fixed registration order; the LLM does not choose which API to
   call. Asserted in `tests/pipeline.test.ts`.
6. **Schema bumps are additive + backward-readable.** The schema is at **v6**. `schemaVersion` is a
   `z.union` built from `SUPPORTED_SCHEMA_VERSIONS`, **never** a single `z.literal`: `store.ts` re-validates
   every JSONL line on read, so a re-literal would silently drop every older run. New fields are
   `.default(...)` or optional. The golden fixture `tests/fixtures/runs.legacy.jsonl` (v1 and v2 lines,
   including the legacy `pending`/`drafted` statuses) must keep parsing; asserted in `tests/packs.test.ts`
   and `tests/store.test.ts`. Older binaries cannot read newer runs, so fix forward rather than revert.

## Working in this repo

### Adding a data connector

Write `pipeline_core/connectors/<name>.ts` implementing the `Connector` interface (copy `apollo.ts` as the
reference). Use `httpJson` (from `../http.js`), read keys with `useSecret` (from `./_shared.js`, which also
registers the key for redaction), loop contacts with `forEachContact`, check vendor responses with
`parseVendor`, and keep only allowlisted B2B fields with `pickAllowed`. Declare the provider-layer facts on the
connector: `capabilities`, `queryKinds`, `creditsPerCall` (charged against the run budget), `cacheTtlMs`
(opt into the response cache) and `rateLimit` (pass it to every `httpJson` call as `{ key: name, ...rateLimit }`). Never read `process.env` directly,
never import a cloud SDK, and forward the context `signal` to `httpJson`. Register it in
`connectors/index.ts` (order = call order: free → paid → legacy → enterprise). Add fixtures. Users can also
`registerConnector()` their own at runtime. Connector landscape: `000-docs/018-DR-LAND`.

### Adding a model provider

Approval is **per model**, recorded in `evals/supported.ts`. `SUPPORTED_PROVIDERS` is derived from it, so
never hand-edit that list. A new provider needs an adapter in `providers.ts` (`ProviderName`,
`DEFAULT_MODEL`, a dynamically imported optional `@ai-sdk/*` dependency). To approve a model, run with a
real key: `npm run evals:promote -- --provider <name> --model <id>` (keyed harness, repeat ≥3, every
fixture must pass every run). On a pass it writes `evals/results/<record>.json` and upserts a
`verified: true` entry in `supported.ts`; commit both. It never changes `DEFAULT_MODEL`: that is a separate
reviewed edit, and the script prints the line. `INTENT_OUTREACH_ALLOW_UNGATED=1` overrides the gate for
local testing. See `evals/README.md`.

### Adding a vertical pack

Write `pipeline_core/packs/<name>.ts` implementing the `Pack` interface (copy `b2b-sdr.ts`): an `id`, a
`compliance` gate (compose `../compliance` for DNC/TCPA/geofence, or use `noopCompliance`), and `prompts`
(score files + draft file resolved via `loadPrompt`). Register it in `packs/index.ts`, or `registerPack()`
your own at runtime. `runCampaign({ pack: "<id>" })` selects it; an unregistered id fails loud. Rules:

- The gate receives a `ComplianceContext` of `{lead, contact, now, enrichments}`. `enrichments` holds the
  lead's and this contact's records (phones, addresses) that DNC/TCPA/zip checks need.
- The **engine** enforces fail-closed: only exactly `{status: "clean"}` passes. Any other verdict blocks
  (`reason ?? "non-clean-verdict"`); a gate that throws blocks with `gate-error: <msg>` and is logged in
  `run.errors`. Blocked contacts go to `run.blockedContacts` and are never drafted.
- The local **suppression list runs ahead of every pack's gate** (`composeGates(suppressionGate, pack)`),
  so swapping packs can never drop an opt-out.
- The **CAN-SPAM footer is applied in code** after the draft validates (`footer.ts`), never by the prompt.
  An email draft without a complete profile `sender` gets no footer, `needsSenderIdentity: true` and a run
  warning.
- The gate must stay **pure + clock-injected**: a live data lookup goes in a BYOK enrich connector.
- Pack v2 `draftRules` (e.g. `fairHousingDraftRule`) run inside `guardDraft` on **every** drafting path
  (seam and `save_run`); a rule that throws rejects the draft. `channels` tightens send-time policy.

The MCP `save_run` tool applies **the same chain** (suppression → pack gate → `guardDraft` → footer →
re-validate) to agent-written drafts through `applyMessageCompliance`, and rejects a `contactKey` that
matches no contact. Do not add a persistence path that skips it.

### Commands

```bash
npm install
npm run typecheck                 # tsc --noEmit (also the storage invariant gate)
npm test                          # vitest
npm run bundle                    # → bundle/cli.mjs + bundle/server.mjs: what ships; commit them (CI checks freshness)
npm run build                     # tsc → dist/ + prompts copy; a CI build check only, nothing ships from dist/
npm run mcp                       # run the MCP server on stdio (tsx)
npx tsx evals/run.ts --offline    # free WIRING CHECK (CI); says nothing about model quality
npm run evals                     # keyed eval harness (anthropic, repeat 3); writes evals/results/
npm run evals:promote -- --provider <p> --model <id>   # approve a model (keyed, costs money)
```

Any change under `pipeline_core/`, `mcp/` or `cli.ts` needs `npm run bundle` and the rebuilt `bundle/`
committed. Stack: TypeScript/Node (ESM), zod, Vercel AI SDK (`ai` + `@ai-sdk/*`),
`@modelcontextprotocol/sdk`, esbuild, vitest. Runtime rationale: `000-docs/017-AT-DECR` (D5).

## Docs & conventions

Docs live in `000-docs/` under `NNN-CC-ABCD-description.md`; start at `000-docs/000-INDEX.md`. Current docs
are `017`–`022`. `001`–`016` and `023`–`030` (pre-rebuild files renumbered to fix number collisions) describe
the retired Gemini-on-Vertex system and are historical; loose pre-rebuild files live in `000-docs/archive/`.
Key current docs: `017-AT-DECR` (rebuild decision record), `018-DR-LAND` (connector landscape),
`021-AT-PLAN` (hardening plan), `022-AA-AACR` (hardening after-action review and open follow-ups).

## Testing SOP

This repo follows the Intent Solutions testing SOP (vendored `@intentsolutions/audit-harness` in
`.audit-harness/`, CLI at `scripts/audit-harness`). Run `scripts/audit-harness verify`; re-pin with
`scripts/audit-harness init` after reviewed edits to governed files.
