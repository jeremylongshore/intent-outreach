# 017-AT-DECR — Rebuild PipelinePilot → "Intent Outreach"

**Type:** Architecture Decision Record (ISEDC Executive-Council format)
**Status:** RATIFIED — implementation authorized
**Date:** 2026-06-16
**Author:** Jeremy Longshore (intentsolutions.io)
**Supersedes (in spirit):** `003-AT-ADEC-adopt-vertex-adk.md`, `008-TQ-KNOW-agent-engine-limitations.md` (the Vertex/Gemini-locked design)
**Decision owner / acting head of board:** Jeremy Longshore

---

## 0. One-paragraph decision

PipelinePilot — a single **Gemini** agent locked inside **Vertex AI Agent Engine**, fronted by Firebase
Functions + Firestore + a Next.js dashboard — is rebuilt into **Intent Outreach**: a **model-agnostic,
Claude-Code-native SDR orchestrator** shipped as **one Claude Code plugin + one bundled MCP server**
sharing a framework-free TypeScript core (`pipeline_core`). The product runs **fully on the user's own
machine** with **zero Google dependency**, **local-only state**, and **BYO keys**. Control flow is
**deterministic** (connectors called in fixed order in code); the model is called only at the three phase
seams (fit-score, draft) and **no un-validated model output ever becomes a record**. Model-agnosticism is
gated by an **eval harness**: a provider is "supported" only after it passes golden fixtures at each seam.
Claude is the default.

---

## 1. The decision was run through the Executive Council

The owner's standing ask — *"run this decision through the Executive Council"* — is satisfied and persisted
by this AT-DECR. The decision is the conglomerate of three independent passes, all preserved below verbatim
or in faithful summary:

1. A **3-agent research sweep** (codebase coupling · plugin ecosystem · model-agnostic + naming).
2. A **4-seat canon-thinker review** (Hickey · Thompson · Karpathy · Huyen) — §3, verbatim positions.
3. An **Executive-Council synthesis** reconciling the four into one buildable plan — §4.

Per ISEDC discipline, **dissent is preserved, not suppressed.** Where the thinkers split (how much
persistence/service to keep), the minority position is steel-manned in §4 and reflected in the design
(persistence is an adapter, not a deletion).

---

## 2. Context — what we are changing and why

PipelinePilot ran a Research → Enrich → Outreach lead-gen workflow over Clay/Apollo/Clearbit/Crunchbase.
Its problems, as found:

- **Locked to Google.** Model (Gemini), runtime (Vertex Agent Engine), secrets (GCP Secret Manager), and
  persistence (Firestore) are all GCP-coupled. A user cannot "walk up and use it" without a Google account.
- **A Vertex workaround as architecture.** Agent Engine rejects agents with 2+ non-search function tools at
  query time, forcing a single-agent-all-tools collapse where the **LLM chooses which API to call** —
  stochastic control flow for what is deterministic glue.
- **No data model.** The prompt *is* the schema; raw LLM JSON is spread unvalidated into Firestore
  (`contacts` is even written as `enriched_leads`).
- **No evals.** Zero evaluation on model-written outreach going out under a customer's domain.
- **Ceremony.** ~120 lines of real work (4 HTTP calls + 1 prompt) wrapped in 3 duplicate connector trees,
  3 dead deploy scripts, multi-agent sub-engines, a dashboard, and an action-counting/billing scaffold.

The owner's three asks: **(1)** a better, SEO-realistic name; **(2)** model-agnostic operation (Claude by
default, BYO OpenAI/Grok/Gemini); **(3)** a Claude Code plugin + skill so the product lives where its users
already are — plus a ruling on refactor vs. plugin vs. new repo.

---

## 3. Canon-thinker review — verbatim positions

> Preserved as the durable record of *why*, per the owner's preference that future readers see the original
> reasoning, not just the conclusion.

### 3.1 Rich Hickey — *Verdict: Option C, data-model-first*

> There is no data model — the prompt *is* the schema, and raw LLM JSON is spread unvalidated into Firestore
> (`contacts` is even written as `enriched_leads`). Define five framework-free value types first (Lead,
> Contact, Enrichment, Message, CampaignRun). The probabilistic system must never write the system of
> record — a deterministic, versioned **validator** decides what becomes a record.

### 3.2 Ken Thompson — *Verdict: Option A, retire Vertex/Firebase*

> The product is ~120 lines (4 HTTP calls + 1 prompt) wrapped in ceremony. Delete the 3 duplicate connector
> trees, the 3 dead deploy scripts, Secret Manager (→ env vars), the multi-agent sub-engines, and **the
> action-counting/billing scaffold** (refused outright).

### 3.3 Andrej Karpathy — *Verdict: Option A-minus*

> Zero evals on model-written outreach is the headline. The single-agent-all-tools collapse is a Vertex
> workaround — drop it; make control flow deterministic and call the LLM only at the three phase seams. In
> the plugin, use **one skill with deterministic phases, NOT Agent-tool fan-out** (fan-out reintroduces
> stochastic control flow). Extract prompts to versioned, eval-gated files.

### 3.4 Chip Huyen — *Verdict: Option B, audit trail matters*

> "BYO any key" with no gate is a silent-quality trap — a weak Grok/GPT run drops a tool call, produces
> enrichment-free outreach under the customer's domain, "succeeds," and you learn from churn. Cross-provider
> tool-calling is 4 incompatible dialects. **Build a per-provider eval harness that gates the
> supported-provider list before model-agnosticism is a promise.** Keep a durable run record.

---

## 4. Executive-Council synthesis (the reconciliation)

All four converged on the diagnosis; they split only on **how much persistence/service to keep**. The
synthesis treats these as *the same design plus an argument about the backend*:

1. **Internal `pipeline_core` module** (Hickey): framework-free value types + a deterministic Research→Enrich
   pipeline (connectors called in fixed order **in code**, not chosen by the LLM) + a single LLM seam for
   fit-scoring/drafting behind a provider protocol + a **validator** that gates what becomes a record.
2. **Provider-pluggable LLM seam.** Because connector calls are now deterministic glue, the hard
   *cross-provider tool-calling* problem collapses into the easier *cross-provider structured-output*
   problem.
3. **The eval harness IS the model-agnostic story** (Karpathy + Huyen): golden fixtures at each phase seam,
   run across providers; a provider is "supported" only if it passes. Claude is the default.
4. **Persistence is an adapter** (reconciles Thompson ↔ Huyen): a **run record is mandatory** (Huyen), but
   its backend is pluggable and **defaults to a local file** (Thompson — no GCP). Postgres/SQLite/Firestore
   are optional adapters, not dependencies. *This is where the only real dissent is resolved: we keep the
   record Huyen demands while honoring Thompson's "no hosted DB" by making the default a local JSONL file.*
5. **Primary surface = one Claude Code plugin** — orchestrator skill + deterministic phases + connectors via
   a bundled MCP server (Karpathy: no subagent fan-out). Retire Vertex Agent Engine, Firebase Functions, and
   the Next.js dashboard as the primary path. **Cut the billing scaffold** (Thompson, refused outright).

---

## 5. Hard constraints (non-negotiable)

- **Zero Google dependency.** No Firebase, Firestore, Vertex, or GCP Secret Manager — nothing requiring a
  Google account or that phones home to Google. The product runs fully on the user's own machine.
- **Local-only state.** Persisted runs go to the **user's own local store** (JSONL default, optional local
  SQLite) — never a hosted/managed database. No telemetry, no server-side retention.
- **BYO keys, in the user's environment.** Connector keys + the model key live in the user's env/local
  config; the plugin reads them locally and transmits them only to the provider/SaaS API itself.

---

## 6. Resolved decisions

| ID | Decision | Resolution |
|----|----------|-----------|
| **D1** | Product name | **"Intent Outreach"** (two words); repo + plugin slug `intent-outreach`. "Intent" doubles as the GTM term *buyer intent*; "Outreach" names the job. Collision-checked vs. intent-*data* incumbents (IntentData.io, Intently.ai, Intentsify, Bombora/6sense/Demandbase) — we are a prospecting *agent*, not a data vendor. |
| **D-positioning** | Go-to-market | Horizontal name; **niche-first launch at technical founders / indie SaaS & AI startups who do their own outbound** (beachhead A). Distribution (Claude Code plugin, BYO model key, terminal-native) self-selects this ICP. |
| **D2** | Product surface | **Plugin-first:** one Claude Code plugin + one bundled MCP server, local run records; retire Vertex/Firebase/dashboard. SaaS-service is a later bet, not now. |
| **D3** | Repo strategy | **Rename in place** to `intent-outreach`; keep git history + AARs; prune old Vertex/TS code on the `rebuild/intent-outreach` branch. |
| **D4** | Cross-provider posture | **Claude-first now;** OpenAI/Grok/Gemini added one at a time as each passes the golden-eval gate. |
| **D5** | Rebuild runtime | **TypeScript/Node** (4-engineer panel: TS 88% pick). Wins the two hardest requirements: (1) the **Vercel AI SDK** gives unified cross-provider tool-calling + `generateObject` structured output as a library (solves Huyen's concern); (2) clean install via npx / single-file build, Node-native plugin ecosystem (no venv/dependency hell). Data model via **zod**; bundled MCP server `mcp/server.ts`. Eval ecosystem via `promptfoo` (Node-native). |
| **D-reports** | Output customization | Declarative **Report Profiles** (local files, markdown-first SSoT, multi-format render + local delivery) with an NL generate/patch path; ship 3–5 starter profiles. |

---

## 7. Target architecture

```
intent-outreach/                    (renamed repo; plugin slug intent-outreach)
├── .claude-plugin/plugin.json       Claude Code plugin manifest
├── .mcp.json                        registers the Intent Outreach MCP server (stdio, local)
├── mcp/server.ts                    ONE MCP server exposing connector tools; thin wrapper over pipeline_core
├── skills/intent-outreach/SKILL.md  orchestrator: deterministic R→E→O phases, checkpoints; calls MCP tools
├── pipeline_core/                   framework-free TS module (NO google/firebase imports — CI-guarded)
│   ├── models.ts                    Lead / Contact / Enrichment / Message / CampaignRun (zod)
│   ├── connectors/                  ONE canonical connector per platform
│   ├── secrets.ts                   getSecret(name): env (default) | local file — NO cloud secret store
│   ├── pipeline.ts                  deterministic research()→enrich(); LLM seam = score()+draft()
│   ├── providers.ts                 LLMProvider (Anthropic default; OpenAI/Grok/Gemini behind eval gate)
│   ├── validator.ts                 raw LLM output → validated record (gate before persist)
│   └── store.ts                     RunStore: local JSONL (default) | local SQLite — never hosted
├── prompts/                         versioned, eval-gated prompt files (research/enrich/outreach .md)
├── evals/                           golden fixtures + rubric scorers, run across providers (CI gate)
└── 000-docs/                        this AT-DECR + AARs
```

**Flow:** install plugin → skill invokes MCP tools (fetch via SaaS APIs) → **validate** → model molds into a
`Message` → write to local `RunStore`. Connector keys via env-var BYO keys read locally by the MCP server.
Model via env (`ANTHROPIC_API_KEY` default; `OPENAI_API_KEY`/`XAI_API_KEY`/`GEMINI_API_KEY` switch provider;
`ANTHROPIC_BASE_URL` gateway documented for driving non-Anthropic models from inside Claude Code).

---

## 8. Consequences

**Positive:** runs anywhere with Node + keys; no cloud bill or Google account; deterministic and testable
control flow; a real data model + validator; evals make "model-agnostic" a verifiable claim, not marketing;
lives where the ICP already is (Claude Code).

**Negative / accepted:** loses the hosted dashboard as a primary surface (acceptable — beachhead ICP is
terminal-native); cross-provider parity is *earned per provider* through the eval gate, not assumed (by
design); Crunchbase/Clearbit/SalesNav/ZoomInfo access for a BYO-key indie user is a known risk being
verified by a research sweep at rebuild time — connectors that prove inaccessible become "unsupported
placeholders" rather than broken promises.

**Invariant promoted to CI** (replaces the old `google.adk`/Vertex guards): **no un-validated model output
reaches storage.** Policy CI fails any change that writes raw model output to a record without passing
through `pipeline_core/validator.ts`.

---

## 9. Build order (epics)

`E0` decision record + rename + scaffold + demolition → **`E1` data model + validator + store** (Hickey step
zero) + **`E2` connectors + MCP server + secrets** → **`E3` deterministic pipeline + provider seam** (critical
path) → `E4` eval harness · `E4.5` report profiles · `E5` plugin surface (after E3) → `E6` gated provider
rollout (post-v1) → `E7` retire GCP + docs. Tracked as bead epics under prefix `io` with the three-layer
mirror.

---

## 10. Acceptance (the rebuild is "done" when all hold)

1. **Model-agnostic gate works** — `evals/` fixtures pass for Claude; cross-provider runner produces a scored
   report; the supported-provider list is gated on it.
2. **Plugin runs a full campaign locally** — `/plugin install intent-outreach@jeremylongshore`, invoke the
   skill with an ICP + domains → Research→Enrich→Outreach → a **validated** `CampaignRun` in the local JSONL
   `RunStore`.
3. **No GCP required** — whole flow runs on BYO env keys only; no Secret Manager / Firestore / Firebase /
   Vertex importable in `pipeline_core/`.
4. **BYO non-Claude key** — a campaign runs on a non-Anthropic key (gateway or adapter) and still passes the
   validator.
5. **Invariant enforced** — policy CI fails any change writing un-validated model output to a record;
   audit-harness verify passes.
6. **Determinism check** — Research/Enrich produce the same connector call sequence across runs for the same
   input (the LLM no longer chooses which API to call) — asserted in a `pipeline_core` test.

---

*Decision Record filed per Document Filing Standard v4.3. Canon-thinker positions preserved verbatim for
future readers.*
