# Security Policy

Intent Outreach handles **your own** API keys and prospect data, all locally. Security of that handling
is a first-class concern.

## Reporting a vulnerability

GitHub issues are disabled on this repo, and security reports must not be public regardless. **Email
`security@intentsolutions.io`** (or `jeremy@intentsolutions.io`) with:

- a description of the issue and its impact,
- steps to reproduce,
- affected version/commit.

Please do **not** open a public discussion or post details anywhere before a fix is released. Expect an
acknowledgement within a few business days.

## Supported versions

This is pre-1.0 software; only the latest `main` / latest release receives fixes.

## Handling secrets (by design)

- Connector and model keys are read from your **environment** or a **local file** and are transmitted
  **only** to each provider's own API — never to Intent Solutions, never to a cloud secret store.
- The product writes run records to a **local** JSONL file (`~/.intent-outreach/runs.jsonl`). There is
  no telemetry and no server-side retention.
- Never commit secrets. The plugin's `.mcp.json` passes keys via env substitution
  (`"APOLLO_API_KEY": "${APOLLO_API_KEY}"`), so keys never live in the manifest.

If you find a path where a key or prospect data could leak off the machine, treat it as a security
vulnerability and report it as above.
