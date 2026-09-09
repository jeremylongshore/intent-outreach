---
name: outreach-research
description: >-
  Research company domains through configured Intent Outreach connectors without enriching or drafting.
  Use when a user wants a grounded lead/contact discovery pass before a campaign. Trigger with
  "/outreach-research", "research these domains", or "find contacts for these companies".
allowed-tools:
  - mcp__intent-outreach__list_connectors
  - mcp__intent-outreach__research_domain
version: 0.2.0
author: Jeremy Longshore <jeremy@intentsolutions.io>
license: SEE LICENSE IN LICENSE
compatibility: Claude Code with the bundled Intent Outreach MCP server
tags:
  - sdr
  - research
  - prospecting
argument-hint: "<ICP description> <domain1,domain2,...>"
model: inherit
effort: medium
user-invocable: true
---

# Outreach Research

## Purpose

Run only Intent Outreach's research phase for user-supplied domains. The MCP server calls configured
research connectors in registry order and returns aggregated leads, contacts, and connector status;
this skill performs no enrichment, scoring, drafting, saving, or sending.

## Prerequisites

- Enable the bundled Intent Outreach MCP server.
- Supply an ICP and one or more company domains.
- Configure at least one connector whose returned `phases` contains `research`. Credentials are
  environment variables documented in [references/research-runtime.md](references/research-runtime.md).

## Instructions

1. Parse the ICP and comma-separated domains. Normalize obvious URL input to hostnames, remove exact
   duplicates, reject malformed values, and confirm the resulting scope.
2. Call `list_connectors`. Show the configured connectors that support `research`; never print secret
   values or assume a present credential is valid.
3. If no configured research connector exists, stop and list the relevant `keyEnvVar` names.
4. Call `research_domain(domain, icp)` once for each confirmed domain.
5. Aggregate and deduplicate leads by domain and contacts by stable email or domain/name identity while
   preserving source attribution.
6. Render a compact result table and identify connectors that ran, skipped, or failed. Label the result
   partial when any configured connector failed.

## Authentication and data handling

- Connector credentials come from environment variables and are sent only to the corresponding
  provider API. Never ask the user to paste a credential into chat.
- Research calls transmit the domain and ICP to configured provider APIs. Obtain confirmation of scope
  before making the calls.
- Return only provider-supplied records. Never invent companies, people, titles, addresses, or signals.

## Output

Return:

- a table of company, domain, optional industry/size, contact count, and sources;
- a concise contacts table when contacts were returned;
- per-domain `ran` and `skipped` connector status;
- an explicit note that no enrichment, drafting, persistence, or sending occurred.

## Error handling

- **No configured research connector:** stop before any research call and name the required variables.
- **Invalid domain:** exclude it, explain why, and continue only with confirmed valid domains.
- **Connector failure:** preserve the runtime failure/skipped result and continue with other connectors.
- **Empty domain result:** report zero records for that domain; do not fill gaps from memory.
- **MCP unavailable:** explain that the bundled server must be enabled and stop.

## Examples

> **User:** `/outreach-research ICP: developer-tool founders; domains: example.com,example.org`

Confirm both domains, inspect connector status, call `research_domain` for each, and report exactly what
the providers returned. Do not proceed to enrichment or drafting.

- **Example: no credentials.** Stop after registry inspection and list only the environment-variable
  names for research-capable connectors.
- **Example: mixed domain input.** Normalize URLs, reject malformed entries, and ask the user to confirm
  the resulting hostnames before external calls.
- **Example: empty provider result.** Return zero leads and contacts for the domain without filling gaps
  from general knowledge.

For troubleshooting partial results, preserve the per-domain connector status and distinguish an empty
provider response from an authentication, quota, or network failure.

## Resources

- Read [Research runtime and authentication](references/research-runtime.md) for the external-call and
  credential boundary.
- Use `outreach-connectors` for a read-only preflight and `intent-outreach` for the reviewed full workflow.
