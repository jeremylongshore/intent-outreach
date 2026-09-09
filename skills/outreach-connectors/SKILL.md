---
name: outreach-connectors
description: >-
  Inspect the bundled Intent Outreach connector registry without running research or enrichment. Use
  when a user asks which providers are configured or wants a campaign preflight. Trigger with
  "/outreach-connectors", "connector status", or "which data providers are configured?".
allowed-tools:
  - mcp__intent-outreach__list_connectors
version: 0.2.0
author: Jeremy Longshore <jeremy@intentsolutions.io>
license: SEE LICENSE IN LICENSE
compatibility: Claude Code with the bundled Intent Outreach MCP server
tags:
  - sdr
  - connectors
  - prospecting
argument-hint: "[connector name]"
model: inherit
effort: low
user-invocable: true
---

# Outreach Connectors

## Purpose

Provide a read-only preflight of the connector registry and credential presence. This skill does not
call provider APIs, disclose keys, research domains, enrich leads, or draft messages.

## Prerequisites

- Enable the bundled Intent Outreach MCP server.
- Provider credentials are optional for this inspection. When present, the server reads them from the
  environment; see [references/connector-runtime.md](references/connector-runtime.md).

## Instructions

1. Call `list_connectors` once.
2. If the user named a connector, filter the returned rows by `name` or `displayName`; otherwise retain
   all rows.
3. Render `displayName`, `tier`, `phases`, `keyEnvVar`, `configured`, and `note` exactly from the tool
   result. Do not replace runtime notes with remembered pricing or quota claims.
4. Count configured connectors and separately identify which support `research` and `enrich`.
5. If no configured connector supports the requested phase, list the relevant environment-variable
   names and explain that the credential must be supplied outside the chat. Never request its value.

## Authentication and security

- `list_connectors` checks whether each expected environment variable is present; it does not return
  the secret value.
- A `configured: true` result means only that the expected variable is non-empty. It does not prove the
  credential is valid, funded, authorized for an endpoint, or within quota.
- Provider tiers and notes are repository metadata, not a guarantee of current external pricing.

## Output

Return a compact table followed by counts for configured research and enrichment connectors:

```text
| Connector | Tier | Phases | Credential variable | Status | Runtime note |
|---|---|---|---|---|---|
| Example | paid | enrich | EXAMPLE_API_KEY | not configured | … |
```

## Error handling

- **MCP unavailable:** report that the bundled server must be enabled; do not fabricate a registry.
- **Empty registry:** report zero connectors and stop.
- **Unknown requested name:** show the valid names returned by the tool.
- **No credentials:** treat this as a valid preflight result and explain how to set the named variables
  in the user's shell or host configuration without exposing their values.

## Examples

> **User:** `/outreach-connectors apollo`

Call `list_connectors`, show only the matching row, and distinguish credential presence from credential
validity. Do not run `research_domain` or `enrich_lead`.

- **Example: all connectors.** With no argument, return all registry rows and separate research-ready
  from enrichment-ready counts.
- **Example: configured but unusable.** If a later provider call reports an authentication or quota
  failure, explain that preflight checks presence only.
- **Example: unknown connector.** Return the valid registry names without guessing an alias.

For troubleshooting, rerun `list_connectors` after the user updates their host environment. If status
is unchanged, advise restarting the MCP host so it receives the new environment; never request the key.

## Resources

- Read [Connector runtime and authentication](references/connector-runtime.md) for field semantics,
  credential boundaries, and the Clay webhook exception.
- Use `intent-outreach` for the full reviewed workflow or `outreach-research` for research only.
- Treat the tool result as the operational source of truth. Repository notes can change between releases,
  and each external provider independently controls its authentication, access, pricing, and quota terms.
