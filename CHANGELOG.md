# Changelog

All notable changes to Intent Outreach are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project aims for
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Vendor MCP servers as fixed connectors** (#83 phase 4c). `createMcpConnector(spec)` wraps a data vendor's MCP
  server (DealMachine, BatchData, Regrid, ATTOM...) as an ordinary connector: the definitions of the tool it may call
  are pinned by sha256 (`mcpToolsDigest`) and a changed definition refuses to run (tool poisoning), only the bound tool
  is ever called with arguments built in code from the typed query, every response is schema-checked, and the server,
  version, tool and response hash are recorded on every fact (`Fact.via`). The model never sees the vendor's toolbox.

- **A separate model per seam** (#83 phase 8). `runCampaign` and `runPropertyCampaign` take an optional
  `scoreProvider` (a cheap model that scores; `provider` drafts), and the CLI `run` and `property-run` take
  `--score-provider` / `--score-model`. Both models resolve through the eval gate like any provider; costs are
  metered per model; the run records `seamModels` (score and draft provider + model) when they differ.

- **Event monitors** (#83 phase 8). `intent-outreach monitor add <id> --zips ... | --parcels fips:apn`, `monitor list`
  and `monitor check <id> [--draft --icp ...]`. A check re-runs the query through the normal research path,
  fingerprints each parcel (owner, value, listing status, distress signals) and diffs it against the last snapshot
  (`$INTENT_OUTREACH_HOME/monitors/<id>.json`, 0600): `new-parcel`, `owner-change`, `value-change` (threshold,
  default 10%), `listing-change`, `distress-change`. The first check records a baseline; a check whose research
  failed keeps the old snapshot so an outage never reads as every parcel being new. `--draft` runs a property
  campaign over only the changed parcels; drafts wait in the approval queue.

- **MCP tools `list_runs`, `suppress` and `underwrite`** (#83 phase 8). `list_runs` summarizes the newest
  runs in the local store (status, pack, drafts, blocks, credits, cost; corrupt lines are counted). `suppress`
  adds or lists opt-outs of any kind from inside Claude Code; removing an opt-out is deliberately CLI-only
  (`intent-outreach suppress remove`), so an agent steered by third-party text can never undo one. `underwrite` runs one
  `@intent-outreach/deal-math` calculation in code and returns `{value, inputs, assumptionsUsed, version}`,
  so an agent quotes computed figures instead of doing arithmetic. The engine now declares the deal-math
  workspace package as a dependency.

- **Free public-records connectors and `property-run`** (#83 phase 6b). `fl-dor-parcels` (Florida statewide
  DOR roll: owner, mailing address, situs, just value, use code, year built, last sale, centroid; masked
  confidential owners dropped; one party per owner across parcels) and `fema-nfhl` (flood zone + SFHA by
  parcel point, most hazardous zone wins) are keyless and on by default for property queries only
  (`INTENT_OUTREACH_PUBLIC_RECORDS=0` turns them off). Connectors gain `enrichProperties`, run by
  `runPropertyCampaign` after research (adds facts, never overwrites). Properties gain `location`; parties
  gain `licenseTerms`, and `residential-re` drafts only to owners whose source explicitly allows outreach
  (undeclared or restricted blocks) and never to government owners. CLI
  `intent-outreach property-run --icp ... (--zips ... | --parcels fips:apn,...)`.

- **Human approval queue** (#83 phase 8). Every drafted message waits for a person: `approvals pending`
  shows each draft in full with a digest, and `approvals approve <runId> <contactKey> --digest <hex>` /
  `approvals reject` record the decision in an append-only `approvals.jsonl` (0600) bound to the exact text,
  so an edit voids the approval and a later decision supersedes an earlier one. The send-time check now
  requires an approval on every channel (`approval:missing` / `approval:rejected`), and `check-send` looks
  it up by `runId` + `contactKey`. MCP tools `list_pending`, `approve` (digest required) and `reject`; the
  skill calls them only on the user's explicit word. A draft without its sender footer cannot be approved.

- **Property campaigns and the `residential-re` pack** (#83 phase 6a). `runPropertyCampaign({ queries })`
  researches parcels by typed query (with the pack's routing, the credit budget and the cache), gates each
  owner of record (the engine's suppression check on the mailing address and contact points, then the
  pack's `propertyGate`), scores with signals computed in code (absentee and out-of-state owner, entity
  owner, years since the recorded transfer, flood zone) over FCRA-stripped attributes, runs the pack's
  deal-math `underwriting` in code, drafts through the guard and the pack's draft rules, appends the
  channel footer in code, and records one validated v6 run. `residential-re` gates on the Gulf Coast
  AL/FL service area, sends probate/divorce/pre-foreclosure signals to manual review, blocks known active
  listings and running exclusive agreements, rejects fair-housing language, and requires the license
  disclosure on every channel. New prompts `residential-score.v1.md` and `residential-draft.v1.md`.

- **Provider routing, credit budgets, a response cache and rate limits** (#83 phase 4a). Connectors declare
  `capabilities`, `creditsPerCall`, `cacheTtlMs` and `rateLimit`. A pack's `dataSources` fixes the
  routing per capability: `first-hit` (a waterfall: stop at the first non-empty answer, so later paid
  sources are never called), `ordered-fallback` or `all`. `run --budget-credits <n>` (or
  `runCampaign({ budgetCredits })`) charges each paid call before it is made; once a call would cross the
  ceiling no further paid call is made, and the run records `credits` (limit, spent, exhausted, per
  connector). Research output of a connector with `cacheTtlMs` is cached (on disk, 0600, under the local
  home), so a repeat lookup makes no request and costs nothing. `httpJson({ rateLimit })` enforces
  per-minute (waits) and per-day (stops) vendor limits before every attempt.

- **Fair-housing and real estate risk gates** (#83 phase 3b). Pack v2 `draftRules` run inside the draft
  guard on every drafting path (pipeline seam and MCP `save_run`); a failing rule sends the draft to
  `rejectedDrafts`, and a rule that throws rejects it. `fairHousingDraftRule` ports comehomealabama's
  HARD/WARN lint and adds age and familial-status terms, so a draft never references the owner's
  retirement, children or marital status. `compliance/risk.ts` adds the manual-review verdict (probate,
  divorce, pre-foreclosure → `manual-review:<category>`), the active-listing check (an exclusive
  agreement still in effect, or an unknown status, blocks) and `stripFcraSensitive` (credit and
  personal-financial attributes never reach a prompt).

- **Send-time compliance** (#83 phase 3a). `checkSendable` / `assertSendable` evaluate one message to one
  contact point on one channel at the moment of sending and return every blocking reason: suppression,
  DNC (phone channels need `clean`), consent from a ledger (SMS needs written consent; a revocation voids
  every channel), a conservative recipient-local phone window (8am–8pm, Monday–Saturday, Texas from 9am;
  every US zone when the location is unknown), the exact channel footer at the end of the body, and
  outreach-restricted data. `intent-outreach check-send` exposes it to dispatchers in other languages
  (exit 0 sendable; any non-zero means do not send). New `sms`, `mail` and `call_script`
  message channels (folded into the unreleased schema v6) each get a code-applied footer; a sender's
  `licenses` add the brokerage + license line to every channel. Pack v2 gains `channels`, tighten-only
  per-channel policy overrides.

- **`@intent-outreach/deal-math`** (`packages/deal-math`, #83 phase 5): NOI, cap rate, DSCR, cash-on-cash,
  level payments, seller financing with balloon, 1031 deadlines (informational) and the condo trade-up
  model, in integer cents and basis points with half-even rounding and explicit assumptions. Every result
  carries its inputs, assumptions and version. `tradeUp` matches coastal's `trade_up.py` on all 73 cases of a
  golden fixture generated from the Python. The repo is now an npm workspace (`packages/*`); the engine
  stays at the root, which is the plugin root.

||||||| 8be0c4b1
- **Run schema v6: the property/owner model and a typed research query** (#83 phase 2). Runs gain
  `properties` (keyed `<countyFips>:<apn>`), `parties`, `ownerships`, `entityLinks` and `contactPoints`
  (all defaulted `[]`) and an optional `queries`. Every vendor value on a property is a `Fact` with its
  source, fetch time, response hash and license terms; a phone `ContactPoint` must be E.164 and its DNC
  status defaults to `unknown` (fail closed). `runResearchQuery(query)` runs a `domain`, `area` or
  `parcel` query across the connectors that declare that kind (`Connector.queryKinds`, default
  `["domain"]`), in registration order; `runResearch(domain)` is now a wrapper over it. Additive: every
  v1–v5 line still parses. Older binaries cannot read v6 runs.
- **Phone and mailing-address suppression** (`suppress add <value> [--kind phone|address]`), the
  service-area geofence as pack data, and the TCPA quiet-hours window corrected to 8am–9pm (#85).

- **The drafter declines leads that clearly sit outside the ICP.** Draft output gains `decline` and
  `declineReason`. A decline is never sent: it is recorded in `run.rejectedDrafts` as
  `"declined: <reason>"` and metered. Prompt `outreach.v3.md` adds the rule (thin data is not a reason
  to decline) and the b2b-sdr pack uses it; the plugin's drafter agent and orchestrator skill record
  declines the same way through `save_run`. The eval gate treats a decline as correct on out-of-ICP
  fixtures (`expectDecline`) and as a failure (a false decline) everywhere else.
- **Per-fixture judge minimums** (`judgeMin`) and **one logged retry on an unparseable structured
  response** for every provider, with both attempts metered (#71).

- **MiniMax-M3 provider** (`--provider minimax`, `MINIMAX_API_KEY`). It runs over MiniMax's
  OpenAI-compatible endpoint through the optional `@ai-sdk/openai-compatible`. M3 ignores
  `json_schema`, so the adapter uses JSON mode, and a provider-local middleware
  (`pipeline_core/minimax.ts`) puts the schema in the prompt, strips `<think>` blocks and fences,
  coerces `""` to `[]` for array fields and raises the output-token floor. Qualified by a keyed
  eval run (repeat 3, 9/9 fixtures, 27/27 runs,
  `evals/results/2026-10-04-minimax-MiniMax-M3-outreach.v2@79323f78.json`). Auto-detect order is
  now anthropic, openai, minimax, xai, and Anthropic stays the default. Costs are metered at
  MiniMax's published $0.30/$1.20 per MTok (#67).

## [0.3.0] - 2026-10-04

Hardening release after the October 2026 six-lens audit (epic #51; plan and review in
`000-docs/021-AT-PLAN` and `000-docs/022-AA-AACR`).

**Breaking changes:**

- **`--provider google` is removed**, along with the Google adapter, `@ai-sdk/google` and
  `GEMINI_API_KEY`. Passing `google` now fails with `unknown provider "google"` (#58).
- **Run schema v5.** Runs are now written as `schemaVersion: 5` (v3 in #49, v4 in #59, v5 in #62). Every
  older line still parses, but a binary from before this release rejects v3+ lines and the new `partial`
  status. Once new runs exist, fix forward instead of downgrading (#49, #59, #62).
- **MCP `save_run` rejects a duplicate run id** with `run <id> already exists; pass overwrite: true to
  replace`; pass `overwrite: true` to append a replacement snapshot (#48, #62).
- **MCP `save_run` is stricter.** It applies the suppression list, the pack gate, the draft guard and the
  CAN-SPAM footer; a draft whose `contactKey` matches no contact is rejected; drafts with links, emails or
  phones not present in the inputs go to `rejectedDrafts`; an unreadable suppression file refuses the save;
  arrays and strings are bounded and the payload is capped at 2 MB (#62).
- **`Message.promptVersion` is now `file@sha8`** (for example `outreach.v2@79323f78`) instead of the bare
  file name. Anything matching the old literal must be updated (#62).
- **The CLI exits 2 on bad flags.** Invalid `--min-score`, `--max-contacts`, `--channel`, `--domains` or
  `--profile`, an unknown flag and an unknown command all print an error and exit 2 before anything is
  spent. `--channel` no longer silently falls back to `email` (#62).
- Relative `INTENT_OUTREACH_HOME` / `INTENT_OUTREACH_SECRETS_FILE` values now throw instead of resolving
  against the working directory (#48).
- The prompt loader no longer falls back to `./prompts` in the working directory;
  `INTENT_OUTREACH_PROMPTS_DIR` is the only override (#58).

### Added

- **CAN-SPAM footer, applied in code.** Report Profiles take an optional `sender`
  (`name`, `company`, `postalAddress`, `replyToEmail?`, `optOutText?`, `optOutOnLinkedin?`). Email drafts
  get a footer with sender identity, postal address and an opt-out line after validation. Without a
  complete sender nothing is invented: the message is flagged `needsSenderIdentity` and the run records a
  `complianceWarnings` entry. LinkedIn drafts get no postal footer (#59).
- **Local suppression list** at `$INTENT_OUTREACH_HOME/suppressions.jsonl` and the
  `intent-outreach suppress add|remove|list` command. The suppression gate runs ahead of every pack's gate;
  a domain covers its subdomains; a corrupt line fails the run closed (#59).
- `intent-outreach run --profile <path|name>`: sender identity, channel, minimum score and tone from a
  Report Profile; explicit flags win (#62).
- MCP `save_run` inputs `pack`, `profile`, `blockedContacts`, `errors`, `rejectedDrafts`,
  `failedConnectors` and `overwrite`; `INTENT_OUTREACH_PROFILE` supplies the profile when none is passed
  (#62).
- **Draft guard** (`pipeline_core/draft-guard.ts`): rejects unapproved links, emails and phone numbers,
  over-long bodies and subjects, CR/LF and fake `Re:`/`Fwd:` subjects and stock openers. Rejected drafts are
  recorded in `run.rejectedDrafts` (#58, #62).
- **Angle grounding**: score angles citing facts absent from the inputs are dropped and surfaced as
  `run.droppedAngles` (#58, #62).
- Prompts v2 (`research.v2.md`, `enrich.v2.md`, `outreach.v2.md`) with an anchored integer `fitScore`
  rubric; v1 files are kept for provenance (#58).
- Run fields: `errors`, `rejectedDrafts`, `failedConnectors`, `partial` status (v3); `complianceWarnings`,
  `Message.needsSenderIdentity` (v4); `promptRefs`, `droppedAngles`, `origin` (v5). All additive (#49, #59,
  #62).
- **Keyed eval harness as the real gate**: score bands, angle-laundering checks, draft checks that reuse
  the product guard, `--repeat` (default 3), an optional `--judge`, and result records in
  `evals/results/` (#61).
- **Per-model approval** in `evals/supported.ts` (from which `SUPPORTED_PROVIDERS` is derived) and
  `npm run evals:promote -- --provider <p> --model <id>`. A stderr warning fires when a model with no
  approval record runs (#61).
- `INTENT_OUTREACH_KEEP_RAW=1` to keep full vendor payloads (off by default) (#50).
- Pricing rows for `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-opus-5`, `claude-sonnet-5`,
  `claude-opus-4-7` and `claude-opus-4-6`, plus cache read/write pricing (#45).
- `RunStore.corruptLines()` and a stderr warning naming unreadable lines (#48).
- CI smoke steps: the shipped CLI runs, and the MCP server answers `initialize` (#47).

### Changed

- **Cost metering is real.** Token usage is read from AI SDK v7 (`inputTokens`/`outputTokens` and cache
  details); before this every call recorded 0 tokens and $0. The run total includes the cache split (#45,
  #59).
- `claude-opus-4-8` pricing corrected from $15/$75 to $5/$25 per million tokens (#45).
- `runCampaign` isolates failures per lead and contact into `run.errors` instead of losing the whole run;
  zero messages plus errors gives `failed` (#49).
- Connectors that are configured but fail go to `failedConnectors`; `skipped` now means "not configured"
  only. Each connector call has a deadline (default 90s), and campaigns over 25 domains need
  `allowLarge: true` (#49).
- Input domains are normalized and deduplicated; `lead.source` concatenates sources (`"a,b"`) (#49).
- Verified emails found by one enrich connector are folded into the contact list, so a later paid
  connector skips contacts that already have one (#49).
- Every connector retries transient failures (408/429/5xx, network errors) with jitter and `Retry-After`,
  keeps partial results when one contact fails, validates vendor responses, skips single-token and
  `(unknown)` names for name-keyed lookups, and forwards the caller's abort signal (#50, #59).
- MCP `research_domain` / `enrich_lead` return normalized results; raw payloads only with `debug: true`
  (#62).
- `providers` prints `auto-detected provider: none configured` when no key is set (#62).
- The MCP handlers moved to `mcp/tools.ts`; `mcp/server.ts` is a thin stdio entrypoint (#62).
- The MCP server is registered per scope: the plugin manifest uses
  `node ${CLAUDE_PLUGIN_ROOT}/bundle/server.mjs`, the root `.mcp.json` uses `node bundle/server.mjs`. Both
  dropped the `env` passthrough block (#47).
- Skills and agents allowlist both the installed-plugin and project-scope MCP tool names (#62).
- The LLM seam uses `generateText` with `Output.object` instead of the deprecated `generateObject`, with
  output-token caps, a 60s timeout and model-gated effort (#58).
- `npm run evals` runs the keyed harness; offline mode is labelled a wiring check (#61).
- Public skills hardened for the marketplace; runtime claims grounded in code (#38).
- Dependencies: `ai` 7 and `@ai-sdk/*` 4, zod 4.6, `@modelcontextprotocol/sdk` 1.30 (#42); TypeScript 7,
  vitest 5, `@types/node` 26, tsx and esbuild patch bumps (#32); `actions/checkout` v7 (#24) and
  `actions/setup-node` v7 (#30); vendored audit-harness 1.4.0 (#36).
- Docs: DealMachine residential-data addendum to the engine plan (#40); docs, changelog and `000-docs`
  aligned with the hardening work, pre-rebuild files archived and 001–008 number collisions resolved (#57).

### Fixed

- `bundle/cli.mjs` had two shebangs and a dynamic `require` that crashed it; the shipped `intent-outreach`
  binary now runs (#47).
- The MCP server failed with `CONNECTION_CLOSED` in project scope because `CLAUDE_PLUGIN_ROOT` is unset
  there (#47).
- A pack gate returning anything but exactly `clean` (for example `"BLOCKED"`), or throwing, could let a
  contact through or abort the run; the engine now fails closed (#49).
- `DncList.has()` treats input it cannot normalize as listed (#49).
- A torn or concurrent write could glue two runs together and silently drop one; appends are now locked,
  fsynced and repair a torn tail (#48).
- v1 run lines with the legacy `pending`/`drafted` statuses parse again and are kept verbatim (#59).
- PDL person search no longer stops on a company 404 and no longer swallows a 401; Crunchbase no longer
  fabricates empty funding records; Clearbit queued or error bodies count as no result; Exa no longer has
  a hard-coded year (#50).
- CLI EPIPE on a closed stdout exits 0 quietly (#62).
- Built-in connectors and packs no longer overwrite a user's registration of the same name (#62).

### Security

- `saveRun` re-validates every record at runtime, validated records are deep-frozen, and CI rejects casts
  to `Validated` outside `validator.ts` (#48).
- Run store and suppression files are created 0600 in 0700 directories; broader existing permissions are
  tightened; a group/other-readable secrets file triggers a warning (#48, #59).
- Placeholder `${...}`, empty and non-string secret values count as unset (#48).
- **Prompt-injection defenses:** prompts are built from allowlisted fields, and connector data is fenced
  as escaped JSON inside tags, so a value cannot close its own fence (#58).
- **PII minimization:** enrichment data is cut to a B2B allowlist; personal emails, mobile/personal phones,
  home addresses and birth data are dropped, and PDL no longer uses personal emails as contact emails
  (#50).
- **Secret redaction:** connector keys are scrubbed from HTTP error messages, bodies and URLs, and error
  text in `run.errors` is redacted and capped at 500 characters (#49, #50).
- HTTP hardening: https-only (loopback excepted), same-origin redirects only (max 3), 5 MB response cap
  (#50).
- Report output escaping: CSV formula injection, `.eml` header injection, HTML in `<title>` and Slack
  mrkdwn (#46, #59).

### Removed

- The Google model adapter, `@ai-sdk/google`, `GEMINI_API_KEY` and the Gemini pricing rows (#58, #62).
- `evals/promptfooconfig.yaml` and the promptfoo-based `npm run evals` (#61).
- The `env` passthrough blocks in `.mcp.json` and the plugin manifest (#47).
- The PDL `personal_emails` fallback and unlabeled phone numbers; Exa's `data._raw` (#50).

## [0.2.0] — 2026-08-27

### Added

- **OpenAI (gpt-4o) promoted through the provider eval gate** — passed all 7
  golden fixtures (`npx tsx evals/run.ts --providers openai`, 2026-08-20) and is
  now in `SUPPORTED_PROVIDERS`. BYO `OPENAI_API_KEY` runs unguarded; Grok/Gemini
  adapters remain gated until an eval run with a real key passes.

- **Vertical pack seam + compliance module** (PR #16): `pipeline_core/packs/`
  (registry + built-in `b2b-sdr`) composes a pure, clock-injected, fail-closed
  compliance gate (DNC scrub, TCPA quiet hours, service area —
  `pipeline_core/compliance/`) with versioned prompts over the same engine.
  The gate runs before drafting; blocked contacts are recorded on
  `run.blockedContacts`, never drafted. `schemaVersion` 2 added as an additive
  union member (old runs still parse).
- **Plugin re-architecture as orchestrator + phase sub-agents** (PR #19): the
  `/intent-outreach` skill dispatches `outreach-researcher` (per-domain fan-out),
  `outreach-enricher`, and `outreach-drafter` agents; companion slash-command
  skills (`/outreach-connectors`, `/outreach-research`, `/outreach-profile`) and
  a SessionStart connector-readiness hook ship alongside.

### Changed

- Dependencies: Vercel AI SDK v4 → v6 (PR #22, clears all npm-audit findings),
  zod v3 → v4 (PR #23), actions/setup-node v6 (PR #21).
- Seam output schemas are now strict-structured-output compatible across
  providers: `ScoreOutput.angles` is required (was `.default([])`) and
  `DraftOutput.subject` is required-but-nullable (was `.optional()`) — OpenAI's
  json_schema strict mode rejects any property missing from `required`, which
  the eval gate caught on the first real openai run. `null` maps back to
  "no subject" (linkedin) at the Message boundary.
- Governance set: `LICENSE` (Intent Solutions Proprietary), `CONTRIBUTING.md`,
  `CODE_OF_CONDUCT.md`, `SECURITY.md`, `SUPPORT.md`, `.editorconfig`,
  `.gitattributes`, PR template, `CODEOWNERS`, `dependabot.yml`, and a node CI
  workflow (`ci.yml`) alongside the existing policy-enforcement workflow.

## [0.1.0] — 2026-06-16

Rebuild of PipelinePilot (a Gemini-on-Vertex SDR agent) into **Intent Outreach**:
a model-agnostic, Claude-Code-native SDR orchestrator. TypeScript/Node, fully
local, BYO keys, zero Google dependency.

### Added

- `pipeline_core/` — framework-free spine: zod data model, a `Validated<T>`
  validator gate, local JSONL run store, env-only secrets, deterministic
  research/enrich pipeline, provider-pluggable LLM seam (Vercel AI SDK), and a
  full `runCampaign`.
- Connector registry with 9 adapters (Apollo, Hunter, People Data Labs, Exa,
  Crunchbase, LeadMagic, Clay, Clearbit, ZoomInfo) — each self-skipping without
  its key; users can register their own.
- Intent Outreach MCP server (stdio) with `list_connectors`, `research_domain`,
  `enrich_lead`, and `save_run` (validates before persisting).
- Claude Code plugin: orchestrator `SKILL.md` (deterministic phases) + manifest.
- Standalone `intent-outreach` CLI.
- Cross-provider eval harness (`evals/`) — the supported-provider gate.
- Report Profiles (`profiles/`) + multi-format renderers (markdown SSoT → CSV /
  JSON / HTML / Slack / email-draft) with local-only delivery.
- Decision record `000-docs/017-AT-DECR`; connector landscape `000-docs/018-DR-LAND`.

### Changed

- Runtime is now TypeScript/Node (was Python ADK). Data model via zod; model
  access via the Vercel AI SDK.
- Policy CI now enforces "no un-validated model output reaches storage" and a
  zero-Google-import guard, replacing the old `google.adk`/Vertex guards.

### Removed

- Vertex AI Agent Engine, Firebase Functions/Firestore, the Next.js dashboard,
  a committed Python venv, the billing/action-counting scaffold, and the GCP
  deploy scripts (all preserved in git history).
