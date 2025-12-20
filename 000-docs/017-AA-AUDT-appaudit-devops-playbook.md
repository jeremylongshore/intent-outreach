# PipelinePilot: Operator-Grade System Analysis & Operations Guide
*For: DevOps Engineer*
*Generated: 2025-11-23*
*System Version: 3cd403a0*

---

## Table of Contents
1. Executive Summary
2. Operator & Customer Journey
3. System Architecture Overview
4. Directory Deep-Dive
5. Automation & Agent Surfaces
6. Operational Reference
7. Security, Compliance & Access
8. Cost & Performance
9. Development Workflow
10. Dependencies & Supply Chain
11. Integration with Existing Documentation
12. Current State Assessment
13. Quick Reference
14. Recommendations Roadmap

---

## 1. Executive Summary

### Business Purpose

PipelinePilot is an **ADK-based SDR (Sales Development Representative) orchestration system** built on Vertex AI Agent Engine that automates lead generation and enrichment workflows. The platform coordinates specialist AI agents to research companies, enrich contact data, and generate personalized outreach recommendations, all while adhering to a **Bring-Your-Own-Keys (BYO)** model for third-party data providers.

The system is currently in **production deployment** with a functional MVP that includes a Firebase-powered dashboard, four deployed ADK agents on Vertex AI, and integrations with major data providers (Clay, Apollo, Clearbit, Crunchbase). The architecture prioritizes **safety by design** - no web scraping, no ToS violations, and no direct email sending - focusing instead on orchestrated API calls and recommendation generation.

**Current operational status** shows the system running in a single production environment with automated CI/CD via GitHub Actions. The platform uses a **serverless architecture** leveraging Firebase Functions for the API layer, Firestore for data persistence, and Vertex AI Agent Engine for agent orchestration. This eliminates traditional server management overhead while maintaining scalability.

**Strategic positioning** aligns with Intent Solutions' Private AI and AI Agents offerings, demonstrating production-ready agent orchestration capabilities that can be replicated across customer implementations. The BYO keys model reduces liability while enabling enterprise customers to leverage their existing data provider relationships.

### Operational Status Matrix
| Environment | Status | Uptime Target | Current Uptime | Release Cadence | Active Users |
|-------------|--------|---------------|----------------|-----------------|--------------|
| Production  | ✅ Active | 99.5% | Not tracked | On push to main | Beta testing |
| Staging     | ⚠️ Uses prod | N/A | N/A | N/A | N/A |
| Development | ✅ Local only | N/A | N/A | Continuous | 1-3 devs |

### Technology Stack Summary
| Category | Technology | Version | Purpose |
|----------|------------|---------|---------|
| Language | Python/TypeScript | 3.12/ES2022 | Agents/Dashboard |
| Framework | Google ADK/Next.js | 1.0/14.x | Agent orchestration/Web UI |
| Database | Firestore | Native mode | Campaign data, logs |
| Cloud Platform | Google Cloud Platform | - | All infrastructure |
| CI/CD | GitHub Actions | v4 | Automated deployment |
| AI/ML | Vertex AI/Gemini 2.0 | Latest | Agent reasoning |

---

## 2. Operator & Customer Journey

### Primary Personas
- **Operators**: DevOps engineers, SREs managing the platform infrastructure and deployments
- **External Customers**: Sales teams, SDR managers using the dashboard to run campaigns
- **Reseller Partners**: Intent Solutions partners white-labeling the SDR orchestration
- **Automation Bots**: GitHub Actions, ADK deployment scripts, monitoring systems

### End-to-End Journey Map
```
Awareness → Onboarding → Core Workflows → Support/Feedback → Renewal

1. Awareness
   - Customer discovers via Intent Solutions offerings
   - Views demo at dashboard.pipelinepilot.com
   - Reviews agent capabilities documentation

2. Onboarding
   - Tenant creation via Firebase Functions
   - API key configuration in Secret Manager
   - Initial campaign setup guidance

3. Core Workflows
   - Campaign creation via dashboard
   - Agent orchestration (Research → Enrich → Outreach)
   - Results review and export

4. Support/Feedback
   - GitHub Issues for bug reports
   - Documentation in 000-docs/
   - Direct engineering support (Phase 1)

5. Renewal
   - Usage-based action counting
   - Stripe billing integration (Phase 2)
   - Performance metrics review
```

### SLA Commitments
| Metric | Target | Current | Owner |
|--------|--------|---------|-------|
| Uptime | 99.5% | Not measured | DevOps |
| Response Time | < 5s | ~3s (agent calls) | Engineering |
| Resolution Time | 48 hours | Same day | Engineering |
| CSAT | > 85% | Not measured | Product |

---

## 3. System Architecture Overview

### Technology Stack (Detailed)
| Layer | Technology | Version | Source of Truth | Purpose | Owner |
|-------|------------|---------|-----------------|---------|-------|
| Frontend/UI | Next.js | 14.x | `dashboard/` | Beta dashboard | Frontend |
| Backend/API | Firebase Functions | Node 20 | `functions/src/` | Campaign triggers | Backend |
| Database | Firestore | Native | GCP Console | Campaign data | Backend |
| Caching | None | - | - | Not implemented | - |
| Queue/Messaging | Pub/Sub | - | Via ADK | Agent communication | Platform |
| Infrastructure | Terraform | 1.5+ | `tf-pipeline/` | IaC templates | DevOps |
| Observability | Cloud Logging | - | GCP Console | Logs only | DevOps |
| Security | Secret Manager | - | GCP Console | API keys | Security |
| AI/ML | Vertex AI | Latest | Agent Engine | Agent runtime | ML Eng |

### Environment Matrix
| Environment | Purpose | Hosting | Data Source | Release Cadence | IaC Source | Notes |
|-------------|---------|---------|-------------|-----------------|------------|-------|
| local | Development | Laptop | Mock/test | Continuous | None | npm run demo |
| dev | Agent testing | Vertex AI | Firestore dev | On demand | Manual | Separate project |
| staging | Pre-prod | N/A | N/A | N/A | N/A | Not implemented |
| prod | Production | GCP | Firestore prod | Push to main | GitHub Actions | Auto-deploy |

### Cloud & Platform Services
| Service | Purpose | Environment(s) | Key Config | Cost/Limits | Owner | Vendor Risk |
|---------|---------|----------------|------------|-------------|-------|-------------|
| Vertex AI Agent Engine | Agent runtime | prod | us-central1 | $0.01/query | Platform | Low - Google native |
| Firebase Functions | API layer | prod | Node 20, 512MB | Free tier | Backend | Low |
| Firestore | Data persistence | prod | Native mode | Free tier | Backend | Low |
| Secret Manager | API keys | prod | Auto-replication | Minimal | Security | Low |
| Cloud Storage | Agent staging | prod | vertex-staging bucket | < $1/mo | Platform | Low |
| GitHub Actions | CI/CD | - | WIF auth | Free | DevOps | Medium - external |

### Architecture Diagram
```
┌─────────────────────────────────────────────────────────────┐
│                      External Services                       │
│  Clay API │ Apollo API │ Clearbit API │ Crunchbase API      │
└─────────────┬───────────────────┬───────────────────────────┘
              │                   │
              │    BYO Keys via   │
              │  Secret Manager   │
              ▼                   ▼
┌─────────────────────────────────────────────────────────────┐
│                    Vertex AI Agent Engine                    │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Orchestrator Agent (Primary)                │  │
│  │  - Coordinates workflow: Research→Enrich→Outreach     │  │
│  │  - Has all 4 FunctionTools directly attached          │  │
│  │  - Returns structured JSON responses                  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐  │
│  │  Research   │ │   Enrich    │ │     Outreach        │  │
│  │   (Unused)  │ │  (Unused)   │ │     (Unused)        │  │
│  └─────────────┘ └─────────────┘ └─────────────────────┘  │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         │ HTTPS API
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Firebase Functions                         │
│  startCampaign() - Triggers orchestrator via REST API       │
│  createTenantForUser() - Provisions new workspace           │
│  stripeWebhook() - Handles billing events                   │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                      Firestore                               │
│  /campaigns/{id}/logs - Execution history                   │
│  /tenants/{id} - Workspace configuration                    │
│  /users/{uid} - User profiles                               │
└───────────────────────────────────────────────────────────────┘
                         ▲
                         │
┌─────────────────────────────────────────────────────────────┐
│                  Dashboard (Next.js)                         │
│  Firebase Hosting: dashboard.pipelinepilot.com              │
│  - Campaign creation and monitoring                         │
│  - API key configuration                                    │
│  - Results export                                           │
└───────────────────────────────────────────────────────────────┘
```

---

## 4. Directory Deep-Dive

### Project Structure Analysis
```
pipelinepilot/
├── 000-docs/                    # Comprehensive documentation (17 docs)
│   ├── 000-INDEX.md            # Master documentation index
│   ├── 011-DR-REFF-quick-reference.md  # Operational quick ref
│   └── 6767-PP-SOP-*.md       # Standard operating procedures
│
├── .github/workflows/           # CI/CD pipelines
│   ├── adk-guard.yml           # Agent compliance checks
│   ├── arv-gate.yml            # Agent Review Verification
│   ├── ci-deploy.yml           # Main deployment pipeline
│   └── policy.yml              # Policy enforcement
│
├── src/                         # Python agent source code
│   ├── agents/                 # ADK agent implementations
│   │   ├── orchestrator.py    # Main orchestrator agent
│   │   ├── research.py        # Research agent (placeholder)
│   │   ├── enrich.py          # Enrich agent (placeholder)
│   │   ├── outreach.py        # Outreach agent (placeholder)
│   │   └── tools.py           # FunctionTool wrappers
│   │
│   ├── deploy_orchestrator.py  # Deployment script
│   └── orchestrator_wrapper.py # Query interface wrapper
│
├── pipelinepilot-dashboard/    # Firebase dashboard
│   ├── dashboard/              # Next.js frontend
│   │   ├── pages/             # UI routes
│   │   ├── components/        # React components
│   │   └── lib/               # Firebase clients
│   │
│   ├── functions/              # Firebase Functions
│   │   ├── src/               # TypeScript source
│   │   └── lib/               # Compiled JavaScript
│   │
│   └── firebase.json          # Firebase config
│
├── tf-pipeline/                # Terraform infrastructure
│   ├── main.tf                # Core resources
│   ├── variables.tf           # Configuration
│   └── outputs.tf             # Output values
│
├── scripts/                    # Operational scripts
│   ├── bootstrap-gcp.sh       # Initial GCP setup
│   ├── smoke_orchestrator.py  # Integration tests
│   └── validate_arv.mjs       # ARV compliance
│
├── package.json               # Node.js dependencies
├── requirements.txt           # Python dependencies
└── README.md                  # Project overview
```

### Detailed Directory Analysis

#### src/agents/
**Purpose**: Core ADK agent implementations using Google's Agent Development Kit
**Key Files**:
- `orchestrator.py:15-73` - Main orchestrator with all tools attached
- `tools.py` - FunctionTool wrappers for Clay, Apollo, Clearbit, Crunchbase
**Patterns**: Single orchestrator pattern (avoids multi-agent complexity)
**Entry Points**: `create_orchestrator_agent()` factory function
**Authentication**: Service account via Application Default Credentials
**Data Layer**: Direct API calls to external providers
**Integrations**: 4 active (Clay, Apollo, Clearbit, Crunchbase), 2 placeholders
**Code Quality**: Clean separation of tools from agent logic, proper error handling

#### pipelinepilot-dashboard/functions/
**Purpose**: Firebase Functions providing REST API for dashboard
**Key Files**:
- `src/index.ts:14-39` - startCampaign endpoint
- `src/createTenantForUser.ts` - Tenant provisioning
- `src/stripeWebhook.ts` - Billing integration
**Framework**: Firebase Functions Gen2, Node.js 20
**Patterns**: Request/response handlers, async/await
**Authentication**: Firebase Auth + custom claims
**Error Handling**: Try/catch with structured error responses
**Deployment**: Auto-deploy via GitHub Actions on main branch

#### tf-pipeline/
**Tools**: Terraform 1.5+, Google/Google-Beta providers
**Network**: Default VPC, no custom networking
**Identity**: Service account with minimal required roles
**Secrets**: Secret Manager with auto-replication
**Compute**: Serverless only (Functions, Agent Engine)
**Data Stores**: Firestore Native mode, Cloud Storage for staging
**Observability**: Cloud Logging only, no custom metrics
**State Management**: Local state (remote backend commented out)
**Change Process**: Manual apply, no automation yet

#### .github/workflows/
**CI/CD Pipeline**: Multi-stage with parallel jobs
- `adk-guard.yml` - Pre-merge agent validation
- `arv-gate.yml` - Agent structure verification
- `ci-deploy.yml` - Main deploy (Cloud Run + Agents)
- `policy.yml` - Vertex-only enforcement

**Security**: Workload Identity Federation for keyless auth
**Testing**: Type checking, ARV validation, smoke tests
**Deployment**: Automatic on push to main branch

---

## 5. Automation & Agent Surfaces

### ADK Agents Deployed
| Agent | Purpose | Status | Tools Attached | Model |
|-------|---------|--------|----------------|-------|
| orchestrator | Main workflow coordinator | ✅ Active | 4 (all tools) | gemini-2.0-flash-exp |
| research | Company research | ⚠️ Placeholder | None | - |
| enrich | Contact enrichment | ⚠️ Placeholder | None | - |
| outreach | Message generation | ⚠️ Placeholder | None | - |

### FunctionTool Connectors
| Connector | Purpose | Status | Auth Method | Rate Limits |
|-----------|---------|--------|-------------|-------------|
| clay_lookup | Company data | ✅ Active | API key | Provider limits |
| apollo_people | Contact search | ✅ Active | API key | Provider limits |
| clearbit_enrich | Person enrichment | ✅ Active | API key | Provider limits |
| crunchbase_company | Funding data | ✅ Active | API key | Provider limits |
| zoominfo | Enterprise data | ⚠️ Placeholder | - | - |
| salesnav | LinkedIn data | ⚠️ Placeholder | - | - |

### Automation Workflows
| Workflow | Trigger | Purpose | Dependencies | Status |
|----------|---------|---------|--------------|--------|
| CI/CD Deploy | Push to main | Deploy all components | GitHub Actions | ✅ Active |
| ARV Gate | PR with agent changes | Validate agent structure | Python 3.12 | ✅ Active |
| ADK Guard | PR to main | Agent compliance | ADK SDK | ✅ Active |
| Vertex Purity | All builds | Ensure Vertex-only | grep patterns | ✅ Active |

---

## 6. Operational Reference

### Deployment Workflows

#### Local Development
1. **Prerequisites**:
   - Node.js 20+
   - Python 3.12+
   - gcloud CLI authenticated
   - ADK installed: `pip install google-agent-sdk`

2. **Environment Setup**:
   ```bash
   # Clone repository
   git clone https://github.com/jeremylongshore/pipelinepilot.git
   cd pipelinepilot

   # Install dependencies
   npm install
   pip install -r requirements.txt

   # Set GCP project
   export PROJECT_ID=pipelinepilot-prod
   gcloud config set project $PROJECT_ID
   ```

3. **Service Startup**:
   ```bash
   # Validate agents
   npm run arv

   # Run local demo
   npm run demo

   # Start dashboard locally
   cd pipelinepilot-dashboard/dashboard
   npm run dev
   ```

4. **Verification**:
   - ARV output shows 5 passed checks
   - Demo generates output files
   - Dashboard accessible at localhost:3000

#### Production Deployment
**Pre-deployment Checklist**:
- [x] All tests passing locally
- [x] ARV validation successful
- [x] No secrets in code
- [x] Version bump if needed

**Execution**:
```bash
# All deployments via GitHub Actions
git add -A
git commit -m "feat: your change description"
git push origin main

# Monitor at: https://github.com/jeremylongshore/pipelinepilot/actions
```

**Post-deployment Verification**:
1. Check GitHub Actions success
2. Verify agents deployed: `gcloud ai models list --region=us-central1`
3. Test orchestrator: `curl -X POST [function-url]/startCampaign`
4. Check Firestore for logs

**Rollback Protocol**:
```bash
# Revert to previous commit
git revert HEAD
git push origin main

# Or redeploy previous version manually
git checkout [previous-commit]
./scripts/deploy_agents.sh
```

### Monitoring & Alerting
**Dashboards**:
- GCP Console: https://console.cloud.google.com/home/dashboard?project=pipelinepilot-prod
- GitHub Actions: https://github.com/jeremylongshore/pipelinepilot/actions
- Firebase Console: https://console.firebase.google.com/project/pipelinepilot-prod

**Logging**:
```bash
# View Function logs
gcloud functions logs read --limit=50

# View agent logs
gcloud logging read "resource.type=aiplatform.googleapis.com/Endpoint" --limit=20

# Stream logs
gcloud logging tail "resource.type=cloud_function"
```

**Metrics**: Currently minimal - only basic GCP metrics available

### Incident Response
| Severity | Definition | Response Time | Actions | Communication |
|----------|------------|---------------|---------|---------------|
| P0 | Complete outage | Immediate | Rollback, escalate | Slack + email |
| P1 | Agent failures | 15 min | Debug, redeploy | Slack notification |
| P2 | Partial degradation | 1 hour | Investigate, fix | GitHub issue |
| P3 | Minor issues | Next day | Track, plan fix | Documentation |

### Backup & Recovery
**Current State**:
- Code: Git/GitHub (full history)
- Firestore: No automated backups configured
- Secrets: Manual management only
- Agent definitions: In source control

**Recovery Procedures**:
1. Code: `git clone` from GitHub
2. Infrastructure: `terraform apply` from tf-pipeline/
3. Agents: `./scripts/deploy_agents.sh`
4. Secrets: Recreate in Secret Manager

---

## 7. Security, Compliance & Access

### Identity & Access Management
| Account/Role | Purpose | Permissions | Provisioning | MFA | Used By |
|--------------|---------|-------------|--------------|-----|---------|
| pipelinepilot-core@*.iam | Service account | aiplatform.user, secretmanager.secretAccessor | Terraform | N/A | Functions, Agents |
| github-actions@*.iam | CI/CD | Deploy permissions | WIF | N/A | GitHub Actions |
| developers | Development | Editor role | Manual | Required | Engineering team |

### Secrets Management
**Storage**: Google Secret Manager
**Rotation**: Manual only (no automation)
**Access**: Service account + specific secret grants
**Break-glass**: Project Owner can access all secrets

**Current Secrets**:
- `ORCHESTRATOR_DEV_ID` - Agent engine ID
- `CLAY_API_KEY` - Clay API access
- `APOLLO_API_KEY` - Apollo.io access
- `CLEARBIT_API_KEY` - Clearbit access
- `CRUNCHBASE_API_KEY` - Crunchbase access

### Security Posture
**Authentication**:
- Dashboard: Firebase Auth (Google SSO)
- APIs: Service account credentials
- CI/CD: Workload Identity Federation

**Authorization**:
- IAM roles for GCP resources
- Firebase security rules for Firestore
- Function-level auth checks

**Encryption**:
- In-transit: HTTPS everywhere
- At-rest: GCP default encryption
- Secrets: Secret Manager encryption

**Network Security**:
- No custom VPC configuration
- Default firewall rules
- Public endpoints (Functions, Dashboard)

**Known Issues**:
- No automated secret rotation
- Limited audit logging
- No DDoS protection beyond GCP defaults
- Dashboard currently allows unauthenticated access

---

## 8. Cost & Performance

### Current Costs
**Monthly Cloud Spend**: ~$5-10 (estimated)
- Compute: $2 (Firebase Functions)
- Storage: $1 (Firestore, Cloud Storage)
- Networking: $1 (Egress)
- Vertex AI: $3 (Agent queries)
- Secret Manager: < $1
- Observability: Free tier

### Performance Baseline
**Latency**:
- Dashboard load: ~2s
- Agent query: 3-5s (P50)
- Function cold start: 1-2s

**Throughput**:
- Agent queries: ~100/day capacity
- Function invocations: 1000/day limit
- Firestore operations: 50k/day free tier

**Business Metrics**:
- Actions per campaign: 4-10 average
- Cost per action: ~$0.001 (Vertex AI only)

### Optimization Opportunities
1. **Implement caching** → Est. 50% latency reduction for repeat queries
2. **Batch agent calls** → Est. 30% cost reduction
3. **Add CDN for dashboard** → Est. 1s faster page loads
4. **Optimize agent prompts** → Est. 20% token reduction

---

## 9. Development Workflow

### Local Development
**Standard Environment**:
- macOS/Linux (Windows via WSL2)
- VS Code with Python/TypeScript extensions
- Node.js 20+, Python 3.12+
- Docker for testing (optional)

**Bootstrap**:
```bash
# One-time setup
./scripts/bootstrap-gcp.sh

# Install all dependencies
npm install
cd pipelinepilot-dashboard && npm install
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your values
```

**Common Tasks**:
```bash
# Create feature branch
git checkout -b feature/your-feature

# Run tests
npm run arv          # Validate agents
npm run typecheck    # TypeScript check
npm run demo         # Integration test

# Commit with conventional commits
git commit -m "feat(agents): add new enrichment source"
```

### CI/CD Pipeline
**Platform**: GitHub Actions
**Triggers**:
- Push to main (full deploy)
- PR (validation only)
- Manual dispatch available

**Stages**:
1. **Validate** (2 min)
   - Checkout code
   - Install dependencies
   - Run ARV checks
   - TypeScript compilation

2. **Deploy** (5 min)
   - Authenticate to GCP (WIF)
   - Deploy Functions
   - Deploy Agents
   - Verify deployment

**Artifacts**:
- Build logs in GitHub
- Deployed functions in Firebase
- Agent versions in Vertex AI

### Code Quality
**Linting**:
- TypeScript: Built-in strict mode
- Python: No linter configured (gap)

**Testing**:
- ARV validation (agent structure)
- Demo smoke test
- No unit tests (gap)
- No integration tests (gap)

**Review Process**:
- PR required for main branch
- ARV gate must pass
- Manual review recommended

---

## 10. Dependencies & Supply Chain

### Direct Dependencies

**Node.js/npm** (`package.json`):
```json
{
  "dependencies": {
    "ajv": "^8.17.1",         // JSON schema validation
    "ajv-formats": "^3.0.1",  // Additional formats
    "yaml": "^2.6.1"          // YAML parsing
  },
  "devDependencies": {
    "typescript": "^5.7.2",   // TypeScript compiler
    "tsx": "^4.19.2",         // TS execution
    "@types/node": "^22.10.2" // Node types
  }
}
```

**Python** (`requirements.txt` implied):
```
google-agent-sdk>=1.0.0     # ADK framework
google-cloud-aiplatform      # Vertex AI
google-genai                 # Generative AI
cloudpickle                  # Serialization
```

**Dashboard** (`pipelinepilot-dashboard/package.json`):
```
next: 14.x                   # React framework
firebase: 10.x               # Firebase SDK
firebase-admin: 12.x         # Admin SDK
react: 18.x                  # UI library
```

### Third-Party Services
| Service | Purpose | Data Shared | Auth | SLA | Renewal | Owner |
|---------|---------|-------------|------|-----|---------|-------|
| Clay | Company data | Domain names | API key | 99.9% | Monthly | Customer |
| Apollo | Contact search | Email domains | API key | 99.9% | Monthly | Customer |
| Clearbit | Enrichment | Emails | API key | 99.95% | Annual | Customer |
| Crunchbase | Funding data | Company names | API key | 99.5% | Annual | Customer |
| GitHub | Code, CI/CD | Full source | OAuth | 99.95% | Free tier | Platform |
| Stripe | Billing (Phase 2) | Payment data | Secret key | 99.99% | Usage-based | Platform |

---

## 11. Integration with Existing Documentation

### Documentation Inventory
- **README.md**: ✅ Comprehensive, updated 2025-10-31
- **CLAUDE.md**: ✅ AI assistance guidelines present
- **Quick Reference**: ✅ `011-DR-REFF-quick-reference.md`
- **Runbooks**: ⚠️ Embedded in quick reference only
- **ADRs**: ❌ No formal ADRs found
- **SOPs**: ✅ Multiple in 6767-PP-SOP-* series

### Key Documentation Files
1. `000-INDEX.md` - Master documentation index
2. `011-DR-REFF-quick-reference.md` - Operational commands
3. `6767-PP-SOP-Functions-ESM-Orchestrator-Query.md` - Latest SOP
4. `016-AA-RETRO-orchestration-fix-aar.md` - Recent fixes

### Discrepancies Found
- Documentation references 4 agents but only orchestrator is active
- Some scripts in scripts/ are not documented
- Terraform configuration exists but not actively used
- Dashboard deployment process not fully documented

### Recommended Reading Order
1. **README.md** - Start here for system overview
2. **011-DR-REFF-quick-reference.md** - For daily operations
3. **016-AA-RETRO-orchestration-fix-aar.md** - Understanding recent architecture decisions
4. **6767-PP-SOP-Functions-ESM-Orchestrator-Query.md** - Current operational procedures

---

## 12. Current State Assessment

### What's Working Well
✅ **Automated deployment pipeline** - Push to main deploys everything automatically via GitHub Actions
✅ **Clean agent architecture** - Single orchestrator pattern avoids multi-agent complexity
✅ **BYO keys model** - Reduces liability and enables enterprise adoption
✅ **Comprehensive documentation** - 17+ detailed docs covering all aspects
✅ **Security fundamentals** - WIF for CI/CD, Secret Manager for keys, service account isolation
✅ **Vertex AI native** - No vendor lock-in to other AI providers

### Areas Needing Attention
⚠️ **No monitoring/alerting** - Only basic Cloud Logging, no proactive alerts or dashboards
⚠️ **Missing staging environment** - Direct deployment to production increases risk
⚠️ **No automated testing** - Beyond ARV validation, no unit or integration tests
⚠️ **Manual secret rotation** - Security risk for long-lived API keys
⚠️ **No backup strategy** - Firestore data has no automated backups
⚠️ **Limited observability** - No APM, tracing, or detailed metrics

### Immediate Priorities
1. **[High]** – Set up Firestore automated backups • Impact: Data loss prevention • Action: Configure daily exports • Owner: DevOps
2. **[High]** – Add monitoring alerts • Impact: Incident detection • Action: Cloud Monitoring alerts for failures • Owner: DevOps
3. **[Medium]** – Implement staging environment • Impact: Safer deployments • Action: Create staging project • Owner: Platform
4. **[Medium]** – Add integration tests • Impact: Quality assurance • Action: Test suite for agent calls • Owner: Engineering
5. **[Low]** – Document Terraform usage • Impact: IaC adoption • Action: Update tf-pipeline/ docs • Owner: DevOps

---

## 13. Quick Reference

### Operational Command Map
| Capability | Command/Tool | Source | Notes | Owner |
|------------|--------------|--------|-------|-------|
| Local validation | `npm run arv` | package.json | Validates agent structure | Dev |
| Run demo | `npm run demo` | package.json | Tests full flow locally | Dev |
| Deploy agents | `git push origin main` | GitHub Actions | Auto-deploys all | DevOps |
| View logs | `gcloud functions logs read` | Cloud Logging | Last 50 entries | DevOps |
| Check agents | `gcloud ai models list --region=us-central1` | Vertex AI | List deployed | Platform |
| Add secret | `echo -n "key" \| gcloud secrets versions add NAME --data-file=-` | Secret Manager | Store API keys | Security |
| Emergency rollback | `git revert HEAD && git push` | Git | Redeploys previous | DevOps |

### Critical Endpoints & Resources
- **Production Dashboard**: https://dashboard.pipelinepilot.com
- **GitHub Repository**: https://github.com/jeremylongshore/pipelinepilot
- **GCP Console**: https://console.cloud.google.com/home?project=pipelinepilot-prod
- **Firebase Console**: https://console.firebase.google.com/project/pipelinepilot-prod
- **CI/CD Pipeline**: https://github.com/jeremylongshore/pipelinepilot/actions
- **Vertex AI Agents**: https://console.cloud.google.com/vertex-ai/agents?project=pipelinepilot-prod

### First-Week Checklist
- [ ] Access granted (GitHub repo, GCP project, Firebase)
- [ ] Local environment running (npm run demo works)
- [ ] Understand agent architecture (single orchestrator pattern)
- [ ] Review recent deployments in GitHub Actions
- [ ] Read orchestration AAR (doc #016)
- [ ] Test agent invocation via dashboard
- [ ] Review Secret Manager configuration
- [ ] Join #pipelinepilot Slack channel (if exists)

---

## 14. Recommendations Roadmap

### Week 1 – Critical Setup & Stabilization
**Goals**:
- Implement Firestore backup strategy
- Set up basic monitoring alerts
- Document runbooks for common issues

**Actions**:
1. Configure Firestore daily exports to Cloud Storage
2. Create Cloud Monitoring alert policies for function failures
3. Write runbooks for deployment rollback and agent debugging
4. Set up error notification channel (email/Slack)

**Dependencies**: GCP project access, monitoring API enabled
**Success Metrics**: Backup running, 3+ alerts configured, runbooks documented

### Month 1 – Foundation & Visibility
**Goals**:
- Establish staging environment
- Implement comprehensive logging
- Add integration test suite
- Create operational dashboard

**Actions**:
1. Provision staging GCP project
2. Implement structured logging across all components
3. Write integration tests for agent workflows
4. Build Cloud Monitoring dashboard for key metrics
5. Set up log-based metrics and SLIs
6. Document staging deployment process

**Dependencies**: Budget approval for staging, engineering time
**Success Metrics**: Staging operational, 80%+ code coverage, dashboard live

### Quarter 1 – Strategic Enhancements
**Goals**:
- Implement full observability stack
- Automate secret rotation
- Add performance optimization
- Enable multi-tenancy Phase 2

**Actions**:
1. Deploy Application Performance Monitoring (APM)
2. Implement distributed tracing for agent calls
3. Automate secret rotation with Secret Manager
4. Add caching layer for repeat queries
5. Implement tenant isolation and billing
6. Create SRE playbooks and on-call rotation
7. Performance testing and optimization
8. Security audit and penetration testing

**Dependencies**: Budget for APM tools, security review
**Success Metrics**: <2s P95 latency, 99.5% uptime achieved, 10+ tenants onboarded

### 6-Month Vision
**Target State**:
- Production-grade platform with 99.9% uptime
- Full observability and automated operations
- 50+ active tenants with usage-based billing
- Comprehensive test coverage and CI/CD
- Ready for enterprise customer deployments

**Key Initiatives**:
1. ISO 27001 compliance preparation
2. Multi-region deployment capability
3. Advanced agent orchestration patterns
4. White-label partner program
5. Enterprise SSO and RBAC

---

## Appendices

### Appendix A. Glossary
- **ADK**: Agent Development Kit (Google's framework)
- **ARV**: Agent Review Verification (validation system)
- **BYO**: Bring Your Own (keys model)
- **SDR**: Sales Development Representative
- **WIF**: Workload Identity Federation
- **P0-P3**: Priority/severity levels for incidents
- **SLI/SLO**: Service Level Indicator/Objective

### Appendix B. Reference Links
**Dashboards**:
- GCP Console: https://console.cloud.google.com
- Firebase: https://console.firebase.google.com
- GitHub: https://github.com/jeremylongshore/pipelinepilot

**Documentation**:
- ADK Docs: https://cloud.google.com/vertex-ai/docs/adk
- Vertex AI: https://cloud.google.com/vertex-ai/docs
- Firebase: https://firebase.google.com/docs

**Tools**:
- gcloud CLI: https://cloud.google.com/sdk/gcloud
- ADK Python: https://pypi.org/project/google-agent-sdk/

### Appendix C. Troubleshooting Playbooks

**Agent Deployment Fails**:
```bash
# Check authentication
gcloud auth list

# Verify project
gcloud config get-value project

# Check APIs enabled
gcloud services list --enabled | grep aiplatform

# Check staging bucket
gsutil ls gs://vertex-pipelinepilot-prod-staging/

# Manual deploy attempt
python src/deploy_orchestrator.py
```

**Dashboard Not Loading**:
```bash
# Check Firebase hosting
firebase hosting:sites:list

# Check Functions
gcloud functions list

# View Function logs
gcloud functions logs read startCampaign --limit=50

# Test Function directly
curl -X POST https://[region]-[project].cloudfunctions.net/startCampaign \
  -H "Content-Type: application/json" \
  -d '{"campaignId":"test","icp":"SaaS companies"}'
```

**Secret Access Issues**:
```bash
# List all secrets
gcloud secrets list

# Check secret permissions
gcloud secrets get-iam-policy ORCHESTRATOR_DEV_ID

# Grant access if needed
gcloud secrets add-iam-policy-binding ORCHESTRATOR_DEV_ID \
  --member="serviceAccount:pipelinepilot-core@pipelinepilot-prod.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# Test secret access
gcloud secrets versions access latest --secret="ORCHESTRATOR_DEV_ID"
```

### Appendix D. Change Management

**Release Calendar**:
- Production deploys: On push to main (automated)
- Maintenance windows: None required (serverless)
- Feature freezes: None currently

**Approval Process**:
1. Create feature branch
2. Implement and test locally
3. Open PR with description
4. Pass ARV gate checks
5. Manual review (optional)
6. Merge to main (auto-deploys)

**Rollback Process**:
1. Identify bad commit: `git log --oneline -10`
2. Revert: `git revert [commit-hash]`
3. Push: `git push origin main`
4. Verify in GitHub Actions
5. Test functionality

### Appendix E. Open Questions

1. **Why are research/enrich/outreach agents deployed but unused?**
   - Initial multi-agent design was simplified to single orchestrator
   - Placeholder agents remain for potential future use

2. **Is Terraform configuration being used?**
   - Created but not actively used
   - Manual resource creation currently preferred

3. **What's the plan for staging environment?**
   - Not yet implemented
   - Would require separate GCP project

4. **How are customers being onboarded?**
   - Manual process currently
   - Phase 2 will add self-service

5. **What metrics determine success?**
   - Not formally defined
   - Suggested: Response time, accuracy, cost per action

6. **Is there a disaster recovery plan?**
   - No formal DR plan
   - Relying on Git for code recovery

7. **Who handles on-call?**
   - No formal on-call rotation
   - Engineering team responds ad-hoc

---

**Document Version**: 1.0.0
**Generated**: 2025-11-23
**Next Review**: 2026-02-23
**Classification**: Internal - DevOps Operations

---

## Summary for DevOps Engineer

### System Health Score: 72/100

**Breakdown**:
- Infrastructure: 85/100 (solid foundation, needs monitoring)
- Security: 70/100 (basics covered, rotation needed)
- Operations: 60/100 (manual processes, no staging)
- Observability: 50/100 (minimal logging only)
- Documentation: 90/100 (comprehensive, well-maintained)

### Critical Findings
1. **No automated backups** - Firestore data at risk
2. **No monitoring alerts** - Failures go unnoticed
3. **No staging environment** - Direct production deployments
4. **Manual secret rotation** - Security vulnerability
5. **Limited testing** - Only structural validation

### Immediate Week 1 Actions
1. Set up Firestore daily backups to Cloud Storage
2. Configure Cloud Monitoring alerts for function failures
3. Document emergency procedures and rollback process
4. Review and understand single orchestrator architecture
5. Test end-to-end flow through dashboard

### Your First Commands
```bash
# Set up your environment
gcloud config set project pipelinepilot-prod
gcloud auth application-default login

# Check system status
npm run arv                                    # Validate agents
gcloud functions logs read --limit=20         # Recent logs
gcloud ai models list --region=us-central1    # Deployed agents

# Make your first deployment
git checkout -b fix/add-monitoring
# make changes
npm run arv                                    # Validate
git add -A && git commit -m "fix: add monitoring alerts"
git push origin fix/add-monitoring
# Open PR and merge to auto-deploy
```

### Key Contacts & Resources
- **GitHub**: https://github.com/jeremylongshore/pipelinepilot
- **Dashboard**: https://dashboard.pipelinepilot.com
- **Quick Ref**: 000-docs/011-DR-REFF-quick-reference.md
- **Architecture Decision**: 000-docs/016-AA-RETRO-orchestration-fix-aar.md

Welcome to PipelinePilot! The system is functional but needs operational maturity improvements. Focus on stability and observability first, then move to optimization. The architecture is clean and the documentation is excellent - use them as your foundation.

---

*End of DevOps Playbook*