# Security Policy

Intent Outreach handles **your own** API keys and prospect data, all locally. Security of that handling
is a first-class concern.

## Reporting a vulnerability

Security reports must not be public, so do **not** open a GitHub issue or discussion for one. **Email
`security@intentsolutions.io`** (or `jeremy@intentsolutions.io`) with:

- a description of the issue and its impact,
- steps to reproduce,
- affected version/commit.

Please do **not** post details anywhere before a fix is released. Expect an acknowledgement within a few
business days.

## Supported versions

This is pre-1.0 software; only the latest `main` / latest release receives fixes.

## It never sends anything

Intent Outreach researches, drafts and records. It does not send email, LinkedIn messages or any other
outreach: delivery targets write to the console or to local files (`.eml` drafts, JSON, Markdown, HTML,
CSV), and the Slack renderer only writes a message file. The only network traffic is to the data and model
providers whose keys you configured. Clay is a push-only connector that posts lead data to your own
`CLAY_WEBHOOK_URL`.

## Handling secrets (by design)

- Connector and model keys are read from your **environment** or a **local file**
  (`$INTENT_OUTREACH_HOME/secrets.json`, or `INTENT_OUTREACH_SECRETS_FILE`) and are transmitted **only** to
  each provider's own API — never to Intent Solutions, never to a cloud secret store. A secrets file that
  group or other can read triggers a warning.
- Neither MCP registration (`.mcp.json` for project scope, `.claude-plugin/plugin.json` for the installed
  plugin) carries an `env` block or any key. A stdio MCP server inherits the environment Claude Code was
  started from, so keys never live in a manifest.
- Empty values and unexpanded `${...}` placeholders are treated as unset, never sent as a key.
- **Secret redaction:** every key a connector reads is registered for redaction, and the HTTP layer scrubs
  registered values from error messages, bodies and URLs. Error text recorded in a run's `errors[]` also
  has key-like query parameters, `Bearer` tokens and provider-style keys redacted, and is length-capped.
- Never commit secrets.

## Local data

- Run records default to **local encrypted SQLite** (`~/.intent-outreach/runs.sqlite`). AES-256-GCM protects payloads; keyed IDs and an authenticated audit avoid plaintext prospect identifiers. The default key is the adjacent 0600 `runs.sqlite.key`; configure `INTENT_OUTREACH_STORE_KEY_FILE` and keep key backups separate. A database plus its key is readable by their holder. Metadata (counts, times, lengths) is visible; this is not full-file/SQLCipher encryption.
- Run retention is 30 days for property/unknown packs and 365 for B2B, tightened by vendor terms. Reads/writes and `store purge` enforce deadlines; idle installations need a scheduled purge. Backups and legacy JSONL are outside this cleanup. Migration preserves plaintext originals for operator review and disposal.
- Suppression/consent/approval ledgers, provider caches, monitor snapshots and explicit exports remain local plaintext under their existing permission controls. Caches now enforce pack/vendor expiry and discard older cache formats; monitor snapshots expire within 30 days or sooner under vendor terms. `store purge` cleans both, preserving monitor definitions and active checks. This run-store change does not encrypt those separate stores. There is no telemetry and no server-side retention.
- Audit triggers prevent updates/deletes through normal SQLite operations; a keyed chain detects altered history or live payloads on access. An attacker with database write access can still roll back a complete backup, or with the key forge records. No external audit anchor or automatic key rotation is provided. See [storage operations](README.md#where-your-data-lives).
- Directories are created with mode 0700 and files with 0600; an existing run store with broader
  permissions is tightened on the next write.
- **PII minimization:** connector enrichment data is cut down to a B2B allowlist (title, seniority, company,
  work email, business phone, LinkedIn, funding fields). Personal emails, mobile and personal phones, home
  addresses and birth data are dropped, and ZoomInfo and Apollo research results no longer carry full person payloads. Set
  `INTENT_OUTREACH_KEEP_RAW=1` only if you need the full vendor payloads.
- The MCP `research_domain` and `enrich_lead` tools return normalized results; raw vendor payloads come back
  only when the call passes `debug: true`.

## Prompt-injection defenses

Company descriptions, web results and every other connector field are attacker-controllable. Two
deterministic layers keep them from steering a message sent under your name:

1. **Data fencing.** Prompts are built from an explicit allowlist of normalized fields; raw payloads, the
   enrichment `data` bag and contact emails never reach the model. Each connector-derived block is JSON
   inside a tag such as `<lead_data>`, with `<` and `>` escaped so a value cannot close its own fence, and
   every request restates that tagged content is data, not instructions. Score angles that cite money,
   rounds, headcounts, names, links or contact details absent from the inputs are dropped.
2. **Draft guard.** Every draft, whether from the CLI pipeline or written by the agent and passed to
   `save_run`, goes through `guardDraft`. It rejects URLs, email addresses and phone numbers that are not in
   the structured inputs or your own ICP/profile text, bodies over 120 words, subjects over 10 words or
   containing line breaks, fake `Re:`/`Fwd:` subjects and stock openers. A rejected draft is recorded in
   `rejectedDrafts` and never saved as a message.

Output is escaped on the way out as well: CSV cells that start with a formula trigger are prefixed, `.eml`
headers are stripped of CR/LF and encoded, and HTML and Slack output are escaped.

If you find a path where a key or prospect data could leak off the machine, or where untrusted data can get
an unapproved link or contact detail into a saved draft, treat it as a security vulnerability and report it
as above.


Normalized-data policy is fixed per pack (`pii-policy.ts`). B2B excludes property-owner data and
known personal enrichment fields; residential preserves typed owner/contact and compliance facts,
with an allowlist of property attributes. Live results, cache hits and property enrichment pass the
same policy before model calls. `KEEP_RAW` affects explicit debug responses only. This does not
claim free-text PII detection or erase old encrypted records/exports; their retention still applies.
