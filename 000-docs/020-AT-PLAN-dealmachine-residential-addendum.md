# Addendum to 019-AT-PLAN — DealMachine as the residential data source, and the path to Mandy's dashboard

**Filed:** 2026-09-18 · **Amends:** `019-AT-PLAN-unify-engine-packs-phase0-1.md` (Deferred tracks → Phase 2, Phase 3)
**Status:** Proposed. No code yet. It becomes active when a DealMachine seat is bought.

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

**Unverified:** the pricing page says webhooks are included, but the API doc index has **no webhook
section** (no event types, no payload, no signing). Do not design around webhooks until we have
confirmed event types and request signing with a live key. Skip-trace cost per record is also not
published.

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

1. Do webhook events exist in practice? Emailed support@dealmachine.com on 2026-09-18 (15 questions; their AI assistant could not confirm events or signing).
2. What does skip trace cost per record on Basic vs Pro?
3. Does Mandy need Pro's premium filters for her motivated-seller criteria? Check this during Phase 2a with the free counts.
