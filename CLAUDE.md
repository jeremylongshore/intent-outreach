# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Intent Outreach Is

A **model-agnostic, Claude-Code-native SDR orchestrator**: research → enrich → outreach over B2B data
providers, drafting personalized cold outreach. It runs **fully on the user's machine**, with **their
own** connector + model keys, and **zero Google dependency**. Claude is the default model.

Two surfaces, one core:
1. **Claude Code plugin** (`skills/intent-outreach/SKILL.md` + bundled MCP server) — the primary surface.
2. **Standalone CLI** (`cli.ts` → `intent-outreach`) — the same pipeline from the terminal.

GitHub: `jeremylongshore/intent-outreach`. This repo was rebuilt from "PipelinePilot" (a Gemini-on-Vertex
agent) — see `000-docs/017-AT-DECR` for the full decision record. **Do not reintroduce Google/Vertex/
Firebase** anywhere.

## Architecture (the part that needs multiple files to see)

```
Claude Code skill ─┐                         ┌─ research_domain ─┐
 (deterministic    ├─► Intent Outreach MCP ──┤  enrich_lead       ├─► pipeline_core/ (framework-free)
  R→E→O phases)    │     server (mcp/)        └─ save_run ────────┘
standalone CLI ────┘
```

`pipeline_core/` is the framework-free spine (no http SDK lock-in, **no Google/cloud imports** — CI-guarded):

| File | Role |
|---|---|
| `models.ts` | The five value types (Lead/Contact/Enrichment/Message/CampaignRun) as **zod** schemas. The data model exists before the pipeline (Hickey). `source` is an open string so custom connectors stamp their own. |
| `validator.ts` | **The gate.** Mints a `Validated<T>` brand only this module can produce. |
| `store.ts` | `RunStore` — local JSONL default (`~/.intent-outreach/runs.jsonl`). `saveRun` accepts **only** `Validated<CampaignRun>`. Never a hosted DB. |
| `secrets.ts` | `getSecret()` = env (default) \| local file. **No cloud secret store.** |
| `connectors/` | Registry + 9 adapters. Deterministic registration order. Each self-skips without its key. |
| `compliance/` | DNC + TCPA quiet-hours + service-area gate (`normalizePhone`, `DncList`, `dncScrub`, `withinQuietHours`, `inServiceArea`). **Pure, clock-injected, fail-closed**, zero imports. A pack supplies it; a live DNC *lookup* belongs in a BYOK enrich connector, never here. |
| `packs/` | Pack registry (mirrors `connectors/`) + built-in `b2b-sdr`. A **pack** = a declarative composition (compliance gate + prompt files) over seams the engine already has — no new orchestration path. `runCampaign` resolves `input.pack ?? "b2b-sdr"`. |
| `pipeline.ts` | `runResearch()/runEnrich()` (deterministic, fixed connector order) + `runCampaign()` (adds the LLM seam, the pack compliance filter before drafting, + the validate→record gate). |
| `providers.ts` | Vercel AI SDK wrapper (`generateObject`). Provider eval-gate lives here (`SUPPORTED_PROVIDERS`). |
| `seam.ts` | `scoreLead()` + `draftMessage()` — the ONLY LLM calls. Output is never trusted directly. Prompt files are pack-supplied (default to today's). |
| `cost.ts` | `CostMeter`. `prompts.ts` loads versioned prompt files. |

## Load-bearing invariants (enforced by `.github/workflows/policy.yml`)

These replace the old `google.adk`/Vertex guards. **Treat them as architectural — get approval before changing.**

1. **No un-validated model output reaches storage.** `RunStore.saveRun` and the `save_run` MCP tool accept
   only `Validated<CampaignRun>`; the brand is minted solely by `validator.ts`. Enforced by the **type
   system** — persisting raw model output is a `tsc` error, not just a review nit. CI runs `npm run typecheck`.
2. **Zero Google dependency.** No import of google / firebase / firestore / vertex / `@google-cloud` /
   secretmanager / aiplatform anywhere in `pipeline_core/` or `mcp/`. CI greps import lines.
3. **`store.ts` never imports the model/provider layer** (separation).
4. **No framework bloat** (LangChain/LlamaIndex/Genkit) — use the Vercel AI SDK.
5. **Determinism:** connectors are called in fixed registration order; the LLM does not choose which API to
   call. Asserted in `tests/pipeline.test.ts`.
6. **Schema bumps are additive + backward-readable.** `CampaignRunSchema.schemaVersion` is a `z.union` of all
   live versions, **never** a single `z.literal` — `store.ts` re-validates every JSONL line on read, so a
   re-literal would silently drop every older run. New fields are `.default(...)` so old lines still parse.
   Asserted in `tests/packs.test.ts`.

## Working in this repo

### Adding a data connector

Write `pipeline_core/connectors/<name>.ts` implementing the `Connector` interface (copy `apollo.ts` as the
reference). Use `httpJson` (from `../http.js`) and `getSecret`/`hasSecret` (from `../secrets.js`) — never
read `process.env` directly, never import a cloud SDK. Register it in `connectors/index.ts` (order = call
order: free → paid → legacy → enterprise). Add fixtures. Users can also `registerConnector()` their own at
runtime. Connector reality (which APIs are viable in 2026) is documented in `000-docs/018-DR-LAND`.

### Adding a model provider

The adapters for OpenAI/Google/xAI already exist in `providers.ts` (dynamically imported, optional deps).
A provider is **gated**: it only runs once added to `SUPPORTED_PROVIDERS`, and it earns that by passing
`evals/` (Claude-first, per D4). To promote one: run `npx tsx evals/run.ts --providers <name>` with a real
key, confirm it passes, then add it to `SUPPORTED_PROVIDERS`. `INTENT_OUTREACH_ALLOW_UNGATED=1` overrides
the gate for local testing.

### Adding a vertical pack

Write `pipeline_core/packs/<name>.ts` implementing the `Pack` interface (copy `b2b-sdr.ts`): an `id`, a
`compliance` gate (compose `../compliance` for DNC/TCPA/geofence, or use `noopCompliance`), and `prompts`
(score files + draft file resolved via `loadPrompt`). Register it in `packs/index.ts` — or `registerPack()`
your own at runtime. `runCampaign({ pack: "<id>" })` selects it; an unregistered id fails loud (no silent
b2b fallback). The compliance gate runs **before** drafting (blocked contacts are recorded in
`run.blockedContacts`, never drafted) and must stay **pure + clock-injected** — a live data lookup goes in a
BYOK enrich connector, not the gate. `b2b-sdr` is the default and is byte-identical to the pre-pack engine.

### Commands

```bash
npm install
npm run typecheck                 # tsc --noEmit (also the storage invariant gate)
npm test                          # vitest
npm run build                     # → dist/ (+ copies prompts/ for runtime loading)
npm run mcp                       # run the MCP server on stdio (tsx)
npx tsx evals/run.ts --offline    # deterministic, free eval gate (CI)
npm run evals                     # promptfoo (keyed)
```

Stack: TypeScript/Node (ESM), zod, Vercel AI SDK (`ai` + `@ai-sdk/*`), `@modelcontextprotocol/sdk`, vitest,
promptfoo. Runtime decision + rationale: `000-docs/017-AT-DECR` (D5). Connector landscape: `018-DR-LAND`.

## Docs & conventions

Docs live flat in `000-docs/` under `NNN-CC-ABCD-description.md`. For current state prefer the
**highest-numbered** docs; anything describing Vertex/Firebase/Gemini predates the rebuild and is historical.
Key current docs: `017-AT-DECR` (rebuild decision record), `018-DR-LAND` (connector landscape).

## Testing SOP

This repo follows the Intent Solutions testing SOP (vendored `@intentsolutions/audit-harness` in
`.audit-harness/`, CLI at `scripts/audit-harness`). Run `scripts/audit-harness verify`; re-pin with
`scripts/audit-harness init` after reviewed edits to governed files.
