---
name: intent-outreach
description: >-
  Run a local research, enrichment, and outreach-drafting workflow over company domains with
  bring-your-own provider keys. Use when a user wants a reviewed SDR campaign or grounded cold-email
  drafts. Trigger with "run an outreach campaign", "prospect these companies", or "/intent-outreach".
allowed-tools:
  - Agent
  - AskUserQuestion
  - Read
  - mcp__intent-outreach__list_connectors
  - mcp__intent-outreach__save_run
version: 0.2.0
author: Jeremy Longshore <jeremy@intentsolutions.io>
license: SEE LICENSE IN LICENSE
compatibility: Claude Code with the bundled Intent Outreach MCP server
tags:
  - sdr
  - outbound
  - prospecting
  - lead-generation
  - sales
argument-hint: "<ICP description> <comma-separated domains>"
model: inherit
effort: medium
user-invocable: true
disable-model-invocation: true
---

# Intent Outreach

## Purpose

Coordinate a reviewed Research → Enrich → Score and Draft workflow without sending any message. The
bundled MCP server runs configured connectors in fixed registration order and rejects invalid campaign
runs before writing them to the local JSONL store.

## Prerequisites

- Enable the bundled `intent-outreach` MCP server and its three phase agents:
  `outreach-researcher`, `outreach-enricher`, and `outreach-drafter`.
- Export at least one connector credential. Use `list_connectors` to learn each connector's exact
  environment variable and current runtime note; do not infer account entitlements from its tier label.
- Supply an ICP or offer, one or more domains, a channel (`email` or `linkedin`), and the maximum
  contacts to draft per company.
- Treat every provider call as an external network request governed by that provider's terms and quota.

## Instructions

1. **Preflight.** Call `list_connectors`. Show `displayName`, `tier`, `phases`, `keyEnvVar`,
   `configured`, and `note`. If no configured connector supports research, stop and name the relevant
   environment variables. Never print credential values.
2. **Confirm scope.** Confirm the ICP, normalized domains, channel, and contacts-per-company. If a
   Report Profile is supplied, Read and summarize it before proceeding. Only the profile fields listed
   as runtime-mapped in [references/report-profiles.md](references/report-profiles.md) are automatically
   applied; obtain explicit confirmation before treating other fields as operational instructions.
3. **Research.** Dispatch `outreach-researcher` once per domain. Give each agent only the confirmed
   domain and ICP. Aggregate its returned leads, contacts, and connector status, then deduplicate by
   stable domain/email identifiers. Show the results and use AskUserQuestion to ask which leads to keep.
4. **Enrich.** Dispatch `outreach-enricher` once per kept lead with that lead and its contacts. Preserve
   the returned provider attribution and timestamps. Show the new signals; empty or partial output is
   valid.
5. **Score and draft.** Dispatch `outreach-drafter` once per kept lead with the ICP, lead, contacts,
   enrichments, channel, limit, and applicable style override. Require every claim to be supported by
   the supplied data. Show every draft and ask the user to approve, edit, reject, or stop.
6. **Save only after approval.** Assemble the exact `save_run` input: `id`, `icp`, `domains`,
   `provider`, `model`, `leads`, `contacts`, `enrichments`, `messages`, and `skippedConnectors`. Each
   message must include `contactKey`, `channel`, `body`, `cta`, `model`, `promptVersion`, and
   `createdAt`; `subject` and `fitScore` are optional. Call `save_run` only after the approval checkpoint.
7. **Report the receipt.** Return the run id, status, local path, record counts, connector failures, and
   confirmation that nothing was sent.

## Safety and data handling

- Never invent a person, address, company fact, funding event, customer, metric, or relationship.
- Never display secrets. Connector credentials are read from environment variables and sent only to
  the corresponding provider API by that connector.
- `save_run` writes locally to `$INTENT_OUTREACH_HOME/runs.jsonl`, or
  `~/.intent-outreach/runs.jsonl` when that variable is unset. It does not send outreach.
- This repository's license permits only the uses stated in `LICENSE`; do not describe it as open source.

## Output

Return a compact campaign receipt containing:

- researched, retained, enriched, and drafted counts;
- connectors that ran, skipped, or failed;
- approved drafts and their grounded source signals;
- the `save_run` result and local path, if the user approved persistence.

## Error handling

- **No research connector configured:** stop before dispatch and show the relevant `keyEnvVar` values.
- **Connector failure:** retain the runtime's skipped/failed result, continue with other connectors, and
  label the campaign partial.
- **Empty or thin evidence:** report it honestly; allow a generic draft only when the user wants one.
- **Agent failure:** identify the affected domain or lead and continue only with intact results.
- **Validation failure:** correct the field named by `save_run` and retry only with the user's approved
  content. Never bypass the validator or write directly to the run store.

## Examples

> **User:** `/intent-outreach — ICP: seed-stage developer-tool founders; domains: example.com; email; one contact`

Call `list_connectors`, confirm scope, research the domain, pause for lead selection, enrich retained
leads, draft from returned evidence, pause for message approval, then call `save_run`. If the connector
returns no evidence, say so; do not substitute a plausible company fact.

- **Example: campaign with no configured research connector.** Stop after preflight and return the
  environment-variable names from the registry; do not dispatch agents.
- **Example: partial provider failure.** Continue with intact provider results, mark the affected domain
  partial, and preserve the skipped connector in the save payload.
- **Example: rejected drafts.** Do not call `save_run`; return the reviewed research receipt and state
  that no campaign record or message was written.

When troubleshooting a failed save, compare the submitted field named in the validation error with the
MCP input schema, correct only that field, and preserve the approved message content.

## Resources

- [Report Profile contract](references/report-profiles.md)
- [Runtime and persistence contract](references/runtime-contract.md)
- Companion skills: `outreach-connectors`, `outreach-profile`, and `outreach-research`
