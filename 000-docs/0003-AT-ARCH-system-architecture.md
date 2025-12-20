# System Architecture: PipelinePilot

**Document ID:** 002-AT-ARCH-system-architecture
**Created:** 2025-10-31
**Status:** Draft v0.2

---

## Architecture Overview

PipelinePilot is a **Vertex-native, multi-tenant SDR orchestration platform** built entirely on Google Cloud Platform.

### Core Principles

1. **Vertex-Only AI** - Gemini models via Vertex AI Agent Engine only
2. **Storage Isolation** - Firestore + Vertex AI Storage (no external DBs)
3. **Tenant Isolation** - Data partitioned by tenant ID at every layer
4. **Contracts-First** - JSON Schemas define all data structures
5. **Deterministic Exports** - Stable CSV field ordering for handoff

---

## System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    AGENCY / CLIENT                          │
│                      (HTTP/HTTPS)                           │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│              Cloud Run (Tools API)                          │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐  │
│  │ Tenants  │  Usage   │ Billing  │Providers │ Exports  │  │
│  │ Router   │  Router  │  Router  │  Router  │  Router  │  │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘  │
└────────┬──────────────────────────────────────┬─────────────┘
         │                                      │
         ▼                                      ▼
┌──────────────────────────┐       ┌──────────────────────────┐
│  Firestore               │       │  Vertex AI Agents        │
│  ├─ tenants/             │       │  ├─ Orchestrator         │
│  ├─ usage/               │       │  ├─ ICP Scorer           │
│  ├─ billing/             │       │  └─ List Builder         │
│  └─ enrichment/          │       └──────────┬───────────────┘
└──────────┬───────────────┘                  │
           │                                  │
           ▼                                  ▼
┌──────────────────────────┐       ┌──────────────────────────┐
│  Google Secret Manager   │       │  Vertex AI Storage (GCS) │
│  (Provider API Keys)     │       │  (Exports, Results)      │
└──────────────────────────┘       └──────────────────────────┘
           │                                  │
           ▼                                  ▼
┌─────────────────────────────────────────────────────────────┐
│              External Providers                             │
│  ┌────────┬─────────┬──────────┬─────────┬────────────┐    │
│  │  Clay  │ Apollo  │ Clearbit │ HubSpot │   Hunter   │    │
│  └────────┴─────────┴──────────┴─────────┴────────────┘    │
└─────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│                     Stripe (Billing)                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Components

### 1. Cloud Run (Tools API)

**Purpose:** RESTful API for tenant management, usage tracking, billing, provider proxies, and exports.

**Endpoints:**
- `POST /tenants` - Create tenant lease contract
- `POST /usage` - Record usage events
- `POST /billing/run-monthly` - Generate invoices
- `POST /providers/:tenant/:provider/*` - Proxy to external APIs
- `GET /exports/:tenant/leads.csv` - Generate exports

**Tech Stack:**
- Express.js (Node.js 20)
- TypeScript
- Zod (schema validation)
- Axios (HTTP client)

**Scaling:**
- Cloud Run auto-scaling (0-100 instances)
- Concurrency: 80 requests/instance
- Memory: 512MB per instance

---

### 2. Vertex AI Agent Engine

**Purpose:** AI agents that route SDR tasks, score leads, and build lists.

**Agents:**

#### Orchestrator (`orchestrator.yaml`)
- Routes tasks to provider endpoints
- Aggregates results from multiple providers
- Provides recommendations for next steps
- Model: Gemini 2.5 Flash

#### ICP Scorer (`icp_scorer.yaml`)
- Scores leads 0-100 against ICP criteria
- Categorizes as hot/warm/cold
- Suggests qualification questions
- Model: Gemini 2.5 Flash

#### List Builder (`list_builder.yaml`)
- Deduplicates across domain/email/company
- Prioritizes by ICP score
- Groups by persona/segment
- Model: Gemini 2.5 Flash

**Deployment:**
```bash
adk deploy agent_engine \
  --project=${GCP_PROJECT_ID} \
  --region=${GCP_REGION} \
  --staging_bucket=${VERTEX_STORAGE_BUCKET} \
  agents/orchestrator.yaml
```

---

### 3. Firestore (Multi-Tenant Database)

**Collections:**

```
tenants/
  {tenantId}/                  # Lease contract
    seats/
      {userId}/                # User licenses
    providerKeys/
      {provider}/              # GSM secret refs

usage/
  {tenantId}/
    events/
      {eventId}/               # Usage events

billing/
  {tenantId}/
    invoices/
      {invoiceId}/             # Monthly invoices

enrichment/
  {enrichmentId}/              # Provider results
```

**Indexes:**
- `usage/{tenantId}/events` on `ts` (for date range queries)
- `tenants` on `status` (for active tenant queries)

**Security:**
- Firestore Rules enforce tenant isolation
- Service account with `datastore.user` role

---

### 4. Vertex AI Storage (Cloud Storage)

**Purpose:** Store exports (CSV/JSON) and large result sets.

**Bucket Structure:**
```
vertex-ai-staging-{project}/
  exports/
    {tenantId}/
      leads_1234567890.csv
      enrichment_1234567890.json
  agent_staging/
    orchestrator/
    icp_scorer/
    list_builder/
```

**Access:**
- Signed URLs (read-only, 1-24 hour expiry)
- Service account with `storage.objectViewer` role

---

### 5. Google Secret Manager

**Purpose:** Store provider API keys securely, referenced per-tenant.

**Secret Naming:**
- Global: `clay-api-key`, `apollo-api-key`, etc.
- Tenant-specific: `tenant-{tenantId}-clay-key`

**Access Pattern:**
1. Tenant doc in Firestore stores GSM reference
2. Tools API fetches secret at runtime
3. API call proxied to provider

---

### 6. Provider Integrations

#### Clay
- **Endpoint:** `/providers/:tenant/clay/enrich`
- **Use Case:** Company/person enrichment, list expansion
- **Auth:** Bearer token in header

#### Apollo
- **Endpoint:** `/providers/:tenant/apollo/search`
- **Use Case:** People/company search by ICP criteria
- **Auth:** API key in header

#### Clearbit
- **Endpoint:** `/providers/:tenant/clearbit/enrich`
- **Use Case:** Firmographics enrichment
- **Auth:** Bearer token in header

#### HubSpot
- **Endpoint:** `/providers/:tenant/hubspot/upsert`
- **Use Case:** CRM contact upsert for handoff
- **Auth:** Private app token

#### Hunter
- **Endpoint:** `/providers/:tenant/hunter/verify`
- **Use Case:** Email deliverability verification
- **Auth:** API key in query param

---

### 7. Stripe (Billing)

**Integration:**
- Create invoices via Stripe API
- Webhook for payment events
- Store `stripeCustomerId` in tenant doc
- Store `stripeInvoiceId` in invoice doc

**Webhook Events:**
- `invoice.paid` → Update Firestore invoice status
- `invoice.payment_failed` → Flag tenant for follow-up

---

## Data Flow

### 1. Tenant Onboarding
```
Agency → POST /tenants
  → Create Firestore doc (tenants/{tenantId})
  → Create Stripe customer
  → Return tenantId + lease contract
```

### 2. Provider Call
```
Client → POST /providers/{tenant}/clay/enrich
  → Fetch GSM secret ref from Firestore
  → Fetch API key from GSM
  → Call Clay API
  → Store result in Firestore (enrichment/)
  → Record usage event (usage/{tenant}/events/)
  → Return enriched data
```

### 3. Monthly Billing
```
Cloud Scheduler → POST /billing/run-monthly
  → Query all active tenants
  → For each tenant:
    → Count seats
    → Aggregate usage events
    → Calculate commission (meetings or sourced_mrr)
    → Create Firestore invoice
    → Create Stripe invoice
    → Send to customer
```

### 4. Export Generation
```
Client → POST /exports/{tenant}/generate
  → Query Firestore (enrichment, usage, etc.)
  → Generate CSV/JSON
  → Upload to Vertex AI Storage
  → Generate signed URL (24h expiry)
  → Record export usage event
  → Return signed URL
```

---

## Security Architecture

### Tenant Isolation
- **Data:** Firestore collections partitioned by `tenantId`
- **Secrets:** GSM references stored per-tenant
- **Auth:** Bearer tokens identify tenant in requests

### Principle of Least Privilege
- Cloud Run service account: `run.invoker`, `datastore.user`, `secretmanager.secretAccessor`
- Vertex agents: `aiplatform.user`, `storage.objectViewer`
- No admin roles in production

### Secrets Management
- **NEVER** store plaintext API keys in Firestore
- **ALWAYS** use GSM references
- Rotate secrets via GSM versioning

---

## Performance & Scaling

### Cloud Run
- **Auto-scaling:** 0-100 instances
- **Cold start:** <2s with image caching
- **Concurrency:** 80 requests/instance
- **Memory:** 512MB (adjust for heavy workloads)

### Firestore
- **Reads:** 1M/day free, $0.06/100k after
- **Writes:** 1M/day free, $0.18/100k after
- **Indexing:** Composite indexes for date range queries

### Vertex AI Agents
- **Invocation:** ~3-5s for Gemini 2.5 Flash
- **Rate limits:** 60 RPM per project (increase via quota request)
- **Cost:** $0.25/1M input tokens, $1.00/1M output tokens

---

## Cost Estimates (100 tenants, 10k API calls/month each)

| Component | Monthly Cost |
|-----------|--------------|
| Cloud Run | ~$50 |
| Firestore | ~$25 |
| Vertex AI Agents | ~$200 |
| Cloud Storage | ~$5 |
| Secret Manager | ~$5 |
| **Total** | **~$285** |

**Revenue:** 100 tenants × $499 avg = $49,900/mo
**Gross Margin:** ~99.4%

---

## Monitoring & Observability

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

## Disaster Recovery

### Backup Strategy
- **Firestore:** Daily automated backups (Cloud Firestore export)
- **Secrets:** GSM auto-versioning
- **Code:** GitHub (source of truth)

### Recovery Time Objective (RTO)
- **Critical (API down):** <1 hour
- **Non-critical (billing delayed):** <24 hours

### Recovery Point Objective (RPO)
- **Data loss tolerance:** <1 hour (Firestore replication)

---

## Appendix

- **API Reference:** [003-DR-APIM-api-reference.md](./003-DR-APIM-api-reference.md)
- **Deployment Guide:** [006-OD-CICD-deployment-guide.md](./006-OD-CICD-deployment-guide.md)
- **JSON Schemas:** [004-DR-SCHM-json-schemas.md](./004-DR-SCHM-json-schemas.md)

---

**Document Status:** Draft
**Next Review:** 2025-11-07
