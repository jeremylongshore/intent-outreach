# Addendum to 019-AT-PLAN — DealMachine as the residential data source, and the path to Mandy's dashboard

**Filed:** 2026-09-18 · **Amends:** `019-AT-PLAN-unify-engine-packs-phase0-1.md` (Deferred tracks → Phase 2, Phase 3)
**Status:** Proposed. No code yet. It becomes active when a DealMachine seat is bought.
**Updated 2026-09-24:** DealMachine support answered 14 of 15 pre-purchase questions (see below); webhooks are still unanswered.

## Why this exists

019 planned the deferred `residential-re` pack around **BatchLeads + Vulcan7**. We have since found
**DealMachine**, which offers a documented REST API and a hosted MCP server. It covers the same job
(property + owner data, skip trace, motivated-seller filters) and adds Driving for Dollars plus direct
mail. This addendum makes DealMachine the **lead candidate** for the pack's data connector. It also
defines the shortest path from DealMachine data to Mandy, who works leads in **ERPNext** (her CRM of
record since 2026-09-18) through the `coastal-realty-ops` dashboard.

## What DealMachine offers (verified 2026-09-18 from public docs)

| Fact | Value | Source |
|---|---|---|
| REST base URL | `https://api.v2.dealmachine.com/v1` | api.docs.dealmachine.com |
| Auth | `Authorization: Bearer dm_sk_live_…`, org-scoped key (OAuth 2.0 + device flow also supported) | api.docs.dealmachine.com |
| Surface | Properties (search / count / export / enrich by address, APN), People (search / enrich by phone, email, name), **DNC status check**, Lists (CRUD + export), Driving (assignments, targets, tags, notes), Mail campaigns, Activity history | api.docs.dealmachine.com/llms.txt |
| MCP | `https://mcp.dealmachine.com` (21 tools). Counts, filter discovery and usage checks are free; record pulls spend credits | api.docs.dealmachine.com/ai-assistants/mcp-server |
| Plans | Basic $99/seat/mo (10k credits) · Pro $149/seat/mo (20k credits, premium filters) · Scale $599/pkg | dealmachine.com/pricing |
| API / webhooks / Zapier | Listed as included on **all** plans | dealmachine.com/pricing |
| Credit model | 1 credit per unique property, 1 per unique contact (phone/email included). A re-pull in the same billing month is free. **Export costs 1 credit per record.** Credits reset monthly and **do not roll over**. Annual billing is discounted | MCP docs; DealMachine support assistant 2026-09-18 |

**Answered by DealMachine support 2026-09-21** (Pam, Support — reply to our 15 questions; their AI
assistant could confirm almost none of this, a human did):

| Question | Answer |
|---|---|
| Skip-trace cost | **1 credit per contact revealed**, same on Basic and Pro, drawn from the plan allowance, never billed separately. |
| Cost per property | 1 credit for the property + 1 per contact revealed/exported → a property with one contact = **2 credits**. Re-pull inside the same billing period is free (deduplicated); a new period charges again. |
| API / MCP by plan | API, CLI, **MCP server and webhooks are on every plan**. No Pro-only endpoints or MCP tools. Only *filters* differ. |
| Rate limits | **60 requests/minute, 5,000/day.** Batch endpoints take up to 250 items and count as one request. |
| Basic filters | Absentee, high equity, vacant, out-of-state owner, pre-foreclosure status — **all on Basic**. |
| Pro "premium" filters | Pre-foreclosure auction/default dates, mover + buyer signals, investor/multi-property insights, mortgage activity, detailed equity/refinance terms, insurance signals, some demographics. |
| **Expired listings** | **Yes — a dedicated Expired Listings filter.** |
| Data freshness | Property + owner from county public records; contact data from a third party. Equity/mortgage derived from recorded mortgage and sale data. **Updated monthly**, with the full pass taking 1–2 weeks. |
| DNC | Numbers carry a **DNC badge**, and there's a Scrub DNC option on export. **No litigator flagging and no reassigned-number detection.** |
| Mobile vs landline | **Yes**, identified. |
| STR / vacation-rental flag | **No such flag.** |
| Baldwin County hit rates | **Not published**, by county or city. |
| Cancellation | Access runs to the end of the paid period; exported data stays with you. No stated restriction on storing it in our own CRM. |
| Billing | Monthly or annual (**annual saves 17%**). Mid-cycle upgrades allowed. |
| Free trial | **None**, and no sample credits. A free explore account exists but paid features stay locked. |

**Still open:** webhook events, payload shape, signing and retry policy — support escalated it to their
team on 2026-09-21 and has not followed up (a "need anything else?" nudge arrived 2026-09-22). Until
that lands, the sync design stays on a scheduled pull.

**What their answers change for us:**

1. **Expired listings are in.** 019 planned Vulcan7 for expireds. If DealMachine's expired filter holds
   up in Baldwin County, one $99–149 seat replaces BatchLeads *and* Vulcan7 — re-scope Phase 2 before
   buying a Vulcan7 seat.
2. **Credits are per-contact, not per-property.** Budget ~2 credits per usable lead, so Basic's 10k/mo
   is roughly **5,000 skip-traced leads a month** — far above Mandy's volume. Basic is the right tier;
   Pro only buys premium filters.
3. **No STR flag** — the Gulf Shores/Orange Beach investor angle needs the STR-registry cross-reference
   already planned in coastal PRD FR-11, not a provider flag.
4. **No litigator scrub** — DealMachine's DNC badge is necessary but not sufficient. Keep the engine's
   own compliance gate authoritative (`pipeline_core/compliance/`), and treat an unknown DNC status as
   blocked, which the dashboard already does.
5. **No trial** means Phase 2a starts by paying for one Basic month. The free MCP counts still let us
   size Baldwin County inventory before that.

## Decision 1 — evaluate before building (Phase 2a, zero code)

1. Buy **one Basic seat** (in Mandy's name, so she owns the account and its history).
2. Connect the MCP server to Claude Code: `claude mcp add` via `npx mcp-remote https://mcp.dealmachine.com`.
   Use it to run the Baldwin South target filters from coastal's PRD FR-01 (absentee, high-equity,
   tired-landlord; Gulf Shores / Orange Beach / Foley / Fort Morgan zips). Counts are free.
3. Pull a small sample (≤200 records) and score it against BatchLeads on phone and email hit rate,
   owner-name accuracy, and equity accuracy.
4. **Pick one provider.** Paying for DealMachine and BatchLeads together duplicates the same data.

The exit criterion is a written comparison appended to this doc. If DealMachine loses, this addendum
closes, and 019's BatchLeads plan stands unchanged.

## Decision 2 — the path to Mandy, in order of effort

> **Retargeted 2026-09-18: Twenty → ERPNext.** Mandy never had a Twenty workspace (verified in Twenty's
> DB). Per coastal `026` WS6, ERPNext is her CRM of record. Her dashboard now reads ERPNext live
> (coastal PRs #54/#55): Hot Lead Queue = Leads with `lead_score=HOT`, Pipeline = open Opportunities by
> Sales Stage.

Mandy's surfaces: the **DealMachine app itself** (once she has a seat), **ERPNext**
(`erp.intentsolutions.io`), and the **dashboard** at `mandy.intentsolutions.io`, which reads ERPNext.

| Step | What Mandy gets | Work |
|---|---|---|
| **A. Seat + saved lists** | She runs searches, driving routes and lists directly in DealMachine's app | None |
| **B. DealMachine → ERPNext sync** | New leads land as ERPNext Leads (`utm_source=DealMachine`, `lead_score`, `intent_signal`, `dnc_status`, `property_zip`) and show up in her dashboard's Hot Lead Queue automatically | One small scheduled job (below) |
| ~~C. Dashboard reads the CRM~~ | **Done 2026-09-18** (coastal #54) | — |
| **D. Engine scores + drafts** | Claude scores each lead and drafts outreach, blocking any DNC-listed contact | `residential-re` pack (019 Phase 2) |

**ERPNext is the hub.** DealMachine writes into it, and both the dashboard and the engine read from
it. The dashboard never talks to DealMachine directly.

### Step B design (the one piece of real code before Phase 2)

- **Where:** a `dealmachine` connector in `pipeline_core/connectors/`, BYOK (`DEALMACHINE_API_KEY` via
  `getSecret`, self-skipping via `isConfigured()`), built to the 019 connector contract so Phase 2
  reuses it rather than rebuilding it. It needs a separate ERPNext **write** key, distinct from the
  dashboard's read-only `Dashboard Reader` key.
- **Trigger:** a nightly pull (a systemd timer on the VPS, following the `mandy-sidecar` pattern) of a
  **saved DealMachine list** that Mandy curates. **Pull only new or changed records**, because export
  costs a credit per record and credits don't roll over. It does not use webhooks until they are
  verified (see above).
- **Idempotency:** upsert into ERPNext Lead keyed on DealMachine's property ID + person ID (a custom
  field), so a re-run never duplicates records.
- **Secrets:** the keys live in SOPS. They are never stored as plaintext.

### Compliance boundary (unchanged invariant)

Syncing records for display (Steps A–B) involves no outreach. **Any SMS or call** goes only through the
engine's compliance gate (`pipeline_core/compliance/`: DNC scrub, TCPA quiet hours, service-area
geofence), which runs before drafting. DealMachine's DNC-status endpoint feeds that gate as enrich data.
Per the pack rules, a live lookup belongs in a BYOK enrich connector and never in the gate itself.

## Changes to 019

- **Phase 2 `residential-re`:** the primary data connector is now "DealMachine **or** BatchLeads, decided
  by Phase 2a". Vulcan7 (expireds) and OpenCorporates stay as planned.
- **Phase 3 dashboard:** the sidecar-reads-the-CRM milestone shipped against **ERPNext**
  (coastal #54/#55). The `SqliteRunStore`/`packages/dashboard` lift stays deferred.
- Nothing else changes. That includes zero Google dependency, no porting of coastal stubs, and BYOK
  connectors throughout.

## Open questions

1. **Webhooks** — events, payload, signing, retries. Support escalated 2026-09-21, no answer yet. Chase it before designing any push-based sync.
2. ~~Skip-trace cost~~ — answered: 1 credit per contact revealed, same on both plans.
3. Does Mandy need Pro's premium filters? Her core criteria are all on Basic; Pro adds mover/buyer signals and investor insights. **Start on Basic.**
4. Does the Expired Listings filter cover Baldwin County well enough to drop Vulcan7 from Phase 2?
