# Product Requirements Document: PipelinePilot

**Document ID:** 001-PP-PROD-pipelinepilot-prd
**Created:** 2025-10-31
**Status:** Draft v0.2
**Owner:** Jeremy Longshore

---

## Executive Summary

**PipelinePilot** is a Vertex AI-native SDR orchestration platform designed for agencies to lease to their clients. It aggregates data from premium providers (Clay emphasized), routes tasks through specialist AI agents, and delivers structured, export-ready prospecting lists.

### Key Differentiators

1. **Vertex-Only Architecture** - No vendor lock-in with OpenAI/Anthropic
2. **Leaseable SaaS Model** - Flat fee + performance commission
3. **Multi-Tenant by Design** - Strict data isolation and per-tenant billing
4. **Provider-Agnostic** - Pluggable integrations with Clay, Apollo, Clearbit, HubSpot, Hunter

---

## Problem Statement

Agencies need a white-label SDR automation platform that:
- Doesn't require building infrastructure from scratch
- Tracks usage and performance for commission billing
- Allows clients to bring their own API keys (cost control)
- Provides AI orchestration without managing multiple AI vendors

---

## Target Users

### Primary: Agencies
- **Needs:** Recurring revenue, performance tracking, client enablement
- **Pain Points:** Building custom infra per client, tracking ROI, billing complexity

### Secondary: Agency Clients (B2B SaaS, Professional Services)
- **Needs:** Lead generation, list building, CRM integration
- **Pain Points:** Manual prospecting, fragmented tools, unverified data

---

## Core Features (MVP)

### 1. Multi-Tenant Management
- ✅ Tenant onboarding (POST /tenants)
- ✅ Lease contract storage (Firestore)
- ✅ Seat management (user licenses)
- ✅ Provider key references (GSM)

### 2. Provider Orchestration
- ✅ Clay: Company/person enrichment
- ✅ Apollo: People/company search
- ✅ Clearbit: Firmographics
- ✅ HubSpot: CRM upsert
- ✅ Hunter: Email verification

### 3. Usage Metering
- ✅ Event recording (provider calls, agent tasks, exports)
- ✅ Commission tracking (meetings, sourced MRR)
- ✅ Real-time usage aggregation

### 4. Billing & Invoicing
- ✅ Monthly invoice generation
- ✅ Stripe integration (invoice creation, webhook handling)
- ✅ Flat fee + seats + commission calculation
- ✅ Multi-tier pricing (Starter, Growth, Scale)

### 5. AI Agent System
- ✅ Orchestrator agent (task routing)
- ✅ ICP scorer (lead qualification)
- ✅ List builder (organization, deduplication)
- ⏳ Outreach coach (message generation) - Future

### 6. Export & Handoff
- ✅ CSV/JSON exports
- ✅ Vertex AI Storage signed URLs
- ✅ HubSpot direct sync

---

## User Stories

### Agency Admin
1. **As an agency admin**, I want to onboard new clients with custom pricing so I can offer flexible contracts.
2. **As an agency admin**, I want to track client usage and outcomes so I can calculate commission.
3. **As an agency admin**, I want monthly invoices generated automatically so billing is hands-off.

### Agency Client
1. **As a client**, I want to provide my own API keys so I control data provider costs.
2. **As a client**, I want to export enriched lists to CSV so I can import to my CRM.
3. **As a client**, I want verified, scored leads so I don't waste time on cold prospects.

---

## Success Metrics

### Launch (Month 1-3)
- 5 agencies onboarded
- 10 total clients (2 per agency average)
- 1,000 enrichment API calls/week
- 95% uptime (Cloud Run + Vertex)

### Growth (Month 4-12)
- 20 agencies
- 100 clients
- $50k MRR
- 98% uptime
- <2s avg API response time

### Scale (Year 2+)
- 100 agencies
- 1,000 clients
- $500k MRR
- Multi-region deployment
- Advanced AI agents (outreach coach, A/B testing)

---

## Out of Scope (v0.2)

- ❌ Outreach execution (email sending)
- ❌ Conversation AI (chatbot for leads)
- ❌ Built-in CRM (use HubSpot integration)
- ❌ Mobile app
- ❌ White-label branding UI

---

## Technical Requirements

### Infrastructure
- **Cloud:** Google Cloud Platform only
- **Compute:** Cloud Run (tools API), Vertex AI Agent Engine (agents)
- **Storage:** Firestore (tenant data), Vertex AI Storage (exports)
- **Secrets:** Google Secret Manager
- **Billing:** Stripe

### Security
- Tenant data isolation (Firestore collection partitioning)
- GSM-only for API keys (never plaintext in Firestore)
- Bearer token auth for agent API calls
- HTTPS only (Cloud Run enforced)

### Performance
- API response: <500ms (p50), <2s (p99)
- Vertex agent invocation: <5s average
- Export generation: <30s for 10k records
- Billing run: <5 minutes for 100 tenants

---

## Pricing Strategy (v0)

### Tiers
- **Starter:** $499/mo + $49/seat + 5% commission
- **Growth:** $999/mo + $49/seat + 7% commission
- **Scale:** $1999/mo + $49/seat + 10% commission

### Commission Models
- **Meetings:** $X per qualified meeting OR % of meeting value
- **Sourced MRR:** % of first 6 months' MRR for closed-won deals

All pricing adjustable per-tenant in LeaseContract.

---

## Roadmap

### Phase 0 (MVP) - Weeks 1-4 ✅
- Core API endpoints
- Firestore multi-tenancy
- Provider proxies
- Basic Vertex agents
- CI/CD pipeline

### Phase 1 - Weeks 5-8 🔵
- Advanced ICP scoring
- List builder optimization
- Export format expansion (Excel, Google Sheets)
- Usage dashboard (basic)

### Phase 2 - Weeks 9-12 ⚪
- Outreach coach agent
- A/B testing for messaging
- Advanced analytics
- White-label branding

### Phase 3 - Months 4-6 ⚪
- Multi-region deployment
- Advanced reporting
- Self-service agency portal
- Marketplace (agency directory)

---

## Open Questions

1. **Commission Attribution:** How do we track which leads came from PipelinePilot vs. other sources?
2. **Provider Rate Limits:** Should we implement rate limiting per tenant?
3. **Data Retention:** How long do we keep enrichment results?
4. **White-Label UI:** Do agencies want a co-branded frontend, or API-only?

---

## Appendix

- **JSON Schemas:** See [004-DR-SCHM-json-schemas.md](./004-DR-SCHM-json-schemas.md)
- **API Reference:** See [003-DR-APIM-api-reference.md](./003-DR-APIM-api-reference.md)
- **Architecture:** See [002-AT-ARCH-system-architecture.md](./002-AT-ARCH-system-architecture.md)

---

**Document Status:** Draft
**Next Review:** 2025-11-07
**Change Log:**
- 2025-10-31: Initial draft (v0.2)
