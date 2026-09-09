# Research runtime and authentication

`research_domain(domain, icp)` calls every configured connector whose registered phases include
`research`, in fixed registry order. It aggregates and deduplicates returned leads and contacts and
reports connectors that ran or were skipped.

Use `list_connectors` immediately before research. Its `keyEnvVar` field names the environment variable
expected by each connector; its `configured` field indicates presence only. Never request or print the
secret value. A configured connector can still fail because of invalid credentials, account permissions,
quota, network errors, or provider changes.

Research sends the confirmed domain and ICP to the configured providers' APIs. It does not invoke
enrichment-only connectors, score leads, draft messages, persist a campaign run, or send outreach.
