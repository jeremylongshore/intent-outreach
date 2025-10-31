# PipelinePilot

**Vertex AI-Native SDR Orchestration Platform for Agencies**

[![CI/CD](https://github.com/YOUR_USERNAME/pipelinepilot/workflows/CI%20&%20Deploy/badge.svg)](https://github.com/YOUR_USERNAME/pipelinepilot/actions)
[![License](https://img.shields.io/badge/license-Proprietary-red.svg)](LICENSE)

---

## Overview

**PipelinePilot** is a leaseable SaaS platform that enables agencies to offer white-label SDR automation to their clients. Built entirely on Google Cloud Platform with Vertex AI, it orchestrates data from premium providers (Clay, Apollo, Clearbit, HubSpot, Hunter) through specialized AI agents.

### Key Features

- ✅ **Vertex-Only Architecture** - No OpenAI/Anthropic vendor lock-in
- ✅ **Multi-Tenant by Design** - Strict data isolation, per-tenant billing
- ✅ **Leaseable SaaS Model** - Flat fee + seats + performance commission
- ✅ **Provider-Agnostic** - Pluggable integrations with top SDR tools
- ✅ **AI Orchestration** - Gemini-powered agents for enrichment, scoring, list building
- ✅ **Export-Ready** - CSV/JSON exports, HubSpot direct sync

---

## Quick Start

### Prerequisites

- Node.js 20+
- Google Cloud Platform account (billing enabled)
- Stripe account
- Provider API keys (Clay, Apollo, etc.)

### Local Development

```bash
# Clone repository
git clone https://github.com/YOUR_USERNAME/pipelinepilot.git
cd pipelinepilot

# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your credentials

# Run development server
npm run dev

# Server starts at http://localhost:8080
```

### Deploy to Production

See [000-docs/006-OD-CICD-deployment-guide.md](000-docs/006-OD-CICD-deployment-guide.md) for complete deployment instructions.

**Quick Deploy:**
```bash
# Push to main branch
git push origin main

# GitHub Actions will:
# 1. Build TypeScript
# 2. Deploy Cloud Run
# 3. Deploy Vertex AI agents
```

---

## Architecture

```
Cloud Run (Tools API) → Firestore + Vertex AI Storage
         ↓
Vertex AI Agents (Orchestrator, ICP Scorer, List Builder)
         ↓
Provider APIs (Clay, Apollo, Clearbit, HubSpot, Hunter)
         ↓
Stripe (Billing)
```

**Tech Stack:**
- **Compute:** Cloud Run (Node.js 20, TypeScript, Express)
- **Database:** Firestore (multi-tenant collections)
- **Storage:** Vertex AI Storage (exports)
- **AI:** Vertex AI Agent Engine (Gemini 2.5 Flash)
- **Secrets:** Google Secret Manager
- **Billing:** Stripe

See [000-docs/002-AT-ARCH-system-architecture.md](000-docs/002-AT-ARCH-system-architecture.md) for detailed architecture.

---

## API Endpoints

### Tenant Management
- `POST /tenants` - Create tenant lease contract
- `GET /tenants/:id` - Get tenant details
- `PATCH /tenants/:id` - Update tenant settings
- `POST /tenants/:id/seats` - Add user seats
- `POST /tenants/:id/provider-keys` - Store provider credentials (GSM refs)

### Usage Tracking
- `POST /usage` - Record usage event
- `GET /usage/:tenantId` - Get usage summary
- `POST /usage/:tenantId/meeting` - Record qualified meeting
- `POST /usage/:tenantId/sourced-mrr` - Record sourced MRR

### Billing
- `POST /billing/run-monthly` - Generate monthly invoices
- `POST /billing/stripe-webhook` - Handle Stripe events
- `GET /billing/:tenantId/invoices` - Get tenant invoices

### Provider Proxies
- `POST /providers/:tenant/clay/enrich` - Clay enrichment
- `POST /providers/:tenant/apollo/search` - Apollo search
- `POST /providers/:tenant/clearbit/enrich` - Clearbit enrichment
- `POST /providers/:tenant/hubspot/upsert` - HubSpot CRM sync
- `POST /providers/:tenant/hunter/verify` - Hunter email verification

### Exports
- `GET /exports/:tenant/leads.csv` - Get signed URL for CSV export
- `POST /exports/:tenant/generate` - Generate export from Firestore data

See [000-docs/003-DR-APIM-api-reference.md](000-docs/003-DR-APIM-api-reference.md) for complete API reference.

---

## Pricing Model

### Tiers

| Plan | Flat Fee | Per Seat | Commission |
|------|----------|----------|------------|
| **Starter** | $499/mo | $49/seat | 5% |
| **Growth** | $999/mo | $49/seat | 7% |
| **Scale** | $1,999/mo | $49/seat | 10% |

### Commission Models
- **Meetings:** % of qualified meeting value
- **Sourced MRR:** % of first 6 months' MRR for closed-won deals

All pricing adjustable per-tenant in LeaseContract.

See [000-docs/007-PP-LEAS-leasing-model.md](000-docs/007-PP-LEAS-leasing-model.md) for details.

---

## Documentation

### Core Docs
- [001-PP-PROD-pipelinepilot-prd.md](000-docs/001-PP-PROD-pipelinepilot-prd.md) - Product requirements
- [002-AT-ARCH-system-architecture.md](000-docs/002-AT-ARCH-system-architecture.md) - Architecture
- [006-OD-CICD-deployment-guide.md](000-docs/006-OD-CICD-deployment-guide.md) - Deployment
- [007-PP-LEAS-leasing-model.md](000-docs/007-PP-LEAS-leasing-model.md) - Pricing & billing

### Full Index
See [000-docs/000-INDEX.md](000-docs/000-INDEX.md)

---

## JSON Schemas

All data structures validated with JSON Schema:
- [lease_contract.schema.json](schemas/lease_contract.schema.json) - Tenant lease contracts
- [usage_event.schema.json](schemas/usage_event.schema.json) - Usage metering events
- [billing_invoice.schema.json](schemas/billing_invoice.schema.json) - Monthly invoices

See [000-docs/004-DR-SCHM-json-schemas.md](000-docs/004-DR-SCHM-json-schemas.md) for details.

---

## Vertex AI Agents

### Orchestrator
Routes SDR tasks to provider endpoints, aggregates results, provides recommendations.

**Model:** Gemini 2.5 Flash
**Config:** [agents/orchestrator.yaml](agents/orchestrator.yaml)

### ICP Scorer
Scores leads 0-100 against Ideal Customer Profile criteria, categorizes as hot/warm/cold.

**Model:** Gemini 2.5 Flash
**Config:** [agents/icp_scorer.yaml](agents/icp_scorer.yaml)

### List Builder
Deduplicates, prioritizes, and structures prospecting lists for export.

**Model:** Gemini 2.5 Flash
**Config:** [agents/list_builder.yaml](agents/list_builder.yaml)

See [000-docs/005-AT-AGEN-agent-system.md](000-docs/005-AT-AGEN-agent-system.md) for details.

---

## Security

### Tenant Isolation
- Firestore collections partitioned by `tenantId`
- GSM secret references stored per-tenant
- Bearer tokens identify tenant in requests

### Secrets Management
- **NEVER** store plaintext API keys in Firestore
- **ALWAYS** use GSM references
- Rotate secrets via GSM versioning

### Authentication
- Cloud Run: IAM-based auth for internal services
- Vertex Agents: Bearer token auth
- Stripe Webhooks: Signature verification

---

## Development

### Scripts

```bash
npm run dev         # Local development server
npm run build       # Build TypeScript
npm run typecheck   # Type checking
npm run lint        # Lint code
npm start           # Production server
```

### Testing Locally

```bash
# Start dev server
npm run dev

# In another terminal, test endpoints
curl http://localhost:8080/health

# Create test tenant
curl -X POST http://localhost:8080/tenants \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Agency","plan":"starter","email":"test@example.com"}'
```

---

## Monitoring

### Cloud Run
- **Logs:** Cloud Logging (auto-enabled)
- **Metrics:** Request latency, error rate, instance count
- **Alerts:** >5% error rate, >2s p99 latency

### Firestore
- **Metrics:** Read/write counts, index usage
- **Alerts:** >90% quota usage

### Vertex AI
- **Metrics:** Invocation count, latency, errors
- **Alerts:** >10% error rate, >10s p99 latency

---

## Roadmap

### Phase 0 (MVP) ✅
- Core API endpoints
- Multi-tenant Firestore
- Provider proxies
- Basic Vertex agents
- CI/CD pipeline

### Phase 1 (Weeks 5-8) 🔵
- Advanced ICP scoring
- List builder optimization
- Export format expansion
- Usage dashboard

### Phase 2 (Weeks 9-12) ⚪
- Outreach coach agent
- A/B testing for messaging
- Advanced analytics
- White-label branding

### Phase 3 (Months 4-6) ⚪
- Multi-region deployment
- Self-service agency portal
- Marketplace (agency directory)

---

## Support

### Documentation
- **Full Docs:** [000-docs/000-INDEX.md](000-docs/000-INDEX.md)
- **Deployment:** [000-docs/006-OD-CICD-deployment-guide.md](000-docs/006-OD-CICD-deployment-guide.md)
- **Architecture:** [000-docs/002-AT-ARCH-system-architecture.md](000-docs/002-AT-ARCH-system-architecture.md)

### Issues
For bugs or feature requests, open a GitHub issue.

---

## License

Proprietary. All rights reserved.

---

## Project Structure

```
pipelinepilot/
├── 000-docs/                    # Documentation (filing system v2.0)
│   ├── 000-INDEX.md
│   ├── 001-PP-PROD-pipelinepilot-prd.md
│   ├── 002-AT-ARCH-system-architecture.md
│   ├── 006-OD-CICD-deployment-guide.md
│   └── 007-PP-LEAS-leasing-model.md
│
├── agents/                      # Vertex AI agent configs
│   ├── orchestrator.yaml
│   ├── icp_scorer.yaml
│   └── list_builder.yaml
│
├── schemas/                     # JSON Schemas
│   ├── lease_contract.schema.json
│   ├── usage_event.schema.json
│   └── billing_invoice.schema.json
│
├── src/                         # Source code (TypeScript)
│   ├── server.ts               # Express server
│   ├── tenants.ts              # Tenant management
│   ├── usage.ts                # Usage tracking
│   ├── billing.ts              # Billing engine
│   ├── providers.ts            # Provider proxies
│   ├── exports.ts              # Export generation
│   └── utils/
│       ├── firestore.ts
│       ├── storage.ts
│       └── gsm.ts
│
├── .github/workflows/           # CI/CD
│   └── ci-deploy.yml
│
├── package.json
├── tsconfig.json
├── Dockerfile
├── .env.example
├── CLAUDE.md
└── README.md
```

---

**Last Updated:** 2025-10-31
**Version:** 0.2.0
**Status:** MVP Ready
