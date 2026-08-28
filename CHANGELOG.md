# Changelog

All notable changes to Intent Outreach are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project aims for
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] — 2026-08-27


### Added
- **OpenAI (gpt-4o) promoted through the provider eval gate** — passed all 7
  golden fixtures (`npx tsx evals/run.ts --providers openai`, 2026-08-20) and is
  now in `SUPPORTED_PROVIDERS`. BYO `OPENAI_API_KEY` runs unguarded; Grok/Gemini
  adapters remain gated until an eval run with a real key passes.

- **Vertical pack seam + compliance module** (PR #16): `pipeline_core/packs/`
  (registry + built-in `b2b-sdr`) composes a pure, clock-injected, fail-closed
  compliance gate (DNC scrub, TCPA quiet hours, service area —
  `pipeline_core/compliance/`) with versioned prompts over the same engine.
  The gate runs before drafting; blocked contacts are recorded on
  `run.blockedContacts`, never drafted. `schemaVersion` 2 added as an additive
  union member (old runs still parse).
- **Plugin re-architecture as orchestrator + phase sub-agents** (PR #19): the
  `/intent-outreach` skill dispatches `outreach-researcher` (per-domain fan-out),
  `outreach-enricher`, and `outreach-drafter` agents; companion slash-command
  skills (`/outreach-connectors`, `/outreach-research`, `/outreach-profile`) and
  a SessionStart connector-readiness hook ship alongside.

### Changed
- Dependencies: Vercel AI SDK v4 → v6 (PR #22, clears all npm-audit findings),
  zod v3 → v4 (PR #23), actions/setup-node v6 (PR #21).
- Seam output schemas are now strict-structured-output compatible across
  providers: `ScoreOutput.angles` is required (was `.default([])`) and
  `DraftOutput.subject` is required-but-nullable (was `.optional()`) — OpenAI's
  json_schema strict mode rejects any property missing from `required`, which
  the eval gate caught on the first real openai run. `null` maps back to
  "no subject" (linkedin) at the Message boundary.
- Governance set: `LICENSE` (Intent Solutions Proprietary), `CONTRIBUTING.md`,
  `CODE_OF_CONDUCT.md`, `SECURITY.md`, `SUPPORT.md`, `.editorconfig`,
  `.gitattributes`, PR template, `CODEOWNERS`, `dependabot.yml`, and a node CI
  workflow (`ci.yml`) alongside the existing policy-enforcement workflow.

## [0.1.0] — 2026-06-16

Rebuild of PipelinePilot (a Gemini-on-Vertex SDR agent) into **Intent Outreach**:
a model-agnostic, Claude-Code-native SDR orchestrator. TypeScript/Node, fully
local, BYO keys, zero Google dependency.

### Added
- `pipeline_core/` — framework-free spine: zod data model, a `Validated<T>`
  validator gate, local JSONL run store, env-only secrets, deterministic
  research/enrich pipeline, provider-pluggable LLM seam (Vercel AI SDK), and a
  full `runCampaign`.
- Connector registry with 9 adapters (Apollo, Hunter, People Data Labs, Exa,
  Crunchbase, LeadMagic, Clay, Clearbit, ZoomInfo) — each self-skipping without
  its key; users can register their own.
- Intent Outreach MCP server (stdio) with `list_connectors`, `research_domain`,
  `enrich_lead`, and `save_run` (validates before persisting).
- Claude Code plugin: orchestrator `SKILL.md` (deterministic phases) + manifest.
- Standalone `intent-outreach` CLI.
- Cross-provider eval harness (`evals/`) — the supported-provider gate.
- Report Profiles (`profiles/`) + multi-format renderers (markdown SSoT → CSV /
  JSON / HTML / Slack / email-draft) with local-only delivery.
- Decision record `000-docs/017-AT-DECR`; connector landscape `000-docs/018-DR-LAND`.

### Changed
- Runtime is now TypeScript/Node (was Python ADK). Data model via zod; model
  access via the Vercel AI SDK.
- Policy CI now enforces "no un-validated model output reaches storage" and a
  zero-Google-import guard, replacing the old `google.adk`/Vertex guards.

### Removed
- Vertex AI Agent Engine, Firebase Functions/Firestore, the Next.js dashboard,
  a committed Python venv, the billing/action-counting scaffold, and the GCP
  deploy scripts (all preserved in git history).
