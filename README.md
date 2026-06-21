# Intent Outreach

**AI outbound prospecting for founders who do their own selling — research → enrich → outreach, in
Claude Code, with your own model.**

Intent Outreach is a model-agnostic, Claude-Code-native SDR orchestrator. It researches companies,
enriches the leads, and drafts personalized outreach — running **fully on your machine**, with **your
own** data-provider and model keys, and **zero Google dependency**. Claude is the default model; bring
an OpenAI / Grok / Gemini key once it's passed the eval gate.

> Built for technical founders / indie SaaS & AI startups who do their own outbound — no SDR
> headcount, no per-seat data tools, you own your keys and your data.

---

## Why it's different

- **Local-only.** Runs on your machine. No hosted database, no telemetry, no server-side retention.
  Run records go to a local JSONL file (`~/.intent-outreach/runs.jsonl`).
- **BYO keys.** Connector + model keys live in your environment (or a local file). They're read
  locally and sent only to each provider's own API — never to us, never to a cloud secret store.
- **Deterministic where it matters.** Connectors are called in a fixed order in code; the model is
  called only at two seams (fit-scoring, drafting). The LLM never decides which API to hit.
- **A real data model + a hard gate.** Every record is a validated value type. Un-validated model
  output **cannot** reach storage — it's a compile error, and a CI invariant.
- **Model-agnostic, but earned.** A provider is "supported" only after it passes golden evals. No
  silent-quality surprises from a weak model dropping a tool call.
- **Pluggable connectors.** Ships adapters for Apollo, Hunter, People Data Labs, Exa, Crunchbase,
  LeadMagic, Clay, Clearbit, and ZoomInfo — and a registry so you can add your own in one file.

## Two ways to run it

### 1. Claude Code plugin (primary)

```text
/plugin marketplace add jeremylongshore/intent-outreach
/plugin install intent-outreach@jeremylongshore
```

Then invoke the skill (`/intent-outreach`) with an ICP and some domains. The skill drives the bundled
**Intent Outreach MCP server** through deterministic Research → Enrich → Outreach phases, checkpoints
with you between each, drafts grounded messages, and saves a **validated** run locally.

The plugin also ships:

- **Phase sub-agents** — the orchestrator skill dispatches one per stage via the `Task` tool:
  `outreach-researcher` (Phase 1, one per domain — fan-out), `outreach-enricher` (Phase 2),
  `outreach-drafter` (Phase 3, grounded score + draft). Each keeps its own context and calls only the
  deterministic MCP tools for its stage; the orchestrator aggregates and checkpoints with you.
- **Companion skills (slash commands)** — `/outreach-connectors` (which data connectors are
  configured), `/outreach-research` (quick Phase-1-only research without a full campaign),
  `/outreach-profile` (inspect or scaffold a Report Profile). Each is a focused, user-invocable skill.
- **A `SessionStart` hook** that prints a one-line connector-readiness status.

### 2. Standalone CLI

```bash
npm install                    # only needed to develop/regenerate; the bundle is committed
node bundle/cli.mjs run --icp "B2B SaaS founders doing their own outbound" \
                        --domains acme.com,globex.com --channel email
node bundle/cli.mjs connectors   # which connectors are configured
node bundle/cli.mjs providers    # model providers + eval-gate status
```

`bundle/cli.mjs` and `bundle/server.mjs` are committed, dependency-inlined builds (so the plugin runs
on a fresh clone with no `node_modules`); regenerate them with `npm run bundle`.

## Keys (bring your own)

Set only the providers you want; unset connectors are silently skipped. **Apollo + Hunter both have
free tiers, so a full campaign can run for $0.**

| Env var | Provider | Tier |
|---|---|---|
| `APOLLO_API_KEY` | Apollo.io — company, people, enrichment | free (50/mo) |
| `HUNTER_API_KEY` | Hunter.io — email finding/verification | free (50/mo) |
| `PDL_API_KEY` | People Data Labs — person/company enrichment | free (100/mo) |
| `EXA_API_KEY` | Exa — web research context | free (1k/mo) |
| `CRUNCHBASE_API_KEY` | Crunchbase — funding/investors | paid |
| `LEADMAGIC_API_KEY` | LeadMagic — email + mobile finding | paid |
| `CLAY_API_KEY` + `CLAY_WEBHOOK_URL` | Clay — middleware (push-only) | paid |
| `CLEARBIT_API_KEY` | Clearbit — enrichment | legacy (pre-2024 keys only) |
| `ZOOMINFO_JWT` | ZoomInfo — enrichment | enterprise |
| `ANTHROPIC_API_KEY` | Claude (default model) | — |
| `OPENAI_API_KEY` / `XAI_API_KEY` / `GEMINI_API_KEY` | alternate models (eval-gated) | — |

To drive a non-Anthropic model from inside Claude Code, point `ANTHROPIC_BASE_URL` at an LLM gateway
(LiteLLM/Bifrost). See `000-docs/017-AT-DECR`.

## Architecture (one screen)

```
Claude Code skill  ─┐                      ┌─ research_domain ─┐
  (deterministic    ├─► Intent Outreach ───┤  enrich_lead       ├─► pipeline_core
   R→E→O phases)    │     MCP server       └─ save_run ─────────┘   (framework-free)
standalone CLI ─────┘                                                │
                                                                     ├─ connectors/ (registry; 9 adapters)
  research() → enrich()  : deterministic, fixed connector order      ├─ providers.ts (Vercel AI SDK; eval-gated)
  score() → draft()      : the ONLY LLM calls (structured output)    ├─ validator.ts (the gate: Validated<T> brand)
  validate → save        : un-validated output can't be stored       └─ store.ts (local JSONL; never hosted)
```

- **`pipeline_core/`** — the framework-free spine (CI-guarded against any Google/cloud import).
- **`mcp/server.ts`** — one stdio MCP server, thin wrapper over `pipeline_core`.
- **`skills/intent-outreach/SKILL.md`** — the orchestrator skill; dispatches phase agents in fixed order.
- **`skills/outreach-{connectors,research,profile}/`** — focused companion skills (the slash commands).
- **`agents/`** — phase sub-agents (`outreach-researcher`, `outreach-enricher`, `outreach-drafter`).
- **`hooks/`** — `SessionStart` connector-readiness hook.
- **`prompts/`** — versioned, eval-gated prompt files.
- **`evals/`** — golden fixtures + scorers; the supported-provider gate.
- **`profiles/`** — Report Profiles: declarative output customization (starter profiles included).

## Develop

```bash
npm install
npm run typecheck      # tsc --noEmit
npm test               # vitest
npm run build          # → dist/ (also copies prompts/)
npm run mcp            # run the MCP server on stdio (tsx)
npx tsx evals/run.ts --offline   # the free, deterministic eval gate
```

## License

Intent Solutions Proprietary — see `LICENSE`.
Built by Jeremy Longshore · intentsolutions.io
