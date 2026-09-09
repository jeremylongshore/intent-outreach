# Intent Outreach runtime contract

## Tool boundary

The bundled MCP server exposes four phase-level tools:

| Tool              | Side effect        | Runtime behavior                                                                                |
| ----------------- | ------------------ | ----------------------------------------------------------------------------------------------- |
| `list_connectors` | none               | Returns registry metadata and whether each expected credential variable is present.             |
| `research_domain` | provider API calls | Runs configured research connectors in fixed registration order and aggregates their results.   |
| `enrich_lead`     | provider API calls | Runs configured enrichment connectors in fixed registration order and aggregates their results. |
| `save_run`        | local file append  | Validates an assembled `CampaignRun`, then appends it to the local JSONL store.                 |

`save_run` does not send email or LinkedIn messages. Its default path is
`~/.intent-outreach/runs.jsonl`; setting `INTENT_OUTREACH_HOME` changes the parent directory.

## Credential boundary

The server uses bring-your-own credentials from environment variables. `configured` means only that
the expected value is present, not that authentication, account entitlement, or quota has been verified.
Do not display secret values or promise pricing based on the registry's descriptive tier.

## Validation boundary

The MCP server derives timestamps and status, validates the full run through `CampaignRunSchema`, and
writes only validated data. Treat a returned validation error as a hard stop: correct the named input
field and do not write around the MCP server.
