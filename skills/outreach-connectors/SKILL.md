---
name: outreach-connectors
description: >-
  Show which Intent Outreach data connectors are configured (have a bring-your-own key) versus
  skipped, with each one's tier. Use when the user asks which connectors or data providers are set up,
  whether a specific provider (apollo, hunter, …) is configured, or wants a preflight check before
  running a campaign. Triggers: "/outreach-connectors", "which connectors are configured",
  "connector status", "what data providers do I have".
allowed-tools:
  - mcp__intent-outreach__list_connectors
version: 0.1.0
author: Jeremy Longshore
license: SEE LICENSE IN LICENSE
compatibility: Claude Code (and any MCP-capable client for the bundled server)
tags:
  - sdr
  - connectors
  - prospecting
model: inherit
user-invocable: true
---

# Outreach Connectors — preflight status

## Overview

A read-only preflight for Intent Outreach. It reports which data connectors are **configured** (have a
bring-your-own key in the environment) versus **skipped**, with each one's tier, so the user knows what
a campaign can do right now. It runs no research, enrichment, or drafting — it is the safe first step
before the `intent-outreach` campaign skill.

## Prerequisites

- The bundled Intent Outreach MCP server is available (tool `mcp__intent-outreach__list_connectors`).
- Optionally, one or more provider keys set in the environment (e.g. `APOLLO_API_KEY`, `HUNTER_API_KEY`).
  None are required to run this check — reporting their absence is the point.

## Instructions

1. Call `list_connectors`.
2. Render a compact table: connector · tier (free / paid / enterprise / legacy) · status
   (✓ configured / — skipped, no key).
3. Summarize how many are configured and what is runnable now.
4. If **nothing** is configured, explain that keys are bring-your-own environment variables (Apollo and
   Hunter both have free tiers, so a full campaign can run for free) and that no research/enrich call
   can run until at least one is set. Keys never leave the machine except to each provider's own API.

## Output

A markdown table plus a one-line summary, for example:

```
| Connector | Tier | Status         |
|-----------|------|----------------|
| apollo    | free | ✓ configured   |
| hunter    | free | — skipped      |
```

> 1/9 connectors configured (apollo) — research + enrich can run on Apollo's free tier.

## Error Handling

- **MCP server unreachable** — tell the user the Intent Outreach MCP server isn't running and how to
  install/enable the plugin. Never fabricate a connector list.
- **Zero connectors configured** — not an error; report it plainly and list the keys to set, free tiers
  first.

## Examples

> **User:** "/outreach-connectors"
>
> Calls `list_connectors`, prints the table, and notes (say) Apollo + Hunter configured on free tiers,
> the rest skipped — ready to run a campaign.

## Resources

- Full research → enrich → outreach campaign: the `intent-outreach` skill.
- Connector landscape (which APIs are viable): `000-docs/018-DR-LAND-b2b-data-provider-landscape-2026.md`.
