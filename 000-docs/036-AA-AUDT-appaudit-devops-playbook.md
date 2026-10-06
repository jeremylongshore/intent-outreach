# Intent Outreach: Operator-Grade System Analysis and Handoff

*Generated: 2026-10-06*
*Version: `main` at `7717bb15` (last tag `v0.3.0`, 2026-10-04; everything below "Unreleased" is on `main` but not tagged)*
*Audience: the next engineer or agent (Codex, Claude, a person) picking this repo up cold. Read Section 1, then
Section 11 ("Current State") and Section 12 ("Roadmap"). Section 14 is the exact resume procedure.*

---

## 1. This System in 5 Minutes

Intent Outreach is a local, bring-your-own-keys lead engine. It researches prospects through data-provider APIs,
scores them with a language model, and drafts personalized outreach. It **never sends anything**. It records drafts in a
local append-only run store, a person approves the exact text, and a separate dispatcher (owned by the client repo,
not this one) is required to call this engine's send-time check before anything goes out. It runs on the user's machine
with the user's own data and model keys, has **zero Google dependency**, and Claude is the default model.

It began as a B2B SDR tool ("companies by domain → contacts → cold email") and, since 2026-10-05, has been extended
into a **real estate lead engine** for a residential listing agent (Mandy, Gulf Coast Alabama and west Florida). The
design is "one engine, many packs": the engine owns research, enrichment, compliance gates, scoring, deal math,
drafting, the draft guard and evals; a **pack** (`b2b-sdr`, `residential-re`) supplies gates, prompts, draft rules,
channel policy and data-source routing. There are exactly two campaign loops: `runCampaign` (companies by domain) and
`runPropertyCampaign` (owners of record by typed property query), plus the new `runInbound` (first reply to a website
inquiry).

You use it two ways. The primary surface is a **Claude Code plugin**: a skill (`skills/intent-outreach/SKILL.md`) that
drives a bundled MCP server (`bundle/server.mjs`) with ten tools. The second surface is a **CLI**
(`bundle/cli.mjs`, the `intent-outreach` binary) with commands for campaigns, property runs, inbound replies,
suppressions, approvals, the send-time check, monitors and key quotas. Both surfaces call the same framework-free
TypeScript core in `pipeline_core/`.

Current state: the B2B product is hardened and released as `v0.3.0`. The real estate program (GitHub #83, bead epic
`io-2yt`, Plane `OUTR-3`) has landed Phases 1–6 and 8 and the engine half of Phase 7 on `main` (PRs #85–#105), with
**1,347 tests**, coverage above every floor, and CI green. Schema v6 (the property/owner model) is **unreleased**:
`main` writes v6 runs that a `v0.3.0` binary cannot read. What remains is mostly *outside* this repo (the coastal
ERPNext sink, wiring the web form to the engine) or *owner decisions* (brokerage license data, county data terms, the
residential drafting model, paid data).

The biggest risk is not code quality; it is **compliance coupling across repos**. The engine's guarantees (suppression,
consent, quiet hours, approval of exact text, license disclosure, fair housing) only protect a real person if the client
dispatcher in `coastal-realty-ops` actually calls `check-send` / `assertSendable` before sending. That dispatcher does
not exist yet. Until it does, nothing should be sent from these drafts by any automated path.

---

## 2. Executive Summary

### What It Does

**Capabilities (implemented, tested, on `main`):**

- B2B campaigns: research → enrich over 9 keyed connectors (Apollo, Hunter, People Data Labs, Exa, Crunchbase,
  LeadMagic, Clay, Clearbit, ZoomInfo), deterministic order, per-lead failure isolation, a fail-closed compliance gate,
  grounded scoring, drafting with a draft guard, CAN-SPAM footer in code, validated storage.
- Property campaigns: typed queries (area by ZIP, parcel by FIPS+APN) → two keyless public-records connectors
  (Florida DOR parcels, FEMA flood zones) → owner suppression on every party and contact point → the residential
  property gate (license terms, service area, probate/divorce/pre-foreclosure manual review, active-listing check) →
  signals computed in code → score → deal math in code → draft (fair-housing + distress-language rules) → license
  disclosure footer → one validated v6 run.
- Inbound first replies (`runInbound`): suppression → per-channel consent → fenced draft → guard → footer → run with
  `inbound.speedToLeadMs`.
- Send-time compliance (`checkSendable` / `assertSendable`, CLI `check-send`): approval of the exact text,
  per-channel policy (tighten-only pack overrides), consent ledger, recipient-local phone window, DNC, suppression,
  sender identity and the exact footer.
- Human approval queue bound to sha256 of the exact message.
- Event monitors (owner/value/listing/distress changes on watched ZIPs or parcels, draft only the changes).
- Provider layer: capability routing (first-hit / ordered-fallback / all), per-run credit budget, response cache,
  token-bucket rate limits, multi-key rotation with monthly quotas, and a vendor-MCP-server connector wrapper with
  pinned tool definitions.
- Deal math (`packages/deal-math`): integer cents, basis points, half-even rounding, golden parity with coastal's
  `trade_up.py` (154 cases + 20,000-case fuzz).
- Eval harness with a promotion gate: a model is approved per `{provider, model, pack}` only if every fixture passes
  every one of 3 repeats.

**Scaffolded or not built:** see Section 4 "What Was Deliberately Not Built" and Section 11 "Implementation Status".
The notable gaps: no Alabama county parcel connector (terms pending), no DealMachine connector (paid seat pending), no
encrypted run store, no ERPNext sink, no dispatcher, no residential-approved model.

**Technology foundation:** TypeScript on Node ≥ 20 (ESM), zod v4 for every schema, the Vercel AI SDK v7 for model
calls, the official MCP TypeScript SDK, esbuild to produce committed single-file bundles, vitest, Biome, Stryker
(mutation, scheduled), and a vendored Intent Solutions audit harness that hash-pins CI and test config.

**Key risks:** (1) cross-repo compliance coupling (above); (2) schema v6 is forward-incompatible for old binaries;
(3) no residential model has passed the eval gate, so residential drafting currently runs "ungated" or not at all;
(4) the property path's listing check passes when listing data is absent (free records carry no MLS status).

### Operational Status

| Environment | Status | Uptime Target | Release Cadence | Last Deploy |
|-------------|--------|---------------|-----------------|-------------|
| Production | **Not a hosted service.** Ships as a Claude Code plugin + CLI run on the user's machine. | n/a | Tagged releases: v0.1.0 (2026-06-16), v0.2.0 (2026-08-27), v0.3.0 (2026-10-04) | `v0.3.0` tag; `main` is 33 commits ahead |
| Staging | None | n/a | n/a | n/a |
| Local Dev | Working; `npm ci && npm test` | n/a | continuous on `main` via squash-merged PRs | `7717bb15` |
| Adjacent prod (not this repo) | VPS `forms-api` route `POST /api/forms/mandy-lead` → Buzz channel `mandy-leads` is **live** (Track 0, verified 2026-10-06) | Slack-free, Buzz-only alerts | intent-os deploy contract | 2026-10-06 |

### Technology Stack

| Category | Technology | Version | Purpose |
|----------|------------|---------|---------|
| Language/runtime | TypeScript on Node.js | TS `^7.0.2`, Node `>=20` (`package.json` engines) | Everything |
| Schemas | zod | `^4.6.5` | Every value type, vendor response check, tool input |
| LLM | Vercel AI SDK (`ai`) + `@ai-sdk/anthropic` | `^7.0.114`, `^4.0.63` | `generateText` + structured output |
| Optional LLM adapters | `@ai-sdk/openai`, `@ai-sdk/openai-compatible`, `@ai-sdk/xai` | optionalDependencies | OpenAI, MiniMax (OpenAI-compatible), xAI |
| Agent surface | `@modelcontextprotocol/sdk` | `^1.32.1` | The bundled MCP server; also the vendor-MCP client |
| Bundler | esbuild | `^0.28.2` | `bundle/server.mjs`, `bundle/cli.mjs` (committed) |
| Tests | vitest + v8 coverage | `^5.0.0` | Unit, integration, e2e |
| Lint | Biome | `^2.5.15` | `npm run lint` |
| Mutation | Stryker | `^10.0.0` | Scheduled `mutation.yml` |
| Workspace | npm workspaces | `packages/*` | `packages/deal-math` |
| Test SOP | `@intentsolutions/audit-harness` (vendored, `.audit-harness/`) | per `.harness-hash` | Hash-pins 7 governed files |

---

## 3. Architecture

### Stack (Detailed)

| Layer | Technology | Purpose | Why This |
|-------|------------|---------|----------|
| Core | Plain TypeScript modules in `pipeline_core/` | Data model, gates, pipeline, store | No framework lock-in; invariant 4 forbids LangChain/LlamaIndex/Genkit (`CLAUDE.md`). Rationale: `000-docs/017-AT-DECR` D5. |
| Validation | zod schemas in `pipeline_core/models.ts` | One source of truth for every stored record | Runtime validation of model output and vendor payloads; types derived from schemas, so the two can't drift. |
| Storage | Append-only JSONL under `~/.intent-outreach/` | Runs, approvals, suppressions, monitors, cache, quotas | Local-only by product promise; no hosted DB. Lockfile + fsync append + torn-tail repair in `store.ts`. |
| LLM | Vercel AI SDK v7 | Two seams only (score, draft) | Provider-agnostic structured output; real usage metering. |
| Agent surface | MCP server (`mcp/server.ts` thin entry, handlers in `mcp/tools.ts`) | Lets Claude Code drive the deterministic phases | The plugin is the primary product surface. |
| Distribution | Committed esbuild bundles | A fresh clone runs the plugin with no `node_modules` | Plugin installs from a git source; CI checks bundle freshness. |
| Deal math | `packages/deal-math` (zod only) | Pure, auditable money math | The LLM never does arithmetic; drafts quote computed facts. |

### System Diagram

```text
                 ┌────────────────────── user's machine ───────────────────────┐
 Claude Code ──► skill (SKILL.md) ──► MCP server (bundle/server.mjs, stdio) ──┐  │
                                       10 tools: list_connectors,            │  │
                                       research_domain, enrich_lead,         │  │
                                       save_run, list_pending, approve,      │  │
                                       reject, list_runs, suppress,          │  │
                                       underwrite                            ▼  │
 Terminal ─────► CLI (bundle/cli.mjs) ─────────────────────────────► pipeline_core/
                 run | property-run | inbound | monitor | approvals   │         │
                 | suppress | check-send | keys | connectors          │         │
                 | providers                                          │         │
                                                                      ▼         │
   ┌──────────── fixed order, capability-routed, budgeted ────────────┐         │
   │ connectors/ (httpJson: https-only, retries, 5 MB cap, redaction, │         │
   │ token buckets) ──► vendor APIs (BYO keys)                        │         │
   │ connectors/mcp.ts ──► vendor MCP servers (pinned definitions)    │         │
   └──────────────────────────────────────────────────────────────────┘         │
         │ research/enrich output (zod-checked, PII-allowlisted)                 │
         ▼                                                                       │
   gates: suppression ─► pack gate / propertyGate ─► (fail closed)               │
         ▼                                                                       │
   seam.ts / property-seam.ts ──► LLM provider (Anthropic default; BYO key) ─────┼──► model API
         ▼  (fenced untrusted data, grounded reasons, bounded tokens/time)       │
   draft-guard (urls/emails/phones, quantities, stock openers, pack rules)       │
         ▼                                                                       │
   footer.ts (CAN-SPAM / license disclosure in code) ─► validator.ts (brand)     │
         ▼                                                                       │
   store.ts ──► ~/.intent-outreach/runs.jsonl (0600, append-only)                │
                ~/.intent-outreach/approvals.jsonl, suppressions.jsonl, ...      │
                 └───────────────────────────────────────────────────────────────┘
                          │ (NOT this repo) a dispatcher in coastal-realty-ops must
                          ▼ call check-send / assertSendable, then send.
```

Failure domains: each connector invocation has its own deadline (default 90 s, `pipeline.ts:74-78`) and its failure is
recorded as a sanitized status in `run.failedConnectors`, never thrown; each lead/property is isolated (`run.errors`);
an LLM seam failure isolates to that lead; storage refuses invalid records.

### The Critical Path

The most important flow today is a **property campaign** (`intent-outreach property-run`, `cli.ts` `cmdPropertyRun`
→ `runPropertyCampaign` in `pipeline_core/property-campaign.ts`):

1. **Flag validation before spending** (`cli.ts`): `--zips` must be 5-digit; `--parcels` must be `<countyFips>:<apn>`;
   `--max-properties` 1–500; `--profile` must load (it carries the sender identity). Fails as `UsageError`.
2. **Provider resolution** (`providers.ts` `getProvider`): explicit `--provider/--model`, else auto-detect in
   `DETECT_ORDER` (`anthropic, openai, minimax, xai`). An unapproved `{provider, model}` warns unless
   `INTENT_OUTREACH_ALLOW_UNGATED=1`. Optional `--score-provider/--score-model` gives a cheaper scorer.
3. **Research per query** (`pipeline.ts` `runResearchQuery`): the pack's `dataSources.research` routing picks
   connectors by capability (`routing.ts`), in registration order (`connectors/index.ts`). The credit budget is charged
   **before** each paid call; an exhausted budget stops paid calls. The response cache answers repeats.
   **Failure point:** Florida DOR returns HTTP 400 for a ZIP query without the county filter; the connector always adds
   `CO_NO` (fixed earlier). A connector failure is recorded and the run continues.
4. **Merge the property model** (`mergePropertyModel`): Property (`FIPS:APN`), Party, Ownership, ContactPoint, each
   value a `Fact` with source, time, response hash and license terms.
5. **Gate, select, cap** (`property-campaign.ts` `gateVerdict`): suppression on every party, contact point and mailing
   address first; `mail` requires an owner mailing address; then the pack's `propertyGate`
   (`packs/residential-re.ts`). Anything but exactly `{status: "clean"}` blocks; a throwing gate blocks with
   `gate-error`. At most `DEFAULT_MAX_PROPERTIES = 25` are scored (`property-campaign.ts:79`). One letter per owner per
   run.
6. **Enrich the selected parcels** in chunks of `PROPERTY_ENRICH_CHUNK = 25` (`pipeline.ts:680`) — e.g. FEMA flood
   zone.
7. **Score** (`property-seam.ts` `scoreProperty`): signals computed in code, FCRA-sensitive attributes stripped,
   fair-housing-tainted attribute values dropped from the view, data fenced as escaped JSON, reasons grounded
   (ungrounded reasons dropped and recorded in `run.droppedAngles`).
8. **Underwrite** (pack `underwriting` via `packages/deal-math`): computed facts with provenance.
9. **Draft** (`draftPropertyMessage`): the model may decline; `guardDraft` with the identifier allowlist limited to the
   situs and mailing addresses on record, quantity facts from the record, and pack draft rules (fair housing, distress
   language). A failure goes to `run.rejectedDrafts`.
10. **Finalize** (`pipeline.ts` `finalizeDraft`): validate, append the footer in code from the profile `sender`
    (license disclosure required on every residential channel), validate again. Missing sender → no footer,
    `needsSenderIdentity: true`, and a run warning.
11. **Record**: `assertCampaignRun` mints `Validated<CampaignRun>`; `JsonlRunStore.saveRun` re-validates and appends.
12. **Afterwards (human)**: `intent-outreach approvals pending` → `approve <runId> <contactKey> --digest <sha>` → a
    dispatcher calls `check-send` (exit code 3 when not sendable) → sends. The dispatcher does not exist yet.

### Dependency Graph

```text
models.ts ◄─ validator.ts ◄─ store.ts            (store never imports providers: invariant 3)
   ▲             ▲
   │             └──────────── pipeline.ts ◄── property-campaign.ts ◄── monitors.ts
   │                              ▲    ▲              ▲
compliance/* (pure) ──────────────┘    │              │
packs/* ──────────────────────────────►┘              │
connectors/* ◄─ http.ts, rate-limit.ts, routing.ts ───┘
seam.ts / property-seam.ts ◄─ providers.ts ◄─ evals/supported.ts
inbound.ts ◄─ compliance, packs, seam, pipeline (finalizeDraft), providers
approvals.ts ◄─ compliance/send.ts (approval verdict)
cli.ts, mcp/tools.ts ◄─ everything above
packages/deal-math ◄─ packs/residential-re.ts (underwriting), mcp `underwrite`
```

Build order: `npm ci` (installs the workspace package) → `npm run typecheck` → `npm test` → `npm run bundle`.
When a dependency is unavailable: no model key → research/enrich still run and record; drafting fails at provider
resolution. No connector keys → keyed connectors self-skip (`skippedConnectors`); property runs still use the keyless
public-records connectors unless `INTENT_OUTREACH_PUBLIC_RECORDS=0`.

---

## 4. Design Decisions & Tradeoffs

### Decision Log

#### One engine, many packs (not one repo per vertical)
- **Chosen**: a single engine with packs as data + rules (`pipeline_core/packs/`), two loops total.
- **Over**: separate engines in each client repo (coastal had its own Python orchestrator and compliance).
- **Because**: compliance, grounding and evals are the hard parts; duplicating them per vertical guarantees drift.
  `000-docs/031-AT-DECR`.
- **Cost**: the engine's schema must model both companies and properties; packs cannot add orchestration.
- **Revisit when**: a vertical needs a genuinely different loop (the social-intent pack in `033`/`034` was designed to
  fit as a pack; if it can't, that's the trigger).

#### The engine never sends
- **Chosen**: drafts + an exported send-time check; sending is the client's dispatcher.
- **Over**: an integrated sender (SMTP/Twilio).
- **Because**: TCPA/CAN-SPAM/fair-housing liability sits with the licensed sender; keeping sending out removes a whole
  class of irreversible failure from this repo and forces a human approval step.
- **Cost**: compliance is only as good as the dispatcher's discipline (Section 8.1).
- **Revisit when**: never for SMS/calls without counsel; maybe for mail via a print-and-mail API with the approval
  digest bound into the request.

#### Validated storage via a type brand plus runtime re-validation (invariant 1)
- **Chosen**: `Validated<T>` minted only in `validator.ts`; `saveRun` re-validates; records deep-frozen; CI rejects
  `as Validated` casts.
- **Over**: trusting the type system alone, or validating only at the edge.
- **Because**: model output is untrusted; a single unchecked path (MCP `save_run` is agent-written) would poison the
  store.
- **Cost**: every new field must go through zod and the union schema.
- **Revisit when**: never; it is the product's core promise.

#### Additive schema versions with a union (invariant 6)
- **Chosen**: `schemaVersion` is a `z.union` of `SUPPORTED_SCHEMA_VERSIONS`; new fields optional/defaulted; golden
  legacy fixture `tests/fixtures/runs.legacy.jsonl`.
- **Over**: migrations or a literal version.
- **Because**: `store.ts` re-validates every line on read; a literal would silently drop all older runs.
- **Cost**: older binaries cannot read newer runs; fixes go forward, not via revert.
- **Revisit when**: the store moves to SQLite (Phase 6 "encrypted store" item), where real migrations become possible.

#### Deterministic connector order; routing is configuration (invariant 5)
- **Chosen**: registration order in `connectors/index.ts` (free → public records → paid → legacy → enterprise);
  pack `dataSources` choose first-hit / ordered-fallback / all.
- **Over**: letting the model choose tools ("agentic research").
- **Because**: cost control, reproducibility, and resistance to prompt injection steering paid calls.
- **Cost**: less adaptive research; new sources need code.
- **Revisit when**: never for paid calls. Vendor MCP servers are wrapped (`connectors/mcp.ts`) precisely so the model
  never sees their toolbox.

#### Local JSONL store, not SQLite or a hosted DB
- **Chosen**: append-only JSONL files, 0600, lock + fsync.
- **Over**: SQLite (planned), Postgres, Firestore (the retired PipelinePilot used Firestore).
- **Because**: zero install, human-readable, append-only is an audit trail.
- **Cost**: listing runs reads the whole file; no encryption at rest; residential runs hold owner phones/addresses.
- **Revisit when**: residential volume grows or PII retention is required — the plan calls for encrypted SQLite with a
  retention period (Phase 6, not built).

#### Approval bound to the exact text
- **Chosen**: `approvals.jsonl` binds `{runId, contactKey, sha256(channel, subject, body, cta)}`; `checkSendable`
  requires `approved` on every channel, and a pack cannot turn it off.
- **Over**: a boolean "approved" flag on the run.
- **Because**: an edited draft must need a new approval.
- **Cost**: dispatchers must pass the exact message they will send.

#### Conservative phone window (8am–8pm, Mon–Sat, Texas from 9am; unknown location → every US zone)
- **Chosen**: `PHONE_WINDOW` in `compliance/timezones.ts:70`, stricter than federal TCPA (8–21, `TCPA_WINDOW`).
- **Because**: state rules (FL, TX, OK and others) are stricter than federal; one conservative window avoids
  per-state tables that would rot.
- **Cost**: loses legitimate 8–9pm and Sunday windows.

#### Pin vendor MCP tool definitions; disable the SDK's own output-schema validation
- **Chosen**: `mcpToolsDigest` over name, description, input and output schema and execution mode; the client gets a
  no-op `jsonSchemaValidator`; our zod schema checks the response; 5,000,000-character cap.
- **Over**: trusting the server; letting the SDK validate.
- **Because**: the security review of #101 proved a `^(a+)+$` output-schema pattern froze the event loop for 153 s.
- **Cost**: any vendor tool change needs a reviewed re-pin.

#### Two models per run (cheap scorer, stronger drafter)
- **Chosen**: optional `scoreProvider`; `seamModels` recorded only when name or model differ (#99).
- **Because**: scoring is high-volume and low-stakes; drafting is the reputation risk.

#### Eval gate: every fixture must pass every repeat
- **Chosen**: `evals/promote.ts` requires all fixtures × 3 repeats; approval keyed by `{provider, model, pack}`.
- **Over**: averaged scores.
- **Because**: a 98% model still sends a bad letter 2% of the time.
- **Cost**: MiniMax-M3 is not approved for `residential-re` (Section 11).
- **Revisit when**: never lower the bar; fix scorers only for proven false positives, and keep failed records as
  evidence (`evals/results/`).

### What Was Deliberately Not Built

- **Sending of any kind** (see above).
- **AI cold calling, Street View image analysis, sending MLS data to hosted models, Zillow scraping** — owner boundary
  in the plan (`~/.claude/plans/linear-stargazing-adleman.md`, "Boundary decisions").
- **Any Google/Vertex/Firebase dependency** — invariant 2; the Google model adapter was removed 2026-10-04.
- **A live DNC lookup inside the compliance module** — compliance stays pure and clock-injected; a DNC lookup must be a
  BYOK enrich connector.
- **pnpm workspace / moving the engine into `packages/engine`** — the plugin is root-anchored
  (`.claude-plugin/plugin.json` uses `${CLAUDE_PLUGIN_ROOT}/bundle/server.mjs`); npm workspaces were enough for
  `packages/deal-math`. Bead `io-30i` stays deferred.
- **Batch scoring** — the AI SDK has no batch API and run sizes don't justify it; bead `io-2yt.10` (deferred,
  threshold-triggered).
- **Credit/financial variables in scoring** — FCRA; `compliance/risk.ts` strips them by token.

### Assumptions the Architecture Rests On

- Runs are small: ≤ 25 scored properties by default, ≤ 500 hard cap per property run; B2B runs are tens of domains.
  The JSONL store is read whole by `listRuns`; at roughly tens of MB it will feel slow.
- One user per machine; file locks assume a single host, not a network filesystem.
- The client dispatcher calls `check-send` with the exact text it sends.
- Vendor data is untrusted text (prompt injection is assumed, and fenced).
- Free public records are enough to prove the residential pipeline before paying for DealMachine.

---

## 5. Directory Structure

### Layout

```text
intent-outreach/
├── pipeline_core/            # the framework-free engine (no cloud imports; CI-guarded)
│   ├── models.ts             # every zod schema; SCHEMA_VERSION = 6; SUPPORTED_SCHEMA_VERSIONS
│   ├── validator.ts          # the only place Validated<T> is minted
│   ├── store.ts              # JSONL run store (lock, fsync, torn-tail repair, 0600)
│   ├── pipeline.ts           # runResearch/runEnrich/runCampaign, property research+enrich, shared helpers
│   ├── property-campaign.ts  # runPropertyCampaign (the property loop)
│   ├── property-seam.ts      # property signals/views, scoreProperty, draftPropertyMessage
│   ├── seam.ts               # B2B scoreLead/draftMessage, fence(), DraftOutputSchema
│   ├── inbound.ts            # runInbound (first reply to a web inquiry)  [new 2026-10-06]
│   ├── draft-guard.ts        # guardDraft, checkQuantities, groundAngles, voice rules
│   ├── footer.ts             # CAN-SPAM / license footer applied in code
│   ├── approvals.ts          # approvals ledger + digest
│   ├── monitors.ts           # event monitors (snapshot fingerprints, diff, commit/abandon)
│   ├── routing.ts            # capability routing, CreditBudget, caches, stableStringify
│   ├── rate-limit.ts         # token buckets used by httpJson
│   ├── key-quotas.ts         # multi-key rotation + monthly quotas  [new 2026-10-06]
│   ├── http.ts               # httpJson (https-only, retry, 5 MB cap, redaction)
│   ├── secrets.ts            # env / local file secrets; secretVariants
│   ├── providers.ts          # LLM adapters; SUPPORTED_PROVIDERS derived from evals/supported.ts
│   ├── compliance/           # suppression, send-time check, consent, timezones, fair housing, risk (pure)
│   ├── connectors/           # registry + 11 adapters + mcp.ts wrapper + shared helpers
│   ├── packs/                # b2b-sdr, residential-re, service areas, registry, types
│   └── render/               # escaped CSV/.eml/HTML/Slack renderers
├── mcp/                      # server.ts (thin stdio entry) + tools.ts (all handlers)
├── cli.ts                    # the intent-outreach CLI
├── bundle/                   # COMMITTED esbuild output: server.mjs, cli.mjs (what ships)
├── packages/deal-math/       # pure deal math workspace package
├── prompts/                  # versioned prompt files (promptRef = file@sha8)
├── evals/                    # harness, fixtures (draft, score, residential), results, supported.ts, promote.ts
├── tests/                    # vitest suites (+ fixtures, e2e)
├── skills/intent-outreach/   # the plugin's orchestrator skill
├── .claude-plugin/           # plugin.json + marketplace.json
├── .github/workflows/        # ci, codeql, dependabot-bundle, mutation
├── .audit-harness/, scripts/audit-harness, .harness-hash   # testing SOP harness + pins
├── 000-docs/                 # filed docs; this file is 036
└── .beads/                   # bead tracker (Dolt-backed; JSONL mirror tracked)
```

### Load-Bearing Files

| Path | Role | Why it is load-bearing |
|------|------|------------------------|
| `pipeline_core/models.ts` | Every schema | A wrong change silently drops stored runs on read (invariant 6). |
| `pipeline_core/validator.ts` | Mints `Validated<T>` | The only door into storage. |
| `pipeline_core/store.ts` | Run store | Data integrity, permissions, duplicate protection. |
| `pipeline_core/compliance/send.ts` | `checkSendable` | The contract every dispatcher depends on. |
| `pipeline_core/draft-guard.ts` | Draft guard | The last code check before a draft can be approved. |
| `pipeline_core/pipeline.ts` | Both research paths + shared finalize | Most behaviour flows through it (1,398 lines). |
| `pipeline_core/connectors/index.ts` | Registration order | Order is call order (invariant 5). |
| `evals/supported.ts` | Approved models | Drives `SUPPORTED_PROVIDERS` and the unapproved-model warning. |
| `bundle/*.mjs` | What actually ships | A stale bundle means users run old code; CI checks freshness. |
| `.harness-hash` | Pins CI/test config | Edits to pinned files fail `harness verify` until re-pinned. |

---

## 6. Getting Started

### Prerequisites

| Tool | Version | Install | Verify |
|------|---------|---------|--------|
| Node.js | ≥ 20 (box has v22.21.0) | nvm / distro | `node -v` |
| npm | bundled with Node | — | `npm -v` |
| git, gh | any recent | — | `gh auth status` |
| bd (beads) | 1.1.x | see `~/000-projects/BEADS-SETUP-PROMPT.md` | `bd version` |
| sops + age | for keyed evals only | `~/bin/` on this box | `sops --version` |

### Zero to Running

1. `git clone https://github.com/jeremylongshore/intent-outreach && cd intent-outreach`
2. `npm ci` — installs deps and links `packages/deal-math` as `@intent-outreach/deal-math`.
3. `npm run typecheck && npm test` — expect `Tests  1347 passed` (count as of `7717bb15`).
4. `npx tsx evals/run.ts --offline` — expect `VERDICT: WIRING OK (offline; says nothing about model quality)`.
5. `node bundle/cli.mjs help` — the CLI; `node bundle/cli.mjs connectors` lists connectors and which are configured.
6. Plugin use: install the repo as a Claude Code plugin (marketplace source `.`); the MCP server starts from
   `bundle/server.mjs`.
7. A first property run (needs a model key, e.g. `ANTHROPIC_API_KEY`, and a profile with a `sender`):
   `node bundle/cli.mjs property-run --icp "Listing agent, west Pensacola" --zips 32507 --max-properties 5 --profile <p>`.
   Florida ZIPs in Escambia (FIPS 12033) and Okaloosa (12091) are covered by the keyless connectors.

Beads, once per clone: `bd hooks install && bd hooks list` (5 installed) → `bd config get dolt.auto-commit` (= on) →
`bd doctor`.

### Common Setup Problems

| Symptom | Cause | Fix |
|---------|-------|-----|
| Biome: "nested root configuration" error | An agent worktree exists under `.claude/worktrees/` with its own `biome.json` | Lint from a clean `git worktree add` copy, or remove stale agent worktrees |
| `harness-hash: MISMATCH` | You edited a pinned file (`package.json`, workflows, `vitest.config.ts`, `stryker.conf.json`) | Review, then `scripts/audit-harness init` and commit `.harness-hash` |
| CI `dependabot-bundle` / bundle freshness fails | Changed `pipeline_core/`, `mcp/` or `cli.ts` without rebuilding | `npm run bundle` and commit `bundle/` |
| Coverage gate fails in CI but tests pass locally | You ran `npx vitest run` without `--coverage`; CLI code tested only via spawned processes doesn't count | `npx vitest run --coverage --exclude "tests/*.e2e.test.ts"`; add in-process tests (see `tests/cli-inprocess.test.ts`) |
| `git pull` refuses | `.beads/interactions.jsonl` is always dirty | `git fetch && git merge --ff-only origin/main` |
| A property run returns no properties | ZIP not in Escambia/Okaloosa, or `INTENT_OUTREACH_PUBLIC_RECORDS=0` | Use a covered ZIP; AL counties have no connector yet |
| Warning "model not approved" | `{provider, model, pack}` not verified in `evals/supported.ts` | Run the eval gate, or `INTENT_OUTREACH_ALLOW_UNGATED=1` for local testing only |

---

## 7. Operations

### Command Map

| Task | Command | Notes |
|------|---------|-------|
| Install | `npm ci` | |
| Typecheck (also invariant gate) | `npm run typecheck` | |
| Tests | `npm test` | vitest |
| Coverage gate (as CI) | `npx vitest run --coverage --exclude "tests/*.e2e.test.ts"` | floors: statements 88, branches 79, functions 89, lines 90 (`vitest.config.ts`) |
| E2E | `npm run test:e2e` | spawns `bundle/server.mjs` and `bundle/cli.mjs` |
| Architecture tests | `npm run test:architecture` | |
| Lint | `npm run lint` (`biome lint .`) | use `--diagnostic-level=error` to see only blocking errors |
| Offline eval wiring | `npx tsx evals/run.ts --offline` | free, runs in CI |
| Keyed eval (b2b) | `npm run evals` | costs money |
| Keyed eval (residential) | `npx tsx evals/run.ts --providers minimax --model MiniMax-M3 --pack residential-re --judge` | |
| Promote a model | `npm run evals:promote -- --provider <p> --model <id> [--pack residential-re]` | writes `evals/results/*` + `supported.ts` on pass |
| Mutation | `npm run mutation` | Stryker; scheduled in CI |
| Build (CI check only) | `npm run build` | nothing ships from `dist/` |
| Bundle (what ships) | `npm run bundle` | commit `bundle/` |
| Harness | `scripts/audit-harness verify` / `init` | |
| B2B campaign | `node bundle/cli.mjs run --icp ... --domains a.com,b.com [--profile p]` | |
| Property campaign | `node bundle/cli.mjs property-run --icp ... --zips 32507 [--parcels 12033:APN] [--budget-credits N]` | |
| Inbound reply | `node bundle/cli.mjs inbound --offer "..." [--channel email|sms] < inquiry.json` | stdin `{inquiry, consents?}` |
| Approvals | `node bundle/cli.mjs approvals pending|approve|reject` | approve needs `--digest` |
| Send-time check | `node bundle/cli.mjs check-send < message.json` | exit 3 when not sendable |
| Suppressions | `node bundle/cli.mjs suppress add|list|remove <value> [--kind email|domain|phone|address]` | |
| Monitors | `node bundle/cli.mjs monitor add|list|check [--draft]` | |
| Key quotas | `node bundle/cli.mjs keys <ENV_NAME>` | |
| Deploy | n/a — release = tag + GitHub release; users update the plugin | |
| Rollback | revert the PR on `main` (forward-fix for schema changes) | |

### Deployment

This repo is not deployed. "Release" means:
1. Pre-flight: CI green on `main`; `npm run bundle` committed; CHANGELOG `[Unreleased]` reviewed; versions aligned in
   `package.json` and `.claude-plugin/plugin.json` (both `0.3.0` today).
2. Execute: bump versions, move `[Unreleased]` to a dated section, tag `vX.Y.Z`, push the tag, create the GitHub
   release.
3. Verify: fresh clone → install as plugin → `list_connectors` via MCP; `node bundle/cli.mjs help`.
4. Rollback: users can pin the previous tag; **but runs written by v6 cannot be read by v0.3.0** — never advise a
   rollback to a pre-v6 binary on a machine that has v6 runs.

**The next release should be `v0.4.0`** (schema v6 is a minor-version feature set). It has not been cut; that is an
owner call.

### Monitoring & Alerting

- Dashboards: none for this repo (local tool).
- SLIs/SLOs: not defined. The one product metric is `run.inbound.speedToLeadMs` (target: approved reply < 60 s, plan
  Phase 7).
- Adjacent: the VPS `forms-api` → Buzz `mandy-leads` alert path is governed by intent-os (`ops/`), Buzz-only.
- On-call: not established.

### Incident Response

| Severity | Definition | Response Time | Playbook |
|----------|------------|---------------|----------|
| P0 | A draft was **sent** to a suppressed / non-consenting / out-of-window recipient, or a secret leaked into a run/log | Immediate | Stop the dispatcher; add the contact to suppressions (`suppress add`); preserve `runs.jsonl` + `approvals.jsonl` (they are the audit trail); for a secret: rotate per intent-os policy |
| P1 | Store unreadable / runs dropped on read | 15 min | Check `corruptLines()`; never hand-edit lines; restore from backup; check for a schema literal regression (invariant 6) |
| P2 | Connector or model failures degrading runs | 1 hour | Read `run.failedConnectors` statuses (`timeout`, HTTP code, `pin-mismatch`); check keys/quotas (`keys <ENV>`) |

---

## 8. Things That Will Bite You

### 8.1 The dispatcher is the compliance boundary, and it doesn't exist yet
- **Symptom**: drafts look compliant in the run store, but a person gets a text at 9:30pm or after opting out.
- **Cause**: everything time- and consent-dependent is checked at **send time** by `checkSendable`; a sender that skips
  it skips all of it.
- **Fix**: any dispatcher (coastal) must call `check-send` / `assertSendable` with the exact message, recipient
  contact point, consents, approval verdict and current time, and send only on `sendable: true`.
- **Prevention**: a contract test in coastal that fails if a send path doesn't call it.

### 8.2 Schema v6 is one-way
- **Symptom**: an older `intent-outreach` reports zero runs or validation errors on read.
- **Cause**: v6 lines are not in a v0.3.0 binary's version union.
- **Fix**: upgrade; never downgrade on a machine that wrote v6.
- **Prevention**: keep new fields optional/defaulted, extend the union, keep the legacy fixture parsing.

### 8.3 Forgetting `npm run bundle`
- **Symptom**: the plugin behaves like old code; CI bundle check fails.
- **Fix/Prevention**: any change under `pipeline_core/`, `mcp/`, `cli.ts` → `npm run bundle` → commit `bundle/`.

### 8.4 Coverage drops when you test the CLI only through spawned processes
- **Symptom**: CI build-test fails on coverage thresholds although all tests pass (PR #98 hit this: lines 88.8 vs 90).
- **Fix**: drive `main(argv)` in-process (`tests/cli-inprocess.test.ts`, `tests/inbound.test.ts` "CLI: inbound").
- **Prevention**: never lower a threshold; add tests.

### 8.5 Squash merges and stacked branches
- **Symptom**: a branch stacked on another PR conflicts after the parent squash-merges (CHANGELOG, CLAUDE.md, bundle).
- **Fix**: merge `origin/main` into the branch, resolve CHANGELOG by keeping both sides, rebuild `bundle/`.
- **Prevention**: branch from fresh `main`; merge in order.

### 8.6 A pinned file edit fails `harness verify`
- **Cause**: `.harness-hash` pins `package.json`, all 4 workflows, `stryker.conf.json`, `vitest.config.ts`.
- **Fix**: review, `scripts/audit-harness init`, commit `.harness-hash`. Dependabot bumps to `package.json` need this.

### 8.7 The draft guard and eval scorers are strict by design; prove a false positive before loosening
- Examples fixed with evidence: house numbers as quantities (#103), "Fels Avenue" vs "Fels Ave" (#100), "Alabama" vs
  "AL" (#105). Examples that are **real model failures** and must not be "fixed" in scorers: a 60 s draft timeout and
  a run-on LLC greeting (#105). Keep failed result records in `evals/results/`.

### 8.8 The listing check passes when listing data is missing
- **Cause**: free public records carry no MLS status (`packs/residential-re.ts` header, "KNOWN LIMIT").
- **Consequence**: a letter could go to an owner under an active listing agreement unless the agent checks.
- **Fix**: a listing-status connector (MLS feed or paid source) supplying `listingStatus`; until then a human checks.

### 8.9 Shared working tree with other sessions/agents
- **Symptom**: your uncommitted work vanishes or the branch changes under you (happened during #101's review).
- **Prevention**: commit early; do multi-step work in a `git worktree`; read `~/000-projects/CROSS-SESSION-LOG.md`.

### 8.10 Agent worktrees break lint
- **Cause**: Biome sees nested `biome.json` under `.claude/worktrees/agent-*`.
- **Fix**: lint from a fresh worktree; remove stale agent worktrees (`git worktree remove`).

### 8.11 An inbound SMS reply can never pass `check-send` today
- **Symptom**: a person texts in through the form with written SMS consent; `runInbound` drafts the reply; `check-send`
  returns `dnc:unknown`.
- **Cause**: the SMS channel policy sets `requireDncClean: true` (`compliance/send.ts:63`, enforced at `send.ts:161`)
  and `runInbound` records the inquirer's phone with `dnc: "unknown"` (fail closed by design, `models.ts:303`).
- **Fix (needs a decision, not a quick patch)**: either a DNC lookup enrich connector that sets `dnc: "clean"`, or a
  documented rule that prior express written consent from the person's own inquiry satisfies the DNC requirement for
  a reply on that channel (TCPA established-business-relationship / consent analysis; counsel review item in Appendix D).
  Email replies are unaffected.

### 8.12 Phone normalization is US-only
- `normalizePhone` throws on non-US formats; `runInbound` now degrades gracefully (warning / `malformed-phone` block),
  but connectors and suppressions expect US E.164.

---

## 9. Security & Access

### Access Control

| Role | Purpose | Permissions | MFA |
|------|---------|-------------|-----|
| Repo owner (Jeremy) | Maintainer | admin on `jeremylongshore/intent-outreach`; branch protection on `main` (required checks) | GitHub account MFA |
| Agents (Claude/Codex) | Implementation | team-maintainer profile: branch, commit, push, PR; no force-push/history rewrite/branch deletion without approval | n/a |
| End user | Runs the tool | their own keys, their own machine | n/a |

### Secrets

- **Where**: env vars or `~/.intent-outreach/secrets.json` (0600 warning if broader) via `secrets.ts`; labelled
  variants `NAME__LABEL` supported. No cloud secret store. Keyed evals on this box: MiniMax key from
  `~/.config/intentsolutions/api-providers.sops.json` (`minimax.key`), decrypted into an env var only; other LLM keys in
  `~/000-projects/intent-eval-platform/intent-eval-lab/.env.sops`.
- **Redaction**: every key read via `useSecret`/`useKey` is registered; `httpJson` errors and `sanitizeErrorMessage`
  scrub keys, bearer tokens and key-shaped strings; run records store connector failures as status codes only.
- **Rotation**: owner-governed; do not propose rotating the tokens whose rotation was declined (see global CLAUDE.md).
- **Emergency access**: not applicable (no hosted service).

### Honest Security Assessment

Implemented and tested: prompt-injection fencing of all third-party text; identifier allowlists that never include
third-party free text (verified again 2026-10-06 for property and inbound paths); https-only outbound with
same-origin redirects; 5 MB body caps; vendor-MCP pinning, size cap and ReDoS defence; secret redaction; 0600 files /
0700 dirs; CodeQL + gitleaks in CI; mutation testing scheduled.

Aspirational / missing: **no encryption at rest** for runs that now hold owner names, mailing addresses and phones;
no retention policy; no audit log separate from the store itself; vendor license terms are enforced only where a
connector declares them (undeclared terms block property outreach, which is the safe default).

---

## 10. Cost & Performance

### Monthly Costs

| Resource | Cost | Notes |
|----------|------|-------|
| This repo's infrastructure | $0 | Local tool; GitHub free tier for CI |
| Model calls | per use, BYO key | Metered per run in `run.costUsd` (`cost.ts`, cache-aware) |
| Keyed evals | ~$0.06–0.08 per residential MiniMax-M3 run (repeat 3, judge) | 2026-10-06 runs: $0.0838 and $0.0598 |
| Data | Free tiers + keyless public records today | DealMachine seat $99/month is an owner decision |

### Performance

- Latency: not measured as SLOs. Draft calls are bounded at `SEAM_TIMEOUT_MS = 60_000` (`seam.ts:83`); MiniMax-M3 hit
  that timeout once in 87 residential runs.
- Connector deadline 90 s per invocation (default).
- Throughput: sequential per lead/property; property enrichment in chunks of 25.
- Error budget: not defined.

### Scaling Limits

- Property runs: default 25 scored, hard cap 500 (`cli.ts` flag validation).
- JSONL store: `listRuns` reads and validates every line; expect slowness at tens of MB.
- Vendor rate limits are enforced per connector by token buckets, in-process only (two concurrent processes don't
  share buckets; the quota ledger, by contrast, is file-locked across processes).

---

## 11. Current State

### What's Working (evidence)

- Full suite: 1,347 tests pass on `7717bb15`; coverage statements 91.6 / branches 82.4 / functions 90.3 / lines 93.9.
- CI on every merged PR #98–#105: build-test, e2e, invariants, security, CodeQL green.
- Track 0 (adjacent, intent-os): `POST /api/forms/mandy-lead` live on the VPS → Buzz private channel `mandy-leads`;
  verified end to end 2026-10-06 (preflight 204, bad origin 403, real TEST lead 200 delivered, honeypot 200, stale
  consent 400; ledger 0600; no PII in the journal). intent-os PR #743.
- coastal-realty-ops PR #73 merged (doc drift, google-cloud pins dropped, `dnc_status` default "blocked", 8am start).

### The real estate program (#83 / `io-2yt` / Plane OUTR-3) — PR ledger

| Phase | What | PRs |
|-------|------|-----|
| 1 Foundations | phone + mailing-address suppression, geofence as pack data, 8am TCPA start | #85 |
| Docs | 031 decision record, 032 research synthesis; 033/034 social-intent; 035 data sources | #87, #86, #94 |
| 2 Structure | schema v6 property/owner model, typed research queries | #88 |
| 5 Deal math | `packages/deal-math`, golden parity with `trade_up.py` | #89 |
| 3 Compliance | send-time check, consent ledger, recipient-local windows, per-channel footers; draft rules, fair housing, manual review, listing, FCRA | #90, #91 |
| 4 Provider layer | capability routing, credit budget, cache, rate limits (#92); MCP adapter (#101); multi-key quotas (#102) | #92, #101, #102 |
| 6 Residential | property campaigns + `residential-re` (#93); FL DOR + FEMA keyless connectors, license gate, `property-run` (#96); eval suite (#100) | #93, #96, #100 |
| 8 Evolution | approvals (#95); MCP list_runs/suppress/underwrite (#97); monitors (#98); per-seam models (#99) | #95, #97, #98, #99 |
| 7 Inbound (engine half) | `runInbound` + CLI `inbound` | #104 |
| Fixes | house-number guard (#103); state-name scorer + eval evidence (#105) | #103, #105 |

### What Needs Attention

- **HIGH — No dispatcher calls `check-send` yet** → Impact: any send path built ad hoc bypasses compliance → Fix: build
  the coastal dispatcher with a contract test (REALTY).
- **HIGH — No model approved for `residential-re`** → Impact: residential drafting is ungated → Fix: owner chooses a
  keyed Claude eval run (`npm run evals:promote -- --provider anthropic --model claude-sonnet-5-5 --pack residential-re`;
  note `DEFAULT_MODEL.anthropic` is still `claude-sonnet-4-6`, `providers.ts:47`) or MiniMax with
  `INTENT_OUTREACH_ALLOW_UNGATED=1` for drafts only. MiniMax-M3 evidence: `evals/results/2026-10-06-*residential*`.
- **MEDIUM — Runs hold PII unencrypted** → Fix: encrypted SQLite store with retention (Phase 6 item, not started).
- **MEDIUM — Listing check passes on missing data** → Fix: listing-status connector.
- **MEDIUM — Schema v6 unreleased** → Fix: cut `v0.4.0` with release notes calling out one-way compatibility.
- **MEDIUM — Inbound SMS replies are always blocked at send time (`dnc:unknown`)** → see 8.11 → Fix: DNC lookup
  connector or a counsel-reviewed consent rule.
- **MEDIUM — Inbound not wired** → `forms-api` doesn't call `runInbound`; needs a model key on the VPS (owner decision).
- **LOW — Stale `CLAUDE.md` doc pointer** ("Current docs are 017–022") → fixed in the PR that adds this document.
- **LOW — Open Dependabot PRs #60, #65, #81, #82 and old #41** → triage in the repo sweep (Section 14).

### Implementation Status

| Component | Status | Evidence |
|-----------|--------|----------|
| B2B campaign loop | Implemented, released v0.3.0 | `pipeline.ts`, `tests/pipeline.test.ts` |
| Property loop | Implemented, unreleased | `property-campaign.ts`, `tests/property-campaign.test.ts` |
| Inbound reply | Implemented (engine), not wired | `inbound.ts`, `tests/inbound.test.ts` |
| Send-time check | Implemented, no caller in prod | `compliance/send.ts`, CLI `check-send` |
| Approvals | Implemented | `approvals.ts`, `tests/approvals.test.ts` |
| Monitors | Implemented | `monitors.ts`, `tests/monitors.test.ts` |
| FL DOR parcels, FEMA flood | Implemented (keyless) | `connectors/fl-dor-parcels.ts`, `fema-nfhl.ts`; `000-docs/035` |
| Baldwin/Mobile AL, Okaloosa terms | **Not built** — awaiting owner's data-terms confirmation | `000-docs/035` |
| OpenCorporates (LLC → person) | **Not built** | plan Phase 6 |
| DealMachine | **Not built** — $99/month owner decision; plan `000-docs/020` | |
| Vendor MCP wrapper | Implemented, no vendor spec yet | `connectors/mcp.ts`, `tests/mcp-connector.test.ts` |
| Multi-key quotas | Implemented; no connector migrated to `useKey` yet | `key-quotas.ts` |
| Deal math | Implemented | `packages/deal-math`, golden tests |
| Encrypted store / retention | **Not built** | — |
| Residential model approval | **Failed gate** (MiniMax-M3) | `evals/results/2026-10-06-minimax-MiniMax-M3-residential-*.json` |
| ERPNext sink (coastal) | **Not built** | REALTY |
| Retire coastal duplicate Python | **Not done** | plan Phase 7 |
| Social-intent pack | **Designed only** (033/034), awaiting owner approval | bead `io-7vr.7`, GH #84 |
| Batch scoring | Deferred | bead `io-2yt.10` |

---

## 12. Roadmap

### Week 1 — Stabilization
- Triage/merge the Dependabot PRs (bundle rebuild + harness re-pin as needed); close or refresh #41.
- Owner decision on the residential model; run the chosen keyed eval; promote only on a full pass.
- Prompt tweak for entity greetings ("greet the entity on its own line") and a per-provider draft deadline, each with
  an eval re-run as evidence.
- Cut `v0.4.0` (schema v6) with explicit one-way-compatibility notes.

### Month 1 — Foundation
- Coastal: dispatcher calling `check-send` (contract test), ERPNext sink (upsert keyed by `FIPS:APN` or E.164; pull
  suppressions and a "do not research" list back), retire `src/orchestrator/compliance.py` and duplicate models,
  generate dashboard types from the engine's zod schemas.
- forms-api → `runInbound` → Buzz `mandy-leads` with the drafted reply and speed-to-lead (needs the model-key decision).
- Migrate paid connectors from `useSecret` to `useKey` with per-call credits.
- Live drafts-only run on 5 parcels under a logged budget (plan "Verification"), once an AL source or FL target is
  chosen.

### Quarter 1 — Strategic
- Encrypted SQLite run store with retention and an append-only audit table.
- Listing-status source (closes the 8.8 gap).
- DealMachine via `createMcpConnector` or REST (after the seat decision).
- Next packs: `commercial-re`, `land`, `mhp`; social-intent pilot if approved (`033`/`034`).

---

## 13. Quick Reference

### URLs

| Resource | URL |
|----------|-----|
| Repo | https://github.com/jeremylongshore/intent-outreach |
| Program issue | https://github.com/jeremylongshore/intent-outreach/issues/83 |
| Social-intent research | https://github.com/jeremylongshore/intent-outreach/issues/84 |
| Dogfood campaign epic | https://github.com/jeremylongshore/intent-outreach/issues/75 |
| Plane | `projects.intentsolutions.io`, workspace `internal`: OUTR-3 (engine), REALTY-7 (coastal) |
| Plan | `~/.claude/plans/linear-stargazing-adleman.md` |
| Adjacent repos | `~/000-projects/coastal-realty-ops`, `~/000-projects/comehomealabama`, `~/000-projects/intent-os` |

### First-Week Checklist
- [ ] `gh auth status` works; push access to the repo
- [ ] `npm ci && npm test` green locally
- [ ] Beads activated (`bd hooks install`, `bd doctor`)
- [ ] Read this document, `CLAUDE.md`, `000-docs/031`, `035`
- [ ] Read `~/000-projects/CROSS-SESSION-LOG.md` before touching shared repos
- [ ] Ran `node bundle/cli.mjs help` and an offline eval
- [ ] Know the owner decisions in Appendix D before starting any blocked item

---

## 14. Resume Procedure (for Codex or any agent)

1. `cd ~/000-projects/intent-outreach && git fetch && git checkout main && git merge --ff-only origin/main`
   (`git pull` fails because `.beads/interactions.jsonl` is always modified; that is expected).
2. `bd prime` then `bd ready`, `bd list --status in_progress`, `bd children io-2yt`. Plain-English bead titles; never
   quote bead IDs in commits or PRs. Close with `bd-sync close <id> -r "<evidence>"`, one per command, then
   `bd export -o .beads/issues.jsonl`.
3. Pick work from Section 12 that is **not** owner-blocked (Appendix D). Today that is: Dependabot triage; the entity
   greeting prompt tweak + per-provider draft deadline (evals as evidence); migrating paid connectors to `useKey`;
   cutting `v0.4.0` if the owner agrees.
4. Branch from `origin/main`; commit early; for multi-step work use a worktree.
5. Before every push: `npm run typecheck && npx vitest run --coverage --exclude "tests/*.e2e.test.ts" &&
   npx tsx evals/run.ts --offline && npm run bundle && scripts/audit-harness verify`, plus Biome at
   `--diagnostic-level=error` from a clean worktree.
6. PR body per the estate standard (What · Why + decision · Layers · Verification with evidence · Risk · Ops impact ·
   Rollback · Follow-up · Refs #83). Get an independent review (security-auditor or code-reviewer agent) for anything
   touching compliance, connectors, storage or prompts; every PR #85–#104 had real defects found that way.
7. Wait for required checks; fix only specific findings; merge squash; `bd-sync note io-2yt "<what merged>"`.
8. Never: send messages, add Google/Vertex/Firebase, lower coverage thresholds, loosen a guard or scorer without a
   proven false positive, hand a vendor's MCP toolbox to the model, or put PII in commits/docs.

---

## Appendices

### A. Glossary
- **Pack**: a vertical's gates, prompts, draft rules, channel policy and data-source routing over the shared loops.
- **Seam**: one of the two LLM call sites (score, draft); `inbound.ts` has its own single draft call.
- **Fact**: a vendor value with `source`, `fetchedAt`, `responseHash`, `licenseTerms`, and `via` for MCP vendors.
- **Fail closed**: anything other than an explicit clean verdict blocks.
- **Footer**: the CAN-SPAM / license disclosure appended in code, never by the model.
- **Speed-to-lead**: milliseconds from a web form submission (`receivedAt`) to a drafted reply.
- **FIPS:APN**: county FIPS code + assessor parcel number, the property key.

### B. Reference Links
- `000-docs/017` (rebuild decision record), `018` (B2B connector landscape), `019` (unify-engine plan), `020`
  (DealMachine addendum), `021`/`022` (hardening plan and AAR), `031` (real estate decision record), `032` (research
  synthesis), `033`/`034` (social-intent), `035` (free residential data sources).
- `evals/README.md` (eval and promotion flow), `skills/intent-outreach/SKILL.md` (plugin behaviour).

### C. Troubleshooting Playbooks
- **"Run status is `researched` but nothing drafted"**: read `blockedContacts`, `rejectedDrafts`, `errors`,
  `failedConnectors`, `complianceWarnings` on the run (`node bundle/cli.mjs` + `--json`, or MCP `list_runs`).
- **"`check-send` says not sendable"**: the `reasons` array names each failure (`approval:missing`,
  `consent:missing`, `contact-point:wrong-kind:*`, `sender-identity:missing:*`, quiet hours, suppression).
- **"`pin-mismatch` on a vendor connector"**: the vendor changed a tool definition; review the change, recompute
  `mcpToolsDigest` and update the pin in a reviewed PR.
- **"`KeyQuotaExhaustedError`"**: `node bundle/cli.mjs keys <ENV>`; raise `quotas.json` or add a labelled key.

### D. Open Questions (owner decisions)
1. **Residential drafting model**: keyed Claude eval run vs. MiniMax ungated for drafts.
2. **Model key on the VPS** for forms-api → `runInbound` (money + secret placement).
3. **Brokerage name and license number** for footers and the consent text; comehomealabama #12 (site go-live) is held on
   this.
4. **County data terms**: Baldwin and Mobile (AL), Okaloosa (FL) — outreach use allowed or not.
5. **Mandy's Buzz identity** for `mandy-leads` membership.
6. **DealMachine seat** ($99/month).
7. **Counsel review** before any SMS automation (A2P 10DLC + consent ledger are prerequisites); AI calling is out of
   scope entirely.
8. **Social-intent pilot** (bead `io-7vr.7`, GH #84): approve the build epic or not.
9. **Dogfood campaign epic** (GH #75, bead `io-f9s`): all child beads are closed; confirm whether the real campaign run
   happened, then close or schedule it.
10. **Release `v0.4.0`** now or after the coastal dispatcher exists.

### E. Data Model Reference (schema v6, `pipeline_core/models.ts`)

`SUPPORTED_SCHEMA_VERSIONS = [1, 2, 3, 4, 5, 6]` (`models.ts:48`); writes emit 6. Schemas, with what each is for:

| Schema | Line | Purpose |
|--------|------|---------|
| `LeadSchema` | 87 | A company (B2B), keyed by normalized domain |
| `ContactSchema` | 102 | A person at a company (B2B); `contactKey` = email if known, else `name@domain` |
| `EnrichmentSchema` | 125 | Connector-specific enrichment records (allowlisted fields) |
| `LicenseTermsSchema` | 170 | Data license terms; `outreachRestricted` must be explicitly `false` for property outreach |
| `FactSchema` | 197 | `{value, source, fetchedAt, responseHash?, licenseTerms?, via?}` — every property attribute |
| `AddressSchema` | 211 | Structured US address |
| `PropertySchema` | 233 | Parcel keyed `FIPS:APN`, situs `address`, `location`, `attributes: Record<string, Fact>` |
| `PartySchema` | 252 | Person or entity (`entityType` llc / corporation / trust / estate / partnership / government / other), `mailingAddress`, `licenseTerms` |
| `OwnershipSchema` | 271 | Many-to-many property ↔ party, role, share, provenance |
| `EntityLinkSchema` | 289 | LLC → person, with source and confidence (no connector fills it yet) |
| `DncStatusSchema` | 303 | `clean | listed | unknown` (defaults `unknown`) |
| `ContactPointSchema` | 310 | phone (E.164) / email / mail; `lineType`; `dnc`; source; `verifiedAt` |
| `ResearchQuerySchema` | 341 | Discriminated union: `domain`, `area` (geography + filters), `parcel` (FIPS+APN or address) |
| `ChannelSchema` | 377 | `email, linkedin, sms, mail, call_script` |
| `MessageSchema` | 385 | One draft: `contactKey`, channel, subject?, body, cta, fitScore?, model, promptVersion, createdAt, `needsSenderIdentity`, `propertyKey?` |
| `RunStatusSchema` | 416 | `researched, enriched, complete, partial, failed` (+ legacy `pending`, `drafted` readable) |
| `RunErrorSchema` | 435 | Isolated failure; needs `domain`, `propertyKey` or `contactKey`; stage `score | gate | draft` |
| `FailedConnectorSchema` | 454 | `{name, phase, status}`; status is an HTTP code or a string (`timeout`, `error`, `pin-mismatch`) |
| `CampaignRunSchema` | 466 | The stored record (below) |

`CampaignRun` fields, oldest first: `id, schemaVersion, icp, domains, vertical, provider, model, status, leads, contacts,
enrichments, messages, costUsd?, skippedConnectors, blockedContacts[{contactKey, reason, propertyKey?}], errors,
rejectedDrafts[{contactKey, issues, propertyKey?}], failedConnectors, complianceWarnings, promptRefs{score?, draft?},
droppedAngles, origin? ("pipeline" | "agent"), queries?, seamModels?, inbound?{source, receivedAt, draftedAt,
speedToLeadMs}, credits?{limit, spent, exhausted, byConnector}, properties, parties, ownerships, entityLinks,
contactPoints, createdAt, finishedAt?`. Everything after `messages` is additive with a default or optional.

### F. Compliance Reason Codes

These strings are the audit vocabulary. They appear in `run.blockedContacts[].reason` (campaign time) and in
`check-send` `reasons` (send time). Grep them in `pipeline_core/compliance/` and `packs/residential-re.ts`.

| Family | Codes | Where |
|--------|-------|-------|
| Suppression | `suppressed:email`, `suppressed:domain`, `suppressed:phone`, `suppressed:address`, `suppression:malformed-{email,domain,phone,address}` | `compliance/suppression.ts` |
| Consent | `consent:missing`, `consent:revoked`, `consent:not-written`, `consent:unreadable-contact`, `consent:ledger-unreadable`, `consent:no-contact` | `compliance/consent.ts`, `send.ts:165-174` |
| Approval | `approval:missing`, `approval:rejected` | `send.ts:135` |
| Send mechanics | `clock:invalid`, `channel:mismatch`, `contact-point:missing`, `contact-point:wrong-kind:<kind>`, `contact-point:malformed-phone` (inbound) | `send.ts:134-141`, `inbound.ts` |
| Sender / disclosure | `sender-identity:missing`, `sender-identity:missing:<fields>`, `disclosure:footer-missing`, `disclosure:license-not-configured` | `send.ts:144-189` |
| Phone rules | `dnc:<status>`, `quiet-hours`, `quiet-hours:unknown-location` | `send.ts:161-179`, `compliance/timezones.ts` |
| Data license | `license:outreach-restricted`, `license:undeclared` | `send.ts:157`, `packs/residential-re.ts` |
| Property gate | `service-area:outside`, `service-area:unknown-address`, `owner:government`, `owner:unknown`, `mail:no-address`, `manual-review:<categories>`, `manual-review:unreadable-signals` | `packs/residential-re.ts`, `compliance/risk.ts`, `property-campaign.ts` |
| Listing | `listing:<status>`, `listing:agreement-still-in-effect`, `listing:withdrawn-under-agreement`, `listing:agreement-date-invalid`, `listing:status-unknown`, `listing:unreadable` | `compliance/risk.ts:111-129` |
| Engine fail-closed | `non-clean-verdict`, `gate-error: <msg>` | `pipeline.ts` gate evaluation |
| Draft rejection | `declined: <reason>`, `fair-housing: "<term>" in <field>`, `body: url not present in inputs (...)`, `claim: "..." adds a <rate|time period> ...` | `seam.ts:321`, `compliance/fair-housing.ts`, `draft-guard.ts` |

### G. Public API Cheat-Sheet (new or changed during the real estate program)

| Module | Export | Contract |
|--------|--------|----------|
| `compliance/send.ts` | `channelPolicy(channel, override?)` | Default per-channel policy, tightened (never loosened) by a pack override |
| | `checkSendable(input)` → `{sendable, reasons}` | Pure; the one function a dispatcher must call |
| | `assertSendable(input)` | Throws `NotSendableError` with the reasons |
| `approvals.ts` | `messageDigest(m)` | sha256 over channel, subject, body, CTA |
| | `approvalVerdict(records, runId, contactKey, message)` | `approved | rejected | missing` for the exact text |
| | `listPending(store)`, `decide(input)`, `recipientMatches(...)` | Queue, append-only decisions, recipient binding |
| `monitors.ts` | `fingerprint`, `diffSnapshots`, `mergeFingerprints`, `checkMonitor` | Two-phase: `commit()` / `abandon()`; a failed check keeps the old snapshot |
| `routing.ts` | `CAPABILITIES`, `capabilityForQuery`, `orderByRouting`, `CreditBudget`, `BudgetExceededError`, `MemoryResponseCache`, `FileResponseCache`, `cacheKey`, `stableStringify` | Fixed routing, budget charged before the call, cache keyed by connector + capability + subject |
| `key-quotas.ts` | `useKey(name, credits, now?)`, `keyStatus`, `drainQuotaWarnings`, `KeyQuotaExhaustedError`, `ALERT_RATIO = 0.8` | First variant with room; charge before call; ledger resets monthly |
| `connectors/mcp.ts` | `createMcpConnector(spec)`, `mcpToolsDigest(tools, allowed)`, `McpPinMismatchError`, `MCP_MAX_RESPONSE_CHARS` | One bound tool, code-built args, zod-checked capped response, `Fact.via` |
| `inbound.ts` | `runInbound(input)`, `InboundInquirySchema`, `DEFAULT_INBOUND_PROMPT` | Suppression → consent (+ revocation on any contact point) → draft → guard → footer → run |
| `property-campaign.ts` | `runPropertyCampaign`, `DEFAULT_MAX_PROPERTIES = 25`, `propertyGateContext`, `gateVerdict` | The property loop; gate exports are used by the eval harness |
| `secrets.ts` | `secretVariants(name)` | `NAME` then `NAME__LABEL` variants, labels sorted |
| `pipeline.ts` | `sanitizeErrorMessage` (now exported), `PROPERTY_ENRICH_CHUNK = 25` | |

Capabilities (`routing.ts:32`): `company.research, people.search, email.find, property.search, parcel, skiptrace, dnc,
entity.resolve, listing.status, flood`. Only `parcel`, `property.search` (FL DOR) and `flood` (FEMA) have a shipped
connector; `skiptrace`, `dnc`, `entity.resolve` and `listing.status` are declared and routable but **unfilled**.

### H. MCP Tools (`mcp/server.ts`)

| Tool | What it does |
|------|--------------|
| `list_connectors` | Each connector, whether configured (no key values ever returned) |
| `research_domain` | B2B research for a domain through the fixed connector order |
| `enrich_lead` | B2B enrichment for a lead |
| `save_run` | Persist an agent-written run through the same chain as the pipeline (suppression → pack gate → guard → footer → re-validate); rejects unknown `contactKey`s |
| `list_pending` | Drafts awaiting approval, with digests |
| `approve` / `reject` | Record a decision for the exact text (digest required to approve) |
| `list_runs` | Summaries of recent runs: status, pack, drafts, blocks, rejections, credits, cost |
| `suppress` | Add/list suppression entries (removal is CLI-only, deliberately) |
| `underwrite` | Deal math from `packages/deal-math`, returned as computed, quotable facts |

### I. The Eval Suites

- **B2B (`evals/fixtures/draft`, `evals/fixtures/score`)**: approvals in `evals/supported.ts`. Note the first entry,
  `anthropic / claude-sonnet-4-6 / b2b-sdr`, is `verified: false` ("legacy-claim, re-run required"); MiniMax-M3 is
  verified for `b2b-sdr` (re-qualified in #79).
- **Residential (`evals/fixtures/residential`, 19 files; harness `evals/residential.ts`)**:
  - 10 gate cases run through the product's real gate code with **no model call**: `dnc-suppressed-owner`,
    `suppressed-mailing-address`, `no-owner-contact`, `phone-only-owner`, `no-owner-record`,
    `expired-listing-under-exclusive`, `pre-foreclosure-signal`, `probate-estate-owner`, `outside-service-area`,
    `undeclared-license-terms`.
  - Model cases: `absentee-out-of-state`, `llc-owner`, `owner-occupied-cold`, `fair-housing-bait`,
    `commercial-parcel-decline` (decline is correct), and two protected-class pairs (`pair-age-a/b`, `pair-origin-a/b`)
    whose prompts must come out byte-identical after stripping and whose scores must agree (within 10 points, same
    band).
  - Scorers: score band (hot 70–100, warm 40–69, cold 0–39), reason grounding, draft rules, draft grounding (no
    invented price, percentage or name; street-suffix and state-name expansion are grounded), entity recipient,
    decline only where expected, pair parity, and a judge rubric.
  - Result records: `evals/results/2026-10-06-minimax-MiniMax-M3-residential-draft.v1@b7defdda{,-2,-3}.json` — all FAIL
    at 93% of fixtures / 98% of runs, each on different fixtures.

### J. Adjacent Repos and Live Pieces

| Repo / system | State | What it owes this program |
|---------------|-------|---------------------------|
| `intent-os` (`ops/host/services/forms-api/`) | `mandy-lead` route live on the VPS since 2026-10-06 (PR #743), notifier `ops/buzz/notify/buzz-notify.sh`, lead spool on Buzz failure, consent ledger 0600; backup of the previous forms-api at `/root/forms-api.bak-20261006T1658Z` | Call `runInbound` after a lead is recorded and post the draft + speed-to-lead to Buzz (blocked on the VPS model-key decision) |
| Buzz | Private channel `mandy-leads` (owner: Jeremy; notifier bot member) | Add Mandy once she has an identity |
| `comehomealabama` | Contact form posting to forms-api is built; **site go-live PR #12 held** for the brokerage name and license number | Consent text with the real brokerage |
| `coastal-realty-ops` | PR #73 merged (doc drift, Google pins dropped, `dnc_status` default `blocked`, 8am). **The local checkout on this box is behind** (`git log` shows v0.15.6 at HEAD) — fetch before working. Plane REALTY-7 | Dispatcher calling `check-send`; ERPNext sink; retire `src/orchestrator/compliance.py` and duplicate models; dashboard types generated from the engine schemas |

---

**Health Score: 76/100.** Code, tests, CI, compliance design and documentation are strong (≈ 90). Points are lost for
the missing dispatcher (the compliance boundary has no production caller), unencrypted PII at rest, no approved
residential model, an unreleased one-way schema, and the listing-status gap.
