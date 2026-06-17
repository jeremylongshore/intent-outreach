# 000-INDEX — Intent Outreach Documentation Index

**Last Updated:** 2026-06-16
**Purpose:** Map of the docs in this directory. For current state, prefer the highest-numbered docs;
everything from `001`–`016` predates the rebuild and describes the retired Gemini-on-Vertex
"PipelinePilot" system — kept for history only.

---

## Current (the rebuild)

The product is **Intent Outreach** — a model-agnostic, Claude-Code-native SDR orchestrator
(TypeScript/Node, zero Google dependency, local-only, BYO keys). Start here:

- **`017-AT-DECR-rebuild-intent-outreach.md`** — the ISEDC Decision Record for the rebuild: the
  canon-thinker positions (Hickey / Thompson / Karpathy / Huyen) verbatim, the synthesis, the resolved
  decisions (D1–D5), the target architecture, and the acceptance criteria. **The canonical "why".**
- **`018-DR-LAND-b2b-data-provider-landscape-2026.md`** — the 2026 connector landscape: which data
  providers are viable BYO-key, the corrected endpoints/auth, and the shipped connector roster.

For how the system works and how to run it, read the repo root:
- `README.md` — install (plugin + CLI), keys, architecture-in-one-screen.
- `CLAUDE.md` — architecture, the load-bearing invariants, and how to add a connector / promote a provider.

---

## Historical (pre-rebuild — Gemini on Vertex AI Agent Engine)

These document the original PipelinePilot system that the rebuild **replaced and removed** (Vertex Agent
Engine, Firebase Functions/Firestore, the Next.js dashboard, the Gemini single-orchestrator design, the
billing scaffold). They are retained only as a historical record — do **not** treat them as current.

| Range | Topic (historical) |
|---|---|
| `001`–`004` | Migration audit, Vertex-ADK architecture decision, Secret Manager, framework comparison |
| `005`–`008` | Cloudpickle lessons, deployment runbook, migration AAR, Agent Engine multi-tool limitation |
| `009`–`014` | Production/dashboard deployment reports, GCP setup, quick reference, exec briefs |
| `015`–`016` | Autonomous-decision diagnosis, orchestration-fix AAR |

If a claim in `001`–`016` contradicts `017`/`018`, the README, or `CLAUDE.md`, the latter win.
