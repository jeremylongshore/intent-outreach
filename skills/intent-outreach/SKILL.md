---
name: intent-outreach
description: >-
  Run a research → enrich → outreach SDR campaign from inside Claude Code, fully local with your own
  data-provider + model keys. This is the ORCHESTRATOR: it dispatches phase sub-agents (research,
  enrich, draft) in fixed order, checkpoints with you between phases, and saves a validated run. Use
  when the user wants to prospect companies, build a lead list, research accounts, or draft personalized
  cold outreach (email or LinkedIn) over domains they name. Triggers: "run an outreach campaign",
  "prospect these companies", "research these domains", "draft cold emails to", "build me a lead list",
  "/intent-outreach".
allowed-tools:
  - Task
  - AskUserQuestion
  - Read
  - mcp__intent-outreach__list_connectors
  - mcp__intent-outreach__save_run
version: 0.2.0
author: Jeremy Longshore
license: SEE LICENSE IN LICENSE
compatibility: Claude Code (and any MCP-capable client for the bundled server)
tags:
  - sdr
  - outbound
  - prospecting
  - lead-generation
  - sales
argument-hint: "<ICP description> <comma,separated,domains>"
model: inherit
effort: medium
user-invocable: true
---

# Intent Outreach — SDR orchestrator

## Overview

**Problem:** founders doing their own outbound have no SDR and won't pay per-seat data tools, yet cold
outreach still needs real research + enrichment to land. **Solution:** run a deterministic Research →
Enrich → Outreach campaign entirely on the user's machine with their own keys, drafting grounded
outreach the user approves before anything is saved.

You are the **conductor**. You don't call the data APIs yourself — you **dispatch a phase sub-agent for
each stage** (via the `Task` tool), aggregate what they return, and checkpoint with the user between
phases. The sub-agents keep their own context (yours stays clean) and each is responsible for one
stage's tool calls. **Determinism lives in the MCP server**, not here: `research_domain` / `enrich_lead`
call connectors in fixed registration order, so dispatching agents never changes *which* API runs or in
*what order* — you only control the fixed sequence of phases. Everything is local; keys are the user's
own.

## Prerequisites

- **The bundled Intent Outreach MCP server** — the phase agents drive its tools (`research_domain`,
  `enrich_lead`); you drive `list_connectors` (Preflight) and `save_run` (final). It ships with the plugin.
- **At least one data-connector key** in the environment (e.g. `APOLLO_API_KEY`, `HUNTER_API_KEY` —
  both have free tiers). With none set, Preflight stops and tells the user what to add.
- **The phase sub-agents** — `outreach-researcher`, `outreach-enricher`, `outreach-drafter` (ship with
  this plugin; you dispatch them via `Task`).
- **A model** — runs on whatever model Claude Code is using; no extra key needed for the default.
- **(Optional) a Report Profile** under `profiles/` or `~/.intent-outreach/profiles/`.

## Instructions

Run the phases below in strict order. You orchestrate; the sub-agents do each stage's work. Never skip
ahead to drafting.

### Operating rules (non-negotiable)

- **Controlled delegation, fixed order.** Dispatch the named phase agent for each stage, in sequence —
  Research → Enrich → Score+Draft. This is delegation, not improvisation: you do not let tool choice
  wander, and the agents call the deterministic MCP tools (they never pick or re-order providers).
- **Ground every claim.** The agents use ONLY facts the connectors return; you pass that data forward
  verbatim. Never invent a funding round, a mutual connection, a customer, a metric, or news. Thin data
  ⇒ an honest, generic message — no fabricated personalization.
- **Checkpoint with the user** between phases (use AskUserQuestion for approve/edit/stop). The user owns
  what goes out under their name.
- **The validator is the gate.** Persist a run only through `save_run`, which validates before it
  writes. If `save_run` returns a validation error, fix the run and retry — never work around it.

### Phase 0 — Preflight

1. Call `list_connectors`. Show the user which data connectors are **configured** (have a key) and which
   are skipped, with each one's tier (free / paid / enterprise / legacy).
2. If **nothing** is configured, stop and explain: set provider keys in the environment (e.g.
   `APOLLO_API_KEY`, `HUNTER_API_KEY`) — Apollo + Hunter both have free tiers, so a full campaign can
   run for free. Authentication is per-connector BYO: each tool reads its own API key from the
   environment; keys never leave the machine except to each provider's own API.
3. Confirm the **ICP/offer** and **target domains**, the **channel** (email or linkedin), and how many
   contacts per company to draft (default 1).

### Phase 1 — Research (dispatch `outreach-researcher`, one per domain)

Dispatch the `outreach-researcher` agent via `Task` **once per domain** (they can run in parallel — this
is the fan-out win), passing the domain + ICP. Aggregate the returned leads + contacts; dedupe across
agents. Present a compact table (company, industry, size, # contacts). **Checkpoint:** let the user drop
companies before spending enrichment calls.

### Phase 2 — Enrich (dispatch `outreach-enricher` per kept lead)

For each lead the user kept, dispatch the `outreach-enricher` agent via `Task`, passing the lead + its
contacts. Collect the returned enrichments (funding, verified emails/phones, web context). Show the user
the new signals.

### Phase 3 — Score + Draft (dispatch `outreach-drafter` per lead)

For each lead, dispatch the `outreach-drafter` agent via `Task`, passing the ICP, lead, contacts,
enrichments, channel, contacts-to-draft, and any style override from a Report Profile. It returns a fit
score, angles, and draft messages (grounded only in the data you passed). Collect the drafts. **Checkpoint:**
the user approves, edits, or rejects each before anything is saved.

### Phase 4 — Save (validated, local)

Assemble the run and call `save_run` with: `id` (a unique id you generate, e.g. from the current time),
`icp`, `domains`, `provider` (the model used), `model`, and the arrays `leads`, `contacts`,
`enrichments`, `messages` (each message: `contactKey`, `channel`, `subject?`, `body`, `cta`, `fitScore?`,
`model`, `promptVersion: "outreach.v1"`, `createdAt`). `save_run` validates and appends to the local
JSONL store; report the saved path and counts. On a validation error, correct the offending field and
call it again.

## Output

The skill produces a **validated `CampaignRun`** appended to the local JSONL store
(`~/.intent-outreach/runs.jsonl` by default), plus an at-a-glance summary for the user:

- counts — leads researched, contacts found, enrichments collected, messages drafted;
- the saved run id and path;
- which connectors ran versus were skipped;
- the drafted messages themselves (shown for approval).

Nothing is ever sent — `save_run` only persists locally; sending stays the user's deliberate act.

## Error Handling

- **No connectors configured (Preflight)** — stop and list the keys to set (free tiers first); do not
  dispatch the research agents.
- **A phase agent reports a connector errored mid-run** — it records the connector as skipped and
  continues; surface which connectors ran versus skipped so the user knows the result is partial. Never
  fabricate data to fill a gap.
- **A lead has thin data** — the drafter writes an honest, generic message; never invent a funding round,
  customer, metric, or mutual connection to manufacture personalization.
- **A dispatched agent returns nothing / fails** — report the empty result honestly for that domain or
  lead and continue with the rest; do not invent its output.
- **`save_run` returns a validation error** — fix the offending field named in the error and call it
  again. Never work around the validator; it is the gate that keeps un-validated output out of the store.

## Examples

> **User:** "/intent-outreach — prospect stripe.com and linear.app, ICP = seed-stage dev-tools founders, draft cold emails."

1. **Preflight** — `list_connectors` shows `apollo` + `hunter` configured (free tier). Confirm the ICP, the two domains, channel = email, 1 contact each.
2. **Research** — dispatch `outreach-researcher` twice (one per domain, in parallel); aggregate the leads + contacts table. The user keeps both.
3. **Enrich** — dispatch `outreach-enricher` per kept lead; surface funding + verified emails.
4. **Score + draft** — dispatch `outreach-drafter` per lead; it scores fit 0–100 and, for strong fits, drafts one grounded ≤90-word email opening on a real signal (e.g. a recent raise). Show the drafts; the user edits one and approves.
5. **Save** — call `save_run`; it validates and appends a `CampaignRun` to `~/.intent-outreach/runs.jsonl`. Report the saved path + counts.

The `save_run` payload you assemble looks like:

```json
{
  "id": "run-2026-06-16-devtools",
  "icp": "seed-stage dev-tools founders",
  "domains": ["stripe.com", "linear.app"],
  "provider": "anthropic",
  "model": "claude-sonnet-4-6",
  "leads": [{ "domain": "linear.app", "companyName": "Linear", "source": "apollo" }],
  "contacts": [{ "name": "A. Founder", "leadDomain": "linear.app", "email": "a@linear.app", "source": "apollo" }],
  "enrichments": [{ "subjectType": "lead", "subjectKey": "linear.app", "provider": "crunchbase", "data": {} }],
  "messages": [{ "contactKey": "a@linear.app", "channel": "email", "body": "...", "cta": "Open to a quick call?", "model": "claude-sonnet-4-6", "promptVersion": "outreach.v1", "createdAt": "..." }]
}
```

## Model-agnostic note

This runs on whatever model Claude Code is using. To drive a non-Anthropic model from inside Claude
Code, point `ANTHROPIC_BASE_URL` at an LLM gateway (LiteLLM/Bifrost) that translates to OpenAI / Grok /
Gemini. The standalone `intent-outreach` CLI can also target a provider directly with that provider's
key — but only providers that have passed the eval gate are marketed as supported (Claude is the
default). See `000-docs/017-AT-DECR`.

## Report Profiles (optional)

If the user has a Report Profile (a local file under `profiles/` or `~/.intent-outreach/profiles/`), use
**Read** to load it and pass its knobs forward — intake, filtering, tone/length, output formats, and
delivery. The profile owns the deterministic choices; the drafter agent owns the grounded drafting.
Manage profiles with the `outreach-profile` skill. Full knob reference and the shipped starters:
[references/report-profiles.md](references/report-profiles.md).

## Resources

- **Phase sub-agents** (dispatched via `Task`) — `outreach-researcher` (Phase 1, one per domain),
  `outreach-enricher` (Phase 2), `outreach-drafter` (Phase 3).
- **Companion skills** — `outreach-connectors` (preflight connector status), `outreach-research`
  (quick Phase-1-only research without a full campaign), `outreach-profile` (manage Report Profiles).
- **Report Profiles** — knob reference + starters: [references/report-profiles.md](references/report-profiles.md).
- **Decisions + landscape** — `000-docs/017-AT-DECR` (rebuild decision record), `000-docs/018-DR-LAND`
  (B2B data-provider landscape).
