# Intent Outreach

**AI outbound prospecting for founders who do their own selling — research → enrich → outreach, in
Claude Code, with your own model.**

Intent Outreach is a model-agnostic, Claude-Code-native SDR orchestrator. It researches companies,
enriches the leads, and drafts personalized outreach — running **fully on your machine**, with **your
own** data-provider and model keys, and **zero Google dependency**. MiniMax M3 is the default model. OpenAI
(gpt-4o) and Claude are also enabled; xAI requires explicit selection and a passing keyed model eval.
It drafts and records; it **never sends** a message to anyone.

As a Claude Code plugin, an **orchestrator skill** (`/intent-outreach`) dispatches **phase sub-agents**
(research → enrich → draft) over a **bundled MCP server** that houses your data-provider APIs — keeping
each phase in its own context while the orchestrator checkpoints with you between stages.

> Built for technical founders / indie SaaS & AI startups who do their own outbound — no SDR
> headcount, no per-seat data tools, you own your keys and your data.

---

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/U5S225PTME)

## Why it's different

- **Local-only.** Runs on your machine. No hosted database, no telemetry, no server-side retention.
  See [Where your data lives](#where-your-data-lives).
- **BYO keys.** Connector + model keys live in your environment or a local secrets file. They're read
  locally and sent only to each provider's own API — never to us, never to a cloud secret store — and
  are scrubbed from any error message the tool records.
- **Deterministic where it matters.** Connectors are called in a fixed order in code; the model is
  called only at two seams (fit-scoring, drafting). The LLM never decides which API to hit.
- **A real data model + a hard gate.** Every record is a validated value type. Un-validated model
  output cannot reach storage: the type system rejects it, the store re-validates every record at
  runtime before writing, and CI enforces both.
- **Untrusted data stays data.** Connector and web text is fenced off from the model's instructions, and
  every draft passes a deterministic guard that rejects links, emails or phone numbers that weren't in the
  inputs. A rejected draft is recorded, never saved as a message.
- **Model-agnostic, but earned.** A model runs unguarded only after it passes the eval harness with a real
  key. Approval is per model, recorded in `evals/supported.ts`.
- **Pluggable connectors.** Ships adapters for Apollo, Hunter, People Data Labs, Exa, Crunchbase,
  LeadMagic, Clay, Clearbit, and ZoomInfo — and a registry so you can add your own in one file.
- **Compliance in code, not in the prompt.** A fail-closed gate runs before any draft: your local
  suppression list first, then the pack's own checks (DNC, TCPA quiet hours, service area). Email drafts
  get a CAN-SPAM footer appended by code from your sender identity. `b2b-sdr` ships as the default pack.

Requires **Node.js 22.16 or newer** (Node 22 LTS is used in CI).

## Two ways to run it

### 1. Claude Code plugin (primary)

```text
/plugin marketplace add jeremylongshore/intent-outreach
/plugin install intent-outreach@jeremylongshore
```

Then invoke the skill (`/intent-outreach`) with an ICP and some domains. The skill drives the bundled
**Intent Outreach MCP server** through deterministic Research → Enrich → Outreach phases, checkpoints
with you between each, drafts grounded messages, and saves a **validated** run locally.

The plugin also ships:

- **Phase sub-agents** — the orchestrator skill dispatches one per stage via the `Agent` tool:
  `outreach-researcher` (Phase 1, one per domain — fan-out), `outreach-enricher` (Phase 2),
  `outreach-drafter` (Phase 3, grounded score + draft). Each keeps its own context and calls only the
  deterministic MCP tools for its stage; the orchestrator aggregates and checkpoints with you.
- **Companion skills (slash commands)** — `/outreach-connectors` (which data connectors are
  configured), `/outreach-research` (quick Phase-1-only research without a full campaign),
  `/outreach-profile` (inspect or scaffold a Report Profile). Each is a focused, user-invocable skill.
- **A `SessionStart` hook** that prints a one-line connector-readiness status.

#### The MCP server: plugin scope vs project scope

The same server, named `intent-outreach`, is registered in two places:

| Where you run Claude Code | Entry used | Command | Tool names |
|---|---|---|---|
| Anywhere, with the plugin installed | `.claude-plugin/plugin.json` `mcpServers` | `node ${CLAUDE_PLUGIN_ROOT}/bundle/server.mjs` | `mcp__plugin_intent-outreach_intent-outreach__<tool>` |
| Inside a checkout of this repo | root `.mcp.json` (project scope) | `node bundle/server.mjs` (relative to the repo root) | `mcp__intent-outreach__<tool>` |

The skills and agents allowlist both tool-name forms. Neither entry has an `env` block: a stdio server
inherits your shell environment, so set provider keys in the environment Claude Code starts from (or in the
local secrets file).

`save_run` applies the same compliance chain as the CLI: suppression list, pack gate, draft guard and the
CAN-SPAM footer. A duplicate run id is rejected unless the call passes `overwrite: true`. The footer comes
from the `profile` argument, or from the profile named by `INTENT_OUTREACH_PROFILE`.

### 2. Standalone CLI

```bash
pnpm install --frozen-lockfile                    # only needed to develop/regenerate; the bundle is committed
node bundle/cli.mjs run --icp "B2B SaaS founders doing their own outbound" \
                        --domains acme.com,globex.com --channel email --profile my-profile
node bundle/cli.mjs connectors   # which connectors are configured
node bundle/cli.mjs providers    # model providers + eval-gate status
node bundle/cli.mjs suppress list
```

`bundle/cli.mjs` and `bundle/server.mjs` are committed, dependency-inlined builds (so the plugin runs
on a fresh clone with no `node_modules`); regenerate them with `pnpm run bundle`.

`run` options: `--icp` and `--domains` (required), `--profile <path|name>`, `--provider
anthropic|openai|minimax|xai`, `--model`, `--channel email|linkedin`, `--min-score 0-100`, `--max-contacts 1-50`,
`--buyer-titles "CTO,COO,VP Operations"` (ranks each lead's contacts buyers-first before drafting and aims
Apollo reveals at them; overrides the profile's `filtering.contactTitles`), `--out <path>`, `--json`. Every flag is validated before anything is spent; a bad or unknown flag prints an
error and exits with code **2** (runtime failures exit 1).

`--profile` takes a path to a Report Profile JSON file, or a name looked up in `./profiles`, then
`$INTENT_OUTREACH_HOME/profiles`, then the bundled `profiles/`. The profile's channel, minimum score and
tone become defaults; explicit flags win. Its `sender` block drives the CAN-SPAM footer (below).

## MiniMax M3 from SOPS

MiniMax M3 is the default when its key is available; Grok/xAI is no longer
auto-selected. The exact model/pack eval gate still applies. Use the existing
SOPS/age file with `minimax.key` (default
`~/.config/intentsolutions/api-providers.sops.json`):

```sh
python3 scripts/with-minimax.py --probe
python3 scripts/with-minimax.py -- node bundle/cli.mjs providers
python3 scripts/with-minimax.py -- node bundle/server.mjs
```

The launcher decrypts only in memory and passes the native MiniMax credential
and OpenAI-compatible `LLM_*`, `JRIG_EVAL_API_KEY`, `JRIG_AGENT_API_KEY` variables
to the explicit command. It fixes the endpoint to `https://api.minimax.io/v1`
and model to `MiniMax-M3`; it never writes a plaintext token or invokes Grok.
For J-Rig, use a case config with provider `minimax`, model and judgeModel
`MiniMax-M3`, and that same base URL, then launch its `run-case.ts` through
this wrapper. A probe establishes availability only; it is not an eval pass.

## Sender identity and CAN-SPAM

CAN-SPAM requires every commercial email to identify the sender, carry a valid postal address and offer a
working opt-out. Intent Outreach never lets the model write those lines. Add a `sender` block to your
Report Profile:

```json
{
  "sender": {
    "name": "Jane Founder",
    "company": "Example Co LLC",
    "postalAddress": "123 Main St, Suite 4\nSpringfield, ST 00000",
    "replyToEmail": "jane@example.com",
    "optOutText": "Not interested? Reply \"unsubscribe\" and I won't contact you again.",
    "optOutOnLinkedin": false
  }
}
```

`name`, `company` and `postalAddress` are required; the rest are optional.

- **Email drafts:** after a draft passes validation, code appends a `--` signature-delimiter line, `Name, Company`, the
  postal address, an optional `Reply-To:` line and the opt-out line. The default opt-out line is *Not the
  right person or not interested? Reply "unsubscribe" and I won't contact you again.*
- **No sender, or an incomplete one:** nothing is appended and nothing is invented. The message is flagged
  `needsSenderIdentity: true` and the run records a `complianceWarnings` entry. Configure `sender` before
  you send those drafts.
- **LinkedIn drafts:** no postal footer. Set `optOutOnLinkedin: true` to append the opt-out sentence.

## Voice rules

Want drafts in your own voice? Add an optional `voice` block to your Report Profile:

```json
{
  "voice": {
    "banDashes": true,
    "deniedPhrases": ["delve", "game-changer", "seamless"],
    "notes": "Short sentences, plain words, no hype."
  }
}
```

- **`banDashes`:** rejects em and en dashes (and their HTML entities) and hyphens used as dashes
  (`word - word`, `word--word`). Hyphenated words like `follow-up` are fine.
- **`deniedPhrases`:** case-insensitive, whole-word, exact-phrase matches on subject, body and CTA
  (`delve` does not match `delved`; list inflections you want banned).
- **`notes`:** free-text guidance appended to the draft style override, like `tone`.

The rules are enforced in code by the draft guard on both the CLI/`runCampaign` path and MCP
`save_run`. A violating draft lands in `rejectedDrafts` (for example `voice: em dash (body)`), never
in `messages`. The CAN-SPAM footer is appended after the check, so it never trips it. See
`profiles/operator-voice.example.json` and `profiles/000-INDEX.md`.

## Suppression list (opt-outs)

Everyone who asks not to be contacted goes on a local list that every run honors, ahead of any pack's
own checks:

```bash
intent-outreach suppress add jane@acme.com --reason "replied unsubscribe"
intent-outreach suppress add globex.com          # a domain also covers its subdomains
intent-outreach suppress add "(251) 555-0100" --reason "replied STOP"   # phone, stored as E.164
intent-outreach suppress add "12 Main St, Foley, AL 36535"             # mailing address
intent-outreach suppress remove globex.com
intent-outreach suppress list
```

(From a checkout, use `node bundle/cli.mjs suppress …`.) Matching ignores case and whitespace. A suppressed
contact is recorded in the run's `blockedContacts` and never drafted. If `suppressions.jsonl` has a corrupt
line, the run refuses to start rather than risk emailing someone who opted out.

## Property campaigns (residential real estate)

`property-run` drafts short letters to the owners of record of homes in the agent's market, with the
`residential-re` pack:

```bash
intent-outreach property-run --icp "Listing agent for Perdido Key homes" --zips 32507 --profile ./agent.json
intent-outreach property-run --icp "..." --parcels 12033:082S305005000002 --budget-credits 50
```

External CRM adapters can run `intent-outreach validate-run < run.json` to use the same
schema and defaults as storage. It emits normalized JSON on success, exits 2 on invalid
input, and opens no store or provider. Input is limited to 16 MiB. This validates structure;
it does not approve drafts, establish consent, or authorize a send. Add `--with-retention`
to receive `{version: 1, run, expiresAt}` using the engine's pack/vendor retention policy.
Adapters must reject expired exports and honor that deadline on their retained copies;
validation alone does not enforce retention in an external CRM.

An ERPNext adapter can supply `--crm-context ./crm-context.json` to `property-run` and
`check-send`. Validate the snapshot with `intent-outreach validate-crm-context < crm-context.json`.
The strict version-1 shape is:

```json
{
  "version": 1,
  "source": "erpnext",
  "generatedAt": "2026-10-06T12:00:00Z",
  "expiresAt": "2026-10-06T12:15:00Z",
  "suppressions": [{"kind": "phone", "value": "+12515550100"}],
  "doNotResearch": [{"kind": "parcel", "value": "01003:EXAMPLE-APN"}]
}
```

Generate fresh timestamps on each successful **complete** CRM pull; the maximum lifetime is
15 minutes. Missing files, malformed identifiers, future timestamps and expired snapshots
abort commands that supply the flag. Omission preserves standalone behavior. The adapter
must require a fresh pull for each research/send operation; this flag does not automatically
connect to ERPNext or cover monitor/inbound commands. Identifiers may be `parcel` (FIPS:APN),
`party` (engine party key), `email`, `phone`, `address` (full mailing address), or `domain`.
CRM suppressions add to local opt-outs and never clear them; research exclusions are separate.

Named excluded parcels are skipped before discovery. Area queries must discover records
before matching known owner/contact identities: excluded parcels and their unneeded owner
records are then removed before enrichment, model calls and run storage. Research caching
is disabled when a do-not-research list is present; existing cache files are not erased by
this option. Co-owners and linked entities are considered. Unresolved identities cannot be
matched by name. A stale snapshot during discovery or scoring stops further model work.
Refresh CRM context for the final `check-send` too; an earlier draft is not proof of permission.
The snapshot contains identifiers: keep temporary files private (0600) and delete after use.

Both scoring and drafting models need a verified `residential-re` approval in
`evals/supported.ts`. B2B approval does not qualify a model for this pack. The same
requirement applies to monitor drafts and residential inbound replies. An unapproved
selection stops with the command needed to qualify it; see [the eval gate](evals/README.md).
`INTENT_OUTREACH_ALLOW_UNGATED=1` is an explicit override for local testing only.

Public records come from free, keyless sources (`000-docs/035`): the Florida statewide parcel roll and
FEMA flood zones. Every owner passes the suppression list and the pack's gate first: the service area,
manual review for probate, divorce and pre-foreclosure, known active listings, government owners, and the
license terms of the record (outreach must be explicitly allowed by the source). Drafts never mention the
owner as a person (age, family, marital status...) or any distress (foreclosure, liens...). Your profile's
`sender` needs `licenses` for the brokerage and license line on every letter. Nothing is mailed: every
draft waits in the approval queue. Turn the public-records connectors off with
`INTENT_OUTREACH_PUBLIC_RECORDS=0`.

Coverage today: Florida (Escambia, Okaloosa) through the state roll. Baldwin County, AL is pending the
owner's confirmation of the data terms with the Revenue Commission; Mobile County publishes no mailing
address.

## Approval queue

Every saved draft waits for a person. Nothing passes the send-time check until someone approves that
exact text; editing a draft afterwards voids the approval.

```bash
intent-outreach approvals pending                                  # each draft in full, with a digest
intent-outreach approvals approve <runId> <contactKey> --digest <digest> [--note "..."]
intent-outreach approvals reject  <runId> <contactKey> [--note "..."]
```

Decisions go to `$INTENT_OUTREACH_HOME/approvals.jsonl` (0600, append-only; a later decision on the same
text supersedes an earlier one). In Claude Code the same queue is the `list_pending`, `approve` and
`reject` MCP tools, which the skill calls only on your explicit word. Be clear about what that means: an
MCP approval is agent-mediated. The server cannot prove a person read the draft; Claude Code's
tool-permission prompt is the human checkpoint, and the ledger records such decisions as `by: "mcp"`. For
a strictly human approval, use the CLI, which records your OS user.

## Send-time check (for whatever sends)

Intent Outreach drafts and never sends. Whatever does send (a dispatcher, a person) must check each
message at the moment of sending, because a STOP, a revoked consent, quiet hours or a DNC result can
arrive after drafting. In TypeScript call `checkSendable` / `assertSendable` from
`pipeline_core/compliance/send.ts`; from any other language pipe JSON to the CLI:

```bash
intent-outreach check-send --profile ./my-profile.json < message.json   # exit 0 = sendable; anything else = do not send
```

Pass `runId` and `contactKey` with the message: it must match an approved draft exactly. It also checks
the local suppression list, DNC status (phone channels need exactly `clean`), consent from the
ledger you pass in (SMS needs written consent; any revocation voids every channel), the recipient-local
phone window, the channel footer (the exact block for that channel must end the body, including the
license line when the pack requires it), and data whose license restricts outreach. It prints every
blocking reason as JSON. Exit 0 means sendable, 3 means not sendable, 2 means bad input; a dispatcher
must treat **any non-zero exit** as "do not send".

The phone window is deliberately conservative: **8am–8pm recipient-local, Monday–Saturday** (Texas from
9am), a superset of the TCPA and the Gulf states' telephone-solicitation statutes as we understand them.
Holidays are not modeled. An unknown or unlisted location is checked against every US time zone. This
is engineering, not legal advice: have counsel review before automating SMS or calls.

## Keys (bring your own)

Set only the providers you want; unset connectors are skipped. Provider access, pricing, and quotas
change independently, so use `/outreach-connectors` for the repository's current runtime notes and
confirm commercial terms with the provider before a campaign.

| Env var                             | Provider                                                 | Tier             |
| ----------------------------------- | -------------------------------------------------------- | ---------------- |
| `APOLLO_API_KEY`                    | Apollo.io — company, people, enrichment                  | registry: free   |
| `HUNTER_API_KEY`                    | Hunter.io — email finding/verification                   | registry: free   |
| `PDL_API_KEY`                       | People Data Labs — person/company enrichment             | registry: free   |
| `EXA_API_KEY`                       | Exa — web research context                               | registry: free   |
| `CRUNCHBASE_API_KEY`                | Crunchbase — funding/investors                           | paid             |
| `LEADMAGIC_API_KEY`                 | LeadMagic — email finding                                | paid             |
| `CLAY_API_KEY` + `CLAY_WEBHOOK_URL` | Clay — middleware (push-only)                            | paid             |
| `CLEARBIT_API_KEY`                  | Clearbit — enrichment                                    | registry: legacy |
| `ZOOMINFO_JWT`                      | ZoomInfo — enrichment                                    | enterprise       |
| `ANTHROPIC_API_KEY`                 | Claude (explicit selection)                                   | —                |
| `OPENAI_API_KEY`                    | OpenAI gpt-4o                                            | —                |
| `MINIMAX_API_KEY`                   | MiniMax-M3 (OpenAI-compatible; keyed eval gate passed)   | —                |
| `XAI_API_KEY`                       | Grok (adapter ready; gated until a keyed eval run passes) | —               |

The anthropic and openai approvals in `evals/supported.ts` are legacy claims marked `verified: false`; they
stay enabled and need a keyed re-run to become verified records. Running a model with no approval record
under a supported provider prints a warning on stderr.

Other settings:

| Env var | Effect |
|---|---|
| `INTENT_OUTREACH_HOME` | Data directory (default `~/.intent-outreach`). Must be an absolute path. |
| `INTENT_OUTREACH_SECRETS_FILE` | Local secrets JSON (default `$INTENT_OUTREACH_HOME/secrets.json`). Absolute path. |
| `INTENT_OUTREACH_STORE_KEY_FILE` | Absolute path to the 32-byte run-store encryption key. Defaults to `<database>.key`; store and back it up separately from the database. |
| `INTENT_OUTREACH_MODEL` | Override the model id for the chosen provider. |
| `INTENT_OUTREACH_PROFILE` | Report Profile used by MCP `save_run` when the call doesn't pass one. |
| `INTENT_OUTREACH_KEEP_RAW=1` | Allow full vendor payloads in explicit debug responses where supported. Never bypasses normalized B2B field allowlists or enables raw cache/run retention. |
| `INTENT_OUTREACH_PROMPTS_DIR` | Load prompt files from another directory. |
| `INTENT_OUTREACH_ALLOW_UNGATED=1` | Let a provider with no approved model run (local testing only). |

Provider/configuration empty values and literal `${...}` placeholders count as unset. The store key path must be a real absolute path; empty values are rejected.

To drive a non-Anthropic model from inside Claude Code, point `ANTHROPIC_BASE_URL` at an LLM gateway
(LiteLLM/Bifrost). See `000-docs/017-AT-DECR`.

## Where your data lives

Everything is local, under `INTENT_OUTREACH_HOME` (default `~/.intent-outreach`):

| File | Contents |
|---|---|
| `runs.sqlite` | Encrypted validated runs, retention deadlines and an append-only audit of operations. |
| `runs.sqlite.key` | Automatically created 32-byte master key (unless `INTENT_OUTREACH_STORE_KEY_FILE` is set). |
| `runs.jsonl` | Legacy plaintext records, preserved during explicit migration. |
| `suppressions.jsonl` | Your opt-out list. |
| `secrets.json` | Optional local keys (a warning is printed if group/other can read it). |
| `profiles/` | Optional Report Profiles you can name with `--profile`. |

Run-store directories are created with mode **0700** and database/key files with **0600**.
Existing database/key permissions are tightened on access. Runs are encrypted with AES-256-GCM
before SQLite sees them; run IDs use keyed hashes. Each save and its audit event commit in one
transaction. Reads authenticate and revalidate records, returning frozen values. Wrong keys,
corruption and unsupported database versions fail closed.

The key is generated automatically on first use. Set `INTENT_OUTREACH_STORE_KEY_FILE` **before
first use** to keep it elsewhere. Back it up separately: losing it makes runs unrecoverable;
changing the path does not rotate the key. An existing database with a missing key refuses to open.
This protects a database disclosed without its key. It does not protect against someone who can
read both, or a compromised running account. SQLite page metadata, counts, timestamps and encrypted
payload lengths remain visible. This is application-level encryption, not SQLCipher.

Residential, commercial and unknown packs retain runs for **30 days**, B2B for **365 days**, measured
from run creation. An earlier vendor `retentionDays` deadline expires the entire run; timestamps in
the future cannot extend it. Overwrites cannot extend a stored deadline. Successful run reads/writes
purge expired records; schedule `store purge` daily on machines that otherwise sit idle. These local
minimization defaults do not grant permission to retain vendor data. Old payloads are replaced, while
an audit keeps opaque identifiers, times, operation types and keyed integrity digests. Audit updates
and deletes are blocked by SQLite triggers and an authenticated chain detects changes. An external
trusted checkpoint would be needed to detect restoration of an entire older database backup.

```bash
# Required once if the default runs.jsonl already exists. Source stays untouched.
node bundle/cli.mjs store migrate
# Custom source/destination; --out now means an encrypted SQLite database.
node bundle/cli.mjs store migrate --from /path/old.jsonl --out /path/runs.sqlite
node bundle/cli.mjs store purge
node bundle/cli.mjs store audit
```

Migration validates every input line, imports the latest snapshot per ID into an empty database,
and records expired runs without retaining their contents. Any invalid line aborts the import.
Repeating an unchanged import is safe. The default store refuses to hide an unimported or changed
legacy file. Review the import counts and inspect runs with `approvals pending` or MCP `list_runs`
before removing the plaintext source according to your retention policy. Migration never removes
it for you; old backups and exports need their own retention process. Restoring an older application
requires its preserved JSONL records; older releases cannot read this encrypted database.

The built-in packs declare their normalized-data policy in code. `b2b-sdr` keeps business contacts
and business enrichment fields, excluding the property-owner model. `residential-re` retains typed
owner names, mailing addresses, contact points, DNC status and license/provenance records. Property
attribute bags use an allowlist for parcel, value, listing and gate facts; a trusted custom pack can
add fact keys through `piiPolicy.propertyAttributes`, but protected person fields stay excluded.
The same property policy applies to property enrichment and monitors. Custom packs using the B2B
campaign entrypoint must explicitly select `{ kind: "property-owner" }` to retain owner data.

Normalized B2B enrichment always uses the connector allowlists and recursively drops known personal
fields, including with `KEEP_RAW=1`. MCP `save_run` also minimizes enrichment bags. This is a field
policy, not a detector for personal information embedded in arbitrary prose. Explicit debug/raw
responses and user-written messages still need appropriate handling; the legacy storage API does
not retroactively rewrite previously saved records.

Research caches include the policy and retention limit in their identity and reapply minimization
on hits. Cache writes omit raw responses and expire at the earlier connector TTL, pack limit or
vendor deadline. Access and `store purge` remove expired/corrupt cache files; caches written before
this policy are discarded. Monitor snapshots expire at the earliest vendor deadline or 30 days,
without extending the deadline as old facts are merged. Cleanup preserves monitor definitions and
active checks. After expiry, a successful nonempty check establishes a new baseline without firing
new-parcel events; a failed or empty check cannot establish that baseline. Schedule `store purge`
for cleanup on idle machines. Its output includes run, cache-entry and snapshot removal counts.

Encryption applies to the run store. Suppression/consent/approval ledgers, provider caches, monitor
snapshots, explicit exports and delivery outputs have separate storage paths and are **not encrypted
by this adapter**. See [SECURITY.md](SECURITY.md) for that boundary.

## Architecture (one screen)

```text
orchestrator skill  ─┐                     ┌─ list_connectors ──┐
  → phase agents     ├─► Intent Outreach ──┤  research_domain    ├─► pipeline_core
  (R→E→O, fixed)     │     MCP server      │  enrich_lead        │   (framework-free)
standalone CLI ──────┘                     └─ save_run ──────────┘
                                                                     │
                                                                     ├─ connectors/ (registry; 9 adapters)
  research() → enrich()  : deterministic, fixed connector order      ├─ providers.ts (Vercel AI SDK; eval-gated)
  score() → draft()      : the ONLY LLM calls (structured output)    ├─ draft-guard.ts + compliance/ + footer.ts
  gate → guard → footer  : suppression + pack gate, fail-closed      ├─ validator.ts (the gate: Validated<T> brand)
  validate → save        : un-validated output can't be stored       └─ encrypted-store.ts (local SQLite; never hosted)
```

- **`pipeline_core/`** — the framework-free spine (CI-guarded against any Google/cloud import).
- **`mcp/`** — one stdio MCP server (`server.ts`) with its handlers in `tools.ts`; a thin wrapper over
  `pipeline_core`.
- **`skills/intent-outreach/SKILL.md`** — the orchestrator skill; dispatches phase agents in fixed order.
- **`skills/outreach-{connectors,research,profile}/`** — focused companion skills (the slash commands).
- **`agents/`** — phase sub-agents (`outreach-researcher`, `outreach-enricher`, `outreach-drafter`).
- **`hooks/`** — `SessionStart` connector-readiness hook.
- **`prompts/`** — versioned prompt files. Each message records the exact prompt as `file@sha8`.
- **`evals/`** — golden fixtures, scorers, the keyed eval harness and the per-model approval records.
- **`profiles/`** — Report Profile schema and starters. The skill path automatically maps channel,
  score threshold, contacts-per-lead, and style; renderer and delivery helpers are separate APIs.

## Develop

Use pnpm 10.8.1 (pinned in `package.json`) and the [workspace conventions](packages/README.md).

```bash
pnpm install --frozen-lockfile
pnpm run typecheck      # tsc --noEmit
pnpm test               # vitest
pnpm run bundle         # rebuild bundle/ (what ships); commit the result
pnpm run mcp            # run the MCP server on stdio (tsx)
pnpm exec tsx evals/run.ts --offline   # free wiring check (CI); not a model-quality gate
pnpm run evals          # keyed eval harness (needs ANTHROPIC_API_KEY, costs money)
```

### Approving a model (the eval promote flow)

A model is approved only by a passing keyed run: repeat ≥3, every fixture passing every run, with score
bands, angle grounding and the product draft guard all checked.

```bash
export ANTHROPIC_API_KEY=...
pnpm run evals:promote --provider anthropic --model claude-sonnet-5-5   # add --judge for an LLM judge
```

On a pass it writes `evals/results/<date>-<provider>-<model>-<promptRef>.json` and marks the pair
`verified: true` in `evals/supported.ts`; commit both. It never changes the default model; it prints the
one-line `DEFAULT_MODEL` edit for you to make as a separate, reviewed change. Details: `evals/README.md`.

## License

Intent Solutions Proprietary — see `LICENSE`.
Built by Jeremy Longshore · intentsolutions.io

## Generated integration contracts

External TypeScript consumers can pin an engine commit and use the standalone declarations in
[`contracts/`](contracts/README.md). `pnpm run contracts:generate` derives them from the canonical
Zod output schemas; normal tests reject stale artifacts and typecheck proves both-way structural
compatibility. These types cover runs, property/party/contact records, messages, consent and DNC.
Runtime refinements and send eligibility still require the canonical engine validators.
