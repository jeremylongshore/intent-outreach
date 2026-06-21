---
name: outreach-research
description: >-
  Research one or more company domains (Intent Outreach Phase 1 only) — surface leads + contacts, with
  no enrichment or drafting. Use when the user wants quick account research, to find who works at a
  company, or to vet a domain list before committing to a full campaign. Triggers:
  "/outreach-research", "research these domains", "pull leads for a domain", "Phase 1 only".
allowed-tools:
  - mcp__intent-outreach__list_connectors
  - mcp__intent-outreach__research_domain
version: 0.1.0
author: Jeremy Longshore
license: SEE LICENSE IN LICENSE
compatibility: Claude Code (and any MCP-capable client for the bundled server)
tags:
  - sdr
  - research
  - prospecting
argument-hint: "<icp> <domain1,domain2,...>"
model: inherit
user-invocable: true
---

# Outreach Research — Phase 1 only

## Overview

Run only the **Research** phase of Intent Outreach across one or more domains: surface the leads
(companies) and contacts (people) the configured connectors return, deterministically, in fixed
connector order. It does **not** enrich, score, or draft — it is the fast way to vet a domain list
before spending enrichment calls or running the full `intent-outreach` campaign.

## Prerequisites

- The bundled Intent Outreach MCP server (tools `mcp__intent-outreach__research_domain`,
  `mcp__intent-outreach__list_connectors`).
- At least one research connector configured (e.g. `APOLLO_API_KEY` or `HUNTER_API_KEY` — free tiers
  exist). If none is set, stop and say which keys to add.

## Instructions

1. Read the arguments: an ICP description followed by a comma-separated domain list. Parse and confirm
   the ICP and domains back to the user.
2. If unsure anything is configured, call `list_connectors`; if nothing is, stop and name the keys to set.
3. For each domain, call `research_domain(domain, icp)`.
4. Aggregate the returned **leads** and **contacts** and present a compact table.

Do not enrich, score, or draft here — that is the campaign skill's job.

## Output

A compact table per the aggregated results, for example:

```
| Company  | Domain      | Industry | Size   | Contacts |
|----------|-------------|----------|--------|----------|
| Acme Inc | acme.com    | SaaS     | 51-200 | 3        |
| Globex   | globex.com  | Fintech  | 11-50  | 1        |
```

Followed by a one-line note on which connectors ran and any that were skipped.

## Error Handling

- **No connectors configured** — stop; list the keys to set (free tiers first). Do not invent leads.
- **A connector errors mid-run** — the pipeline records it as skipped and continues; report which
  connectors ran vs skipped so the user knows the result is partial.
- **A domain returns nothing** — report the empty result honestly; never fabricate companies or contacts.

## Examples

> **User:** "/outreach-research seed-stage dev-tools founders stripe.com,linear.app"
>
> Confirms ICP + the two domains, calls `research_domain` for each, and prints a table of the companies
> and contacts found — no enrichment, no drafts.

## Resources

- Full campaign (research → enrich → outreach): the `intent-outreach` skill.
- A structured account brief that also enriches: the `lead-researcher` agent.
- Connector status: the `outreach-connectors` skill.
