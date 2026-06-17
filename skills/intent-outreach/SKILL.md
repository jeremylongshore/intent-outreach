---
name: intent-outreach
description: >-
  Run a research → enrich → outreach SDR campaign from inside Claude Code, fully
  local with your own data-provider + model keys. Use when the user wants to
  prospect companies, build a lead list, research accounts, or draft personalized
  cold outreach (email or LinkedIn) over domains they name. Triggers: "run an
  outreach campaign", "prospect these companies", "research these domains",
  "draft cold emails to", "build me a lead list", "/intent-outreach".
allowed-tools:
  - mcp__intent-outreach__list_connectors
  - mcp__intent-outreach__research_domain
  - mcp__intent-outreach__enrich_lead
  - mcp__intent-outreach__save_run
  - Read
  - AskUserQuestion
version: 0.1.0
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

Drive the bundled **Intent Outreach MCP server** through fixed phases, in order. This is ONE skill — do
**not** spawn subagents or let tool choice become improvised. The connectors decide *what data* comes
back; the model only *molds* that data into outreach. Everything is local; keys are the user's own.

## Operating rules (non-negotiable)

- **Deterministic order.** Always run the phases below in sequence. Do not skip Research/Enrich to
  "just write emails." A message with no grounding is the failure mode.
- **Ground every claim.** Use ONLY facts returned by the connectors. Never invent a funding round, a
  mutual connection, a customer, a metric, or news. If a lead has thin data, write an honest, generic
  message — do not fabricate personalization.
- **Checkpoint with the user** between phases (use AskUserQuestion for approve/edit/stop). The user
  owns what goes out under their name.
- **The validator is the gate.** Persist a run only through `save_run`, which validates before it
  writes. If `save_run` returns a validation error, fix the run and retry — never work around it.

## Phase 0 — Preflight

1. Call `list_connectors`. Show the user which data connectors are **configured** (have a key) and
   which are skipped, with each one's tier (free / paid / enterprise / legacy).
2. If **nothing** is configured, stop and explain: set provider keys in the environment (e.g.
   `APOLLO_API_KEY`, `HUNTER_API_KEY`) — Apollo + Hunter both have free tiers, so a full campaign can
   run for free. **Authentication is per-connector BYO:** each MCP tool authenticates to its provider
   with your own API key read from the environment (no shared credentials, no login); keys never leave
   the machine except to each provider's own API.
3. Confirm the **ICP/offer** and the **target domains** with the user. Confirm the channel
   (email or linkedin) and how many contacts per company to draft (default 1).

## Phase 1 — Research (deterministic)

For each domain, call `research_domain(domain, icp)`. Aggregate the returned **leads** and
**contacts**. Present a compact table (company, industry, size, # contacts). Checkpoint: let the user
drop any companies before spending enrichment calls.

## Phase 2 — Enrich (deterministic)

For each lead the user kept, call `enrich_lead(domain, companyName, contacts)`. Collect the
**enrichments** (funding, verified emails/phones, web context). Show the user the new signals.

## Phase 3 — Score + Draft (your judgment, grounded)

For each lead:
1. **Score fit** 0–100 against the ICP using only the lead + enrichment data. Be discriminating;
   reserve 80+ for strong matches with a real reason to buy now. Skip drafting for clearly-off-ICP
   leads and say why.
2. **Pick angles** — up to 3 specific, grounded talking points tied to concrete signals.
3. **Draft** one message per target contact following these rules (the same `prompts/outreach.v1.md`
   the standalone pipeline uses):
   - Short: email body ≤ ~90 words, LinkedIn ≤ ~60. One idea, one ask.
   - Open on a specific grounded angle, not a generic compliment. Plain language; no "hope this finds
     you well", no emoji unless asked. Email needs a ≤7-word subject; LinkedIn has none.
   - A single low-friction CTA.
   - **Use only facts from the data.** No fabricated personalization.

Show the drafts. **Checkpoint:** the user approves, edits, or rejects each before anything is saved.

## Phase 4 — Save (validated, local)

Assemble the run and call `save_run` with: `id` (a unique id you generate, e.g. from the current time), `icp`, `domains`,
`provider` (the model you used), `model`, and the arrays `leads`, `contacts`, `enrichments`,
`messages` (each message: `contactKey`, `channel`, `subject?`, `body`, `cta`, `fitScore?`, `model`,
`promptVersion: "outreach.v1"`, `createdAt`). `save_run` validates and appends to the local JSONL
store; report the saved path and counts. If it returns a validation error, correct the offending
field and call it again.

## Examples

> **User:** "/intent-outreach — prospect stripe.com and linear.app, ICP = seed-stage dev-tools founders, draft cold emails."

1. **Preflight** — `list_connectors` shows `apollo` + `hunter` configured (free tier). Confirm the ICP, the two domains, channel = email, 1 contact each.
2. **Research** — call `research_domain("stripe.com", icp)` then `research_domain("linear.app", icp)`; present the leads + contacts table. The user keeps both.
3. **Enrich** — call `enrich_lead(...)` per lead; surface funding + verified emails.
4. **Score + draft** — score each lead's fit 0–100; for the strong fits, draft one grounded ≤90-word email opening on a real signal (e.g. a recent raise). Show the drafts; the user edits one and approves.
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
Code, point `ANTHROPIC_BASE_URL` at an LLM gateway (LiteLLM/Bifrost) that translates to OpenAI / Grok
/ Gemini. The standalone `intent-outreach` CLI can also target a provider directly with that
provider's key — but only providers that have passed the eval gate are marketed as supported (Claude
is the default). See `000-docs/017-AT-DECR`.

## Report Profiles (optional)

If the user has a Report Profile (a local file under `profiles/` or `~/.intent-outreach/profiles/`),
use **Read** to load it and honor its knobs — intake, filtering, tone/length, output formats, and
delivery. The profile owns the deterministic choices; the model owns the creative drafting. Full knob
reference and the shipped starters: [references/report-profiles.md](references/report-profiles.md).
