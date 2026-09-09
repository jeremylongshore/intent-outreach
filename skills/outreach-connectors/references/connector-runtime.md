# Connector runtime and authentication

`list_connectors` returns the live registry in deterministic order. Each row includes `name`,
`displayName`, `tier`, `phases`, `keyEnvVar`, `configured`, and `note`.

The current registry contains Apollo.io, Hunter.io, People Data Labs, Exa, Crunchbase, LeadMagic,
Clay, Clearbit (legacy), and ZoomInfo. The tool's returned metadata is authoritative for a run because
the repository and external provider terms can change independently of this document.

`configured` checks only whether the named environment value is present. It does not validate the
credential, call a provider endpoint, inspect quota, or guarantee access. Never print secret values.

Clay also requires `CLAY_WEBHOOK_URL` for its push-only integration even though the registry's primary
credential field is `CLAY_API_KEY`. Provider calls occur only through `research_domain` or
`enrich_lead`, not through `list_connectors`.
