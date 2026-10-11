# Intent Outreach runtime contract

## Tool boundary

The bundled MCP server exposes four phase-level tools:

| Tool              | Side effect        | Runtime behavior                                                                                |
| ----------------- | ------------------ | ----------------------------------------------------------------------------------------------- |
| `list_connectors` | none               | Returns registry metadata and whether each expected credential variable is present.             |
| `research_domain` | provider API calls | Runs configured research connectors in fixed registration order and aggregates their results.   |
| `enrich_lead`     | provider API calls | Runs configured enrichment connectors in fixed registration order and aggregates their results. |
| `save_run`        | local transaction  | Validates an assembled `CampaignRun`, then saves it in the local encrypted SQLite store.                 |

`save_run` does not send email or LinkedIn messages. Its default path is
`~/.intent-outreach/runs.sqlite`; setting `INTENT_OUTREACH_HOME` changes the parent directory.

## Credential boundary

The server uses bring-your-own credentials from environment variables. `configured` means only that
the expected value is present, not that authentication, account entitlement, or quota has been verified.
Do not display secret values or promise pricing based on the registry's descriptive tier.

## Validation boundary

The MCP server derives timestamps and status, validates the full run through `CampaignRunSchema`, and
writes only validated data. Treat a returned validation error as a hard stop: correct the named input
field and do not write around the MCP server.

## Contact handoff (`contact-handoff.v1`)

`enrich_lead` returns both `contacts` and `enrichments`. The returned contact list is
the runtime-normalized result after attributable provider email findings have been
applied. The enricher must return that list intact; the orchestrator must pass the
same list to the drafter and `save_run`. Reusing research contacts after enrichment
can make a valid draft address fail its contact foreign key.

`contactKey` is the supplied contact's exact email, or `name@leadDomain` when it has
no email. An enrichment's email does not independently satisfy that foreign key.
The save validator must continue rejecting unmatched keys; it must not infer a
recipient or alter the reviewed draft. This handoff revision requires fresh workflow
qualification; it does not upgrade earlier failed evaluation receipts.
