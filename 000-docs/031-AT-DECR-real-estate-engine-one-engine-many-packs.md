# 031-AT-DECR — Real estate lead engine: one engine, many packs, thin client repos

**Type:** Architecture Decision Record
**Status:** ACCEPTED — plan approved 2026-10-06; implementation tracked in epic [#83](https://github.com/jeremylongshore/intent-outreach/issues/83)
**Date:** 2026-10-06
**Author:** Jeremy Longshore (intentsolutions.io)
**Decision owner:** Jeremy Longshore
**Builds on:** `017-AT-DECR-rebuild-intent-outreach.md` (the engine and its invariants),
`019-AT-PLAN-unify-engine-packs-phase0-1.md` (the pack seam), `020-AT-PLAN-dealmachine-residential-addendum.md`
(DealMachine as the residential data source)
**Evidence:** `032-RA-SYNT-real-estate-engine-research-synthesis.md` (the five research reports behind this record)

---

## 0. One-paragraph decision

Intent Outreach becomes the single lead engine for real estate. It starts with Mandy's residential business
and is shaped so commercial, land and mobile-home-park packs can follow. There is **one engine**
(intent-outreach), **many packs** (b2b-sdr today, residential-re next), and **thin client repos**
(coastal-realty-ops, comehomealabama) that own the business around it. The engine generates; it never sends.
Before any real estate pack is built, three structural pieces land in the engine: a **send-time, per-channel
compliance check**, a **property/owner data model**, and a **capability-routed provider layer with budgets**.
Every pack built before them would inherit the wrong shape.

Scott Porter is explicitly **out of scope** for this decision and the work it authorizes.

---

## 1. Context

The owner wants one coherent, AI-native lead engine for real estate that is:

- plug-and-play across data providers, with several API keys per provider;
- built to evolve as AI changes;
- tracked properly.

Five research reports (market, data APIs, compliance, AI future-proofing, and an internal architecture gap
review) reached the same verdict: "one engine, many packs, thin client repos" is the right direction. They are
summarized in `032`.

The same review found that the engine's core still assumes B2B email: companies keyed by domain. Specifically:

- `Lead` is keyed by `domain` and requires `companyName`; `Contact` links back by `leadDomain`; the run input
  is a list of domains. A parcel with no owner contact, an LLC owner, several owners, one owner holding several
  parcels, or a phone-only owner cannot be expressed.
- The compliance gate has no channel, runs before drafting rather than at send time, and defaults quiet hours
  to `America/Chicago`.
- The suppression list holds only emails and domains, so an SMS "STOP" cannot be recorded.
- Every configured connector for a phase is called, each reads exactly one key, `CostMeter` tracks only LLM
  tokens, and `http.ts` has no cache or throttle.

Two plans in neighbouring repos would also bypass the engine's guarantees: coastal plan 026 adds a Frappe
"buy-box scoring" path, and plan 020's Step B design puts an ERPNext upsert inside an engine connector.

---

## 2. Decision

**One engine, many packs, thin client repos.**

- The engine (`intent-outreach`) owns everything that generates: research, enrichment, compliance gates,
  scoring, deal math, drafting, guards and evals.
- A **pack** supplies the vertical: buy box, data-source policy, rubric, underwriting, channels, draft rules,
  PII policy and eval suite (the Pack v2 interface, plan Phase 3).
- Client repos own the business: the system of record, sending, the dashboard, brand and lead capture.

The load-bearing invariants in `CLAUDE.md` stay as they are. In particular: validated output only reaches
storage, the gate fails closed, schema changes are additive (v6 is additive over v5), and the LLM never chooses
which provider to call.

### 2.1 Workspace layout (amends the plan's Phase 2)

**Decision.** The repo uses **npm workspaces, not pnpm.** The engine stays at the repo root. Only standalone
libraries live under `packages/*`; the first is `packages/deal-math` (Phase 5). Built-in packs stay in
`pipeline_core/packs/`.

**Why.** The repo root is the Claude Code plugin root. `.claude-plugin/plugin.json` runs
`${CLAUDE_PLUGIN_ROOT}/bundle/server.mjs`, and `.mcp.json`, `skills/`, the CI bundle-freshness and e2e jobs,
and the `.harness-hash` pins all assume the root. Moving the engine to `packages/engine` would break installed
plugins and churn every open PR, for zero behavior change. Switching npm to pnpm would rewrite the lockfile and
CI for no gain. Packs compile into the single bundle and share engine types, so a package per pack only pays
off once a third party ships one. The plan's goal (deal-math as an independent, zod-only library, plus room for
future packages) is met without the move.

**Effect on the plan.** Phase 2 becomes the schema v6 data model plus the typed research query. The workspace
skeleton lands with deal-math in Phase 5. Plan 019 Stage B's `packages/engine` lift is rejected (§5).

---

## 3. The three structural pieces that land first, and why

These are the expensive pieces to change later. Once runs are stored in the B2B shape, or a send path exists
without a send-time check, every later pack inherits the problem.

### 3.1 Send-time, per-channel compliance

**What.** The gate returns a verdict per contact **per channel**. The engine exports a pure, clock-injected
`assertSendable(message, contactPoint, channel, now, consent)` that every client dispatcher must call at send
time. Quiet hours are **8am–9pm in the recipient's local time** (TCPA), with the time zone taken from the
recipient's address or area code; when it is unknown, the most restrictive window applies. The message channel
enum gains `sms`, `mail` and `call_script`, each with its own footer: the license number and brokerage
disclosure on every outbound message (Alabama Real Estate Commission and Florida FREC rules), and STOP wording
and sender identification for SMS. A consent ledger (date, method, scope, exact text shown, revocation) becomes
an input to the gate, shaped to merge with coastal's `ConsentRecord`.

**Why.** A quiet-hours check at draft time says nothing about when the message is actually sent, and sending
happens outside the engine. Absentee owners often live in another time zone. A DNC block on SMS should not
block a mailed letter. Making `assertSendable` the one exported check means every dispatcher, in any repo,
applies the same rules at the moment that matters.

Phase 1 prepares for this: suppression gains phone (E.164) and mailing-address entries, the service-area
geofence moves from hardcoded zips in `compliance/index.ts` to pack/profile data, and coastal's `lead.py`
`dnc_status` default changes from `"clean"` to unknown/blocked (fail closed).

### 3.2 Property/owner data model (schema v6)

**What.** Additive types in `models.ts`, per invariant 6:

- `Property` (APN + county FIPS code, address, attributes)
- `Party` (person or entity)
- `Ownership` (many-to-many, share, provenance)
- `EntityLink` (LLC → person, with source and confidence)
- `ContactPoint` (phone / email / mail; mobile or landline; DNC status; source; verification date)
- `Fact { value, source, fetchedAt, responseHash, licenseTerms }`

`Lead` stays for b2b-sdr. `ResearchInput` changes from `{domain}` to a pack-defined query: geography plus
buy-box filters, or an address/APN lookup.

**Why.** Residential leads are parcels and owners, not companies with domains. Provenance on every fact lets the
draft guard trace each number to a connector response and lets the gate refuse outreach built on data marked
`outreach_restricted`.

### 3.3 Capability routing with budgets

**What.** Connectors carry capability tags (`property.search`, `parcel`, `skiptrace`, `dnc`, `entity.resolve`,
`listing.status`, `flood`). Each pack declares a routing policy per capability: `first-hit`, `ordered-fallback`
or `all`. Alongside it:

- several keys per connector (team and personal), with per-key quota tracking and an alert at 80%;
- a credit meter and a per-run budget that stops the run when exceeded;
- a response cache keyed by connector + capability + subject, with a TTL;
- a token-bucket rate limit per connector in `http.ts` (DealMachine: 60 requests/minute, 5,000/day);
- an MCP-client connector adapter that wraps vendor MCP servers as fixed-order connectors, with pinned and
  hashed tool definitions, a fixed tool list, a schema check on every response, and the server, version, tool
  and response hash recorded.

**Why.** Today two skip-trace vendors means paying twice, one vendor cannot be keyed separately for two people,
and vendor credits are invisible. The routing policy is fixed in configuration, never chosen by the LLM, so
invariant 5 (determinism) holds. The model is never handed a vendor's toolbox; tool poisoning is item 3 on the
OWASP MCP Top 10.

---

## 4. Repo boundary decisions

| Decision | Detail |
|---|---|
| **intent-outreach owns generation.** | Research, enrichment, compliance gates, scoring, deal math, drafting, guards and evals. All scoring and drafting go through the engine (its MCP server or CLI). |
| **Coastal's Frappe buy-box scoring path is cancelled.** | Coastal plan 026 §WS6's custom `coastal-ops` Frappe app would score and draft outside the draft guard, the gate and the validator. The Frappe side only ingests validated runs. (Internal review gap 5.) |
| **Connectors are read-only.** | Plan 020's "upsert into ERPNext" moves out of the engine into a coastal sink. The DealMachine connector reads only. (Internal review gap 6.) |
| **coastal-realty-ops owns the business.** | ERPNext is the system of record. Coastal owns sending (the dispatcher), the dashboard and suppression management. **Every dispatcher must call the engine's exported `assertSendable()` at send time.** |
| **comehomealabama owns brand, content and capture.** | Its form posts to the VPS `forms-api` → Buzz `mandy-leads`, and later to ERPNext and the engine's `runInbound`. |
| **The engine never sends.** | It drafts and records. Sending lives in coastal's dispatcher behind `assertSendable()`. |
| **Never ship these.** | AI cold calling; Street View imagery analysis; MLS data sent to hosted models; Zillow scraping. |

The data flow these boundaries produce: ERPNext ← one-way upsert of validated runs (keyed by APN+FIPS or E.164
phone) through the coastal sink; ERPNext → one-way pull into the engine of suppressions and a "do not research"
list of contacts already being worked. The engine's run store is the append-only log of what was generated;
ERPNext holds people, deals and status.

---

## 5. Alternatives considered

| Alternative | Why rejected |
|---|---|
| **A per-client fork of the engine** (one copy per brokerage or vertical) | Every fork would have to carry its own copy of the validator, the fail-closed gate, the draft guard, the suppression list and the eval gate, and every fix would have to be ported by hand. The forks would drift, and a safety fix landing in one would not protect the others. Packs give the same per-vertical freedom over one shared spine. |
| **A Python port in coastal** | Coastal already shows where this goes: `src/orchestrator/compliance.py` duplicates compliance the engine already has, the Lead model exists three times (`lead.py`, `web/shared/types/lead.ts`, the engine), and `lead.py` defaults `dnc_status` to `"clean"`, which is fail-open, the opposite of the engine. A port would be a second implementation of every invariant, maintained in a second language. Plan 019's "Do NOT port" list already rules it out; the coastal duplicates are retired in Phase 7. |
| **Letting the LLM choose providers** | It breaks invariant 5 (connectors called in fixed order; the LLM does not choose which API to call), which `017` adopted after the Vertex single-agent design let the model pick API calls. It also makes vendor spend unbounded and unpredictable, and handing a model a vendor's whole MCP toolbox invites tool poisoning. A declared routing policy gives the same fallback behaviour deterministically. |
| **Plan 019 Stage B's `packages/engine` lift** (a pnpm workspace with the engine, each pack and deal-math as packages) | The repo root is the plugin root: `plugin.json`, `.mcp.json`, `skills/`, the CI bundle-freshness and e2e jobs and the `.harness-hash` pins all assume it. The move would break installed plugins and churn every open PR for zero behavior change, and pnpm would rewrite the lockfile and CI for no gain. npm workspaces with the engine at the root and only standalone libraries under `packages/*` meet the same goal (§2.1). |

---

## 6. Consequences

**Positive**

- One implementation of compliance, grounding and validation protects every pack and every client repo.
- New verticals (`commercial-re`, `land`, `mhp`) reuse the data model, routing, deal math and gate instead of
  re-deriving them.
- Vendor spend is metered and capped per run; no capability is paid for twice.
- Client repos stay thin: they store, send and present, and cannot route around the engine's checks.

**Negative / costs**

- Schema v6 and Pack v2 are large, core changes that must land before any residential pack ships value.
- Packs are not separately versioned packages; they ship inside the single bundle until a third party ships one
  (§2.1).
- Clients depend on the engine's release cadence for any change to compliance or scoring.
- Per-pack PII policy means the residential pack keeps owner phones, so the run store must become encrypted
  SQLite with a retention period and append-only audit.

**Owner decisions still open** (none block work until the phase that needs them)

1. The **brokerage name and license number**, for the consent text and footers (Track 0 and Phase 3).
2. Whether **Mandy has a Buzz identity**, for `mandy-leads` channel membership (Track 0).
3. The **DealMachine seat at $99/month** (Phase 6).
4. **Counsel review before any SMS automation or AI calling.** Neither is planned; A2P 10DLC registration and
   the consent ledger are prerequisites.

---

## 7. Build order

Per the approved plan (`~/.claude/plans/linear-stargazing-adleman.md`), one child bead per phase under the
epic:

- **Track 0:** comehomealabama lead form → VPS `forms-api` → Buzz `mandy-leads` (in flight).
- **Phase 1:** doc drift fixes; phone and address suppression; geofence as pack data; coastal fail-closed DNC
  default.
- **Phase 2 (amended, §2.1):** schema v6 data model; typed research query. The plan's pnpm workspace
  (`packages/engine`, `packages/packs/*`) is dropped.
- **Phase 3:** Pack v2; per-channel gate and `assertSendable`; new channels and footers; consent ledger; risk
  gates (probate, divorce and pre-foreclosure to manual approval; no credit or financial variables in scoring;
  no contact during an active exclusive listing); fair-housing draft rules and paired evals.
- **Phase 4:** capability routing, multiple keys, credit budget, cache, rate limits, provenance and license
  terms, MCP-client adapter.
- **Phase 5:** the npm workspace skeleton plus `packages/deal-math` (integer cents, basis points, explicit assumptions, golden tests from
  coastal `trade_up.py`); the LLM never does arithmetic.
- **Phase 6:** `residential-re` pack: free-tier data first (county GIS, FEMA NFHL, OpenCorporates), then a
  read-only DealMachine connector; residential eval suite; model approval keyed by (provider, pack).
- **Phase 7:** inbound flow (`runInbound`, target an approved reply in under 60 seconds); coastal ERPNext sink;
  retire coastal's duplicate Python.
- **Phase 8:** human approval queue, event monitors, batch scoring and caching, per-capability model gate,
  more MCP tools; later the `commercial-re`, `land` and `mhp` packs.
