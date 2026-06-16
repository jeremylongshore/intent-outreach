# 018-DR-LAND — B2B Data Provider Landscape (2026) + Connector Roster Decision

**Type:** Reference / Landscape (DR-LAND)
**Date:** 2026-06-16
**Author:** Jeremy Longshore (intentsolutions.io)
**Why this exists:** Before hand-rolling connectors, a 4-agent research sweep verified what each
SaaS data platform actually ships in 2026 (official MCP servers, SDKs, current endpoints, BYO-key
access). It found the legacy connector bodies were stale and two of the four planned connectors
were no longer viable as standard self-serve sources. This doc records the findings and the roster
decision so future sessions don't re-run the sweep.

---

## Roster decision (owner directive, 2026-06-16)

> "Wire it for anything and everything it can be — no deferring. Even where the provider charges,
> build it so people can hook it up. Make it pluggable."

So Intent Outreach ships **an adapter for every provider that has a real, legitimately-accessible
BYO-key API (free *or* paid)**, plus a **connector registry** so users can add their own without
editing core. A connector with no key **self-skips** (never errors). Each connector declares its
tier so the user knows the cost reality up front.

**Two honest exclusions** (not deferrals — there is nothing to legitimately hook up to):
**Proxycurl** (shut down July 2025 after the LinkedIn lawsuit — dead service + legal liability) and
**direct LinkedIn / Sales Navigator scraping** (no official API; ToS-forbidden). Sales-Navigator-style
filtering routes through Apollo's equivalent filters; a documented seam is left for a legit OAuth
wrapper (Unipile) if ever wanted.

---

## Shipped connectors (`pipeline_core/connectors/`)

| Connector | Tier | Key env var | Phases | Status / endpoint notes |
|---|---|---|---|---|
| **Apollo** | free | `APOLLO_API_KEY` | research + enrich | **Workhorse.** Self-serve, 50 free credits/mo. Covers company lookup, people search, contact enrichment. Corrected endpoints: `POST /api/v1/mixed_people/api_search`, `POST /api/v1/organizations/api_search`, `POST /api/v1/people/bulk_match`; auth header `X-Api-Key` (NOT `Authorization: Bearer`; the legacy `GET /v1/people/search` was wrong). |
| **Hunter.io** | free | `HUNTER_API_KEY` | research + enrich | Self-serve, 50 free searches/mo, best docs. `GET /v2/domain-search`, `/v2/email-finder`; auth via `api_key` query param. The $0 on-ramp connector. |
| **People Data Labs** | free | `PDL_API_KEY` | research + enrich | Self-serve, 100 free/mo. `GET /v5/company/enrich`, `/v5/person/enrich`, `POST /v5/person/search`; auth header `X-Api-Key`. |
| **Exa** | free | `EXA_API_KEY` | research + enrich | Self-serve, 1k free/mo. Web research context (news, funding mentions), NOT contact records. `POST /search`; auth header `x-api-key`. |
| **Crunchbase** | paid | `CRUNCHBASE_API_KEY` | enrich | Funding/investors. Free tier discontinued (Pro $99/mo). `POST /v4/data/searches/organizations`; auth header `X-cb-user-key`. |
| **LeadMagic** | paid | `LEADMAGIC_API_KEY` | enrich | $49/mo, AI-native, official MCP. Email + mobile finding. `POST /email-finder`; auth header `X-API-Key`. |
| **Clay** | paid | `CLAY_API_KEY` + `CLAY_WEBHOOK_URL` | research | **Middleware, not a direct data source** — push-only. POSTs the domain into the user's Clay table; results return async into their workspace, not synchronously here. Self-skips unless both vars are set. |
| **Clearbit** | legacy | `CLEARBIT_API_KEY` | enrich | **New API keys are no longer issued** (folded into HubSpot Breeze, internal only). Works only with a pre-2024 key. `GET person.clearbit.com/v2/people/find`, `company.clearbit.com/v2/companies/find`; auth `Authorization: Bearer`. Kept for users who still hold a key. |
| **ZoomInfo** | enterprise | `ZOOMINFO_JWT` | research + enrich | Enterprise contract only; no self-serve. Accepts a pre-obtained JWT bearer for BYO simplicity. `POST /search/company`, `/search/contact`, `/enrich/contact` at `api.zoominfo.com`. |

Deterministic registration order (the pipeline's call order): free → paid → legacy → enterprise.

---

## Build-stack facts (verified 2026-06-16, pinned in package.json)

- **`@modelcontextprotocol/sdk` 1.29** — `McpServer` + `server.registerTool(name, {title, description, inputSchema}, handler)` + `StdioServerTransport`. Tool handlers MUST return `{ content: [{ type: "text", text }] }`.
- **Vercel AI SDK `ai` 4.3** + `@ai-sdk/anthropic` 1.2 — `generateText({ model, tools, messages })` for cross-provider tool-calling; `generateObject({ model, schema })` for zod structured output; `experimental_createMCPClient` to consume an MCP server's tools. (The "AI SDK 6" claim in one research pass was wrong; v4 is current and pairs with `@ai-sdk/anthropic` v1.2.)
- **Plugin packaging** — `.claude-plugin/plugin.json` + root `.mcp.json` declaring a stdio server with `command`/`args` using `${CLAUDE_PLUGIN_ROOT}` and `env` passthrough (`"APOLLO_API_KEY": "${APOLLO_API_KEY}"`) so the user's shell keys reach the server without ever living in the manifest.
- **We ship ONE MCP server** wrapping our own connectors (not a dependency on per-vendor MCP servers) — the plan's "one server, many tools."

---

## Providers evaluated but NOT shipped

| Provider | Why not |
|---|---|
| **Proxycurl** | Shut down July 2025 after LinkedIn/Microsoft lawsuit (Case 3:25-cv-00828, N.D. Cal.). Dead + legal liability. Never integrate. |
| **LinkedIn Sales Navigator (direct)** | No official people-search API; ToS forbids automated access. Route SalesNav-style filtering through Apollo; leave a Unipile (OAuth) seam documented. |
| **Amplemarket** | Official MCP shipped Mar 2026 but young/unproven. Revisit; trivial to add as an adapter later. |
| **Tomba.io / Findymail / Surfe** | Viable self-serve email finders; not shipped in v1 but the registry makes each a one-file add. |

---

*Sources: 4-agent research sweep, 2026-06-16 (Clay/Apollo; Clearbit/Crunchbase; SalesNav/ZoomInfo +
alternatives; MCP/AI-SDK ecosystem). Full citations in the sweep transcripts.*
