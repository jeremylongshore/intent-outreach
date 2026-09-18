# Addendum to 019-AT-PLAN — DealMachine as the residential data source, and the path to Mandy's dashboard

**Filed:** 2026-09-18 · **Amends:** `019-AT-PLAN-unify-engine-packs-phase0-1.md` (Deferred tracks → Phase 2, Phase 3)
**Status:** Proposed. No code yet. It becomes active when a DealMachine seat is bought.

## Why this exists

019 planned the deferred `residential-re` pack around **BatchLeads + Vulcan7**. We have since found
**DealMachine**, which offers a documented REST API and a hosted MCP server. It covers the same job
(property + owner data, skip trace, motivated-seller filters) and adds Driving for Dollars plus direct
mail. This addendum makes DealMachine the **lead candidate** for the pack's data connector. It also
defines the shortest path from DealMachine data to Mandy, who works the leads out of Twenty CRM and
the `coastal-realty-ops` dashboard.

## What DealMachine offers (verified 2026-09-18 from public docs)

| Fact | Value | Source |
|---|---|---|
| REST base URL | `https://api.v2.dealmachine.com/v1` | api.docs.dealmachine.com |
| Auth | `Authorization: Bearer dm_sk_live_…`, org-scoped key (OAuth 2.0 + device flow also supported) | api.docs.dealmachine.com |
| Surface | Properties (search / count / export / enrich by address, APN), People (search / enrich by phone, email, name), **DNC status check**, Lists (CRUD + export), Driving (assignments, targets, tags, notes), Mail campaigns, Activity history | api.docs.dealmachine.com/llms.txt |
| MCP | `https://mcp.dealmachine.com` (21 tools). Counts, filter discovery and usage checks are free; record pulls spend credits | api.docs.dealmachine.com/ai-assistants/mcp-server |
| Plans | Basic $99/seat/mo (10k credits) · Pro $149/seat/mo (20k credits, premium filters) · Scale $599/pkg | dealmachine.com/pricing |
| API / webhooks / Zapier | Listed as included on **all** plans | dealmachine.com/pricing |
| Credit model | 1 credit per unique record, de-duplicated within a billing cycle | MCP docs |

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

Mandy's surfaces today: the **DealMachine app itself** (once she has a seat), **Twenty CRM**
(`crm.intentsolutions.io`, plus its phone app), and the **dashboard** at `mandy.intentsolutions.io`.
The dashboard's panels still render from `src/fixtures/`, and its sidecar (`:8787`) only serves
auth and health. No live data flows into it yet.

| Step | What Mandy gets | Work |
|---|---|---|
| **A. Seat + saved lists** | She runs searches, driving routes and lists directly in DealMachine's app | None |
| **B. DealMachine → Twenty sync** | New leads show up as Twenty People + an Opportunity tagged `source=dealmachine`, on desktop and on her phone | One small scheduled job (below) |
| **C. Dashboard reads Twenty** | The HotLeadQueue / Pipeline panels switch from fixtures to live Twenty data through the sidecar | Sidecar `GET /api/leads` → Twenty REST (the `TWENTY_API_KEY` config already exists) |
| **D. Engine scores + drafts** | Claude scores each lead and drafts outreach, blocking any DNC-listed contact | `residential-re` pack (019 Phase 2) |

**Twenty is the hub.** DealMachine writes into Twenty, and both the dashboard and the engine read from
it. This follows coastal's "the agent's data is hers forever" principle and means the dashboard
never talks to DealMachine directly.

### Step B design (the one piece of real code before Phase 2)

- **Where:** a `dealmachine` connector in `pipeline_core/connectors/`, BYOK (`DEALMACHINE_API_KEY` via
  `getSecret`, self-skipping via `isConfigured()`), built to the 019 connector contract so Phase 2
  reuses it rather than rebuilding it.
- **Trigger:** a nightly pull (a systemd timer on the VPS, following the `mandy-sidecar` pattern) that
  exports a **saved DealMachine list**. Mandy curates the list in the app, and the job only
  syncs it. It does not use webhooks until they are verified (see above).
- **Idempotency:** upsert into Twenty keyed on DealMachine's property ID + person ID, so a re-run never
  duplicates records. Credits are already de-duplicated per cycle on DealMachine's side.
- **Secrets:** the key lives in SOPS (`web/dashboard/secrets.prod.sops.yaml` or the VPS notify-style file).
  It is never stored as plaintext.

### Compliance boundary (unchanged invariant)

Syncing records for display (Steps A–C) involves no outreach. **Any SMS or call** goes only through the
engine's compliance gate (`pipeline_core/compliance/`: DNC scrub, TCPA quiet hours, service-area
geofence), which runs before drafting. DealMachine's DNC-status endpoint feeds that gate as enrich data.
Per the pack rules, a live lookup belongs in a BYOK enrich connector and never in the gate itself.

## Changes to 019

- **Phase 2 `residential-re`:** the primary data connector is now "DealMachine **or** BatchLeads, decided
  by Phase 2a". Vulcan7 (expireds) and OpenCorporates stay as planned.
- **Phase 3 dashboard:** before the full dashboard lift, add Step C (sidecar reads Twenty) as a
  smaller milestone. Mandy gets live data without waiting for `packages/dashboard`.
- Nothing else changes. That includes zero Google dependency, no porting of coastal stubs, and BYOK
  connectors throughout.

## Open questions

1. Do webhook events exist in practice? Get event types and signing from DealMachine support using a live key.
2. What does skip trace cost per record on Basic vs Pro?
3. Does Mandy need Pro's premium filters for her motivated-seller criteria? Check this during Phase 2a with the free counts.
