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
  - Write
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
---

# Intent Outreach — SDR orchestrator

You orchestrate a **deterministic** Research → Enrich → Outreach campaign by driving the bundled
**Intent Outreach MCP server**. You are ONE skill running fixed phases in order — do **not** spawn
subagents or let tool choice become improvised. The connectors decide *what data* comes back; you,
the model, only *mold* that data into outreach. Everything is local; keys are the user's own.

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
   run for $0. Keys are read locally and never leave the machine except to each provider's API.
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

Assemble the run and call `save_run` with: `id` (e.g. `run-<timestamp>`), `icp`, `domains`,
`provider` (the model you used), `model`, and the arrays `leads`, `contacts`, `enrichments`,
`messages` (each message: `contactKey`, `channel`, `subject?`, `body`, `cta`, `fitScore?`, `model`,
`promptVersion: "outreach.v1"`, `createdAt`). `save_run` validates and appends to the local JSONL
store; report the saved path and counts. If it returns a validation error, correct the offending
field and call it again.

## Model-agnostic note

This runs on whatever model Claude Code is using. To drive a non-Anthropic model from inside Claude
Code, point `ANTHROPIC_BASE_URL` at an LLM gateway (LiteLLM/Bifrost) that translates to OpenAI / Grok
/ Gemini. The standalone `intent-outreach` CLI can also target a provider directly with that
provider's key — but only providers that have passed the eval gate are marketed as supported (Claude
is the default). See `000-docs/017-AT-DECR`.

## Report Profiles (optional)

If the user has a Report Profile (a local file under `profiles/` or `~/.intent-outreach/profiles/`),
read it and honor its knobs: intake (which connectors/fields), filtering (min fit score, title
filters), tone/length, output formats, and delivery target. The profile owns the deterministic
choices; you own the creative drafting. Ship starter profiles are in `profiles/`.
