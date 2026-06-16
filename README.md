# PipelinePilot

**ADK-Based SDR Orchestration with Vertex AI Agent Engine**

Phase 1: Foundation with Research → Enrich → Outreach workflow

---

## Overview

**PipelinePilot** is an agentic SDR orchestrator built on **Vertex AI Agent Engine**. It routes tasks through specialist agents (Research, Enrich, Outreach) and connects to paid data providers via **Bring-Your-Own-Keys (BYO)**.

### Key Principles

1. **Action-First Architecture** - Every connector call or agent invocation is counted as an action
2. **BYO Keys** - Users supply their own API keys for Clay, Apollo, Clearbit, Crunchbase, etc.
3. **ADK Compliance** - All agents use proper YAML schemas, FunctionTool wrappers, and output schemas
4. **Firestore + Vertex Storage Only** - No external databases or storage
5. **Safety by Design** - No crawling, no unofficial scraping, no ToS violations

---

## Architecture

```
Orchestrator Agent
├── Research Agent → [Clay, Crunchbase]
├── Enrich Agent → [Apollo, Clearbit, ZoomInfo*, Sales Nav*]
└── Outreach Agent → [No connectors - recommendations only]

* = Phase 1 placeholders
```

**Storage:**
- **Firestore** - Workspace state, task history, results
- **Vertex AI Storage** - Exports, artifacts

**Not Included:**
- No dedicated Cloud Run API (agents are the API)
- No billing/metering system (Phase 1)
- No multi-tenant auth (Phase 1)

---

## Project Structure

```
pipelinepilot/
├── 000-docs/                    # All documentation
│   ├── 000-INDEX.md
│   └── 034-AA-REPT-phase-1-after-action-report.md
│
├── agents/                      # ADK agent YAMLs
│   ├── _schemas/AgentConfig.schema.json
│   ├── agent_0_orchestrator.yaml
│   ├── agent_1_research.yaml
│   ├── agent_2_enrich.yaml
│   └── agent_3_outreach.yaml
│
├── connectors/                  # FunctionTool wrappers (BYO keys)
│   ├── clay.tool.ts
│   ├── apollo.tool.ts
│   ├── clearbit.tool.ts
│   ├── crunchbase.tool.ts
│   ├── zoominfo.tool.ts        # Placeholder
│   └── salesnav.tool.ts        # Placeholder
│
├── newsfeed-demo/               # Standalone demo
│   ├── news_story.schema.json
│   ├── why_picked.ts
│   ├── exports.ts
│   └── demo_runner.ts
│
└── scripts/
    ├── enable_firestore.sh      # Setup GCP services
    ├── deploy_agents.sh         # Deploy to Vertex AI
    └── validate_arv.mjs         # ARV validation
```

---

## Quick Start

### Prerequisites

- Node.js 20+
- GCP account with billing enabled
- `gcloud` CLI authenticated
- ADK CLI: `pip install google-agent-sdk`
- Provider API keys (Clay, Apollo, etc.)

### 1. Setup GCP

```bash
export GCP_PROJECT="pipelinepilot-prod"
export GCP_REGION="us-central1"
export FIRESTORE_LOCATION="us-central"

# Enable APIs and create Firestore
./scripts/enable_firestore.sh
```

### 2. Validate ARV Compliance

```bash
npm install
npm run validate
```

Expected output:
```
✅ PASSED (5):
   ✓ schema_reference: All 4 agents have $schema
   ✓ function_tool_wrappers: All 6 connectors use FunctionTool
   ✓ sub_agent_routing: Orchestrator routes to 3 sub-agents
   ✓ json_schema_validity: All 2 schemas are valid
   ✓ connector_not_configured: All 6 connectors handle missing keys
```

### 3. Run NewsFeed Demo

```bash
npm run demo
```

Generates:
- `newsfeed-demo/output/demo_001.md` (Markdown export)
- `newsfeed-demo/output/demo_001.html` (HTML export)
- PDF message (disabled in Phase 1)

### 4. Deploy Agents

```bash
./scripts/deploy_agents.sh
```

Deploys all 4 agents to Vertex AI Agent Engine.

### 5. Configure Provider Keys

```bash
# Store in Secret Manager (per-workspace)
echo -n "sk_clay_..." | gcloud secrets create workspace-123-clay-key --data-file=-
echo -n "..." | gcloud secrets create workspace-123-apollo-key --data-file=-
# Repeat for clearbit, crunchbase, etc.
```

### 6. Invoke Orchestrator

```bash
adk invoke agent_engine pipelinepilot-orchestrator \
  --project="$GCP_PROJECT" \
  --region="$GCP_REGION" \
  --input='{"task":"research","domain":"example.com"}'
```

---

## BYO Keys Policy

**Why BYO?**
1. **Cost Control** - Users pay providers directly
2. **Rate Limits** - Users manage their own quotas
3. **Compliance** - Users own their data relationships
4. **Liability** - No PipelinePilot liability for ToS violations

**Supported Providers:**
- ✅ Clay (requires API key)
- ✅ Apollo (requires API key)
- ✅ Clearbit (requires API key)
- ✅ Crunchbase (requires API key)
- ⚠️ ZoomInfo (requires enterprise license - placeholder)
- ⚠️ Sales Navigator (no official API - placeholder)

**Not Supported:**
- ❌ Web scraping
- ❌ Unofficial APIs
- ❌ ToS-violating methods
- ❌ Automated browser tools (PhantomBuster, etc.)

---

## Safety Model

### What PipelinePilot Does

✅ **Orchestrates paid API calls**
✅ **Routes tasks through specialist agents**
✅ **Generates recommendations (not executions)**
✅ **Tracks actions for transparency**

### What PipelinePilot Does NOT Do

❌ **Send emails or make calls**
❌ **Scrape websites or social media**
❌ **Violate provider Terms of Service**
❌ **Store API keys in plaintext**
❌ **Share data across workspaces**

### Connector Behavior Without Keys

All connectors return `NOT_CONFIGURED` status until API keys are provided:

```json
{
  "status": "not_configured",
  "error": "CLAY_API_KEY not found in Secret Manager. Configure per-workspace credentials.",
  "actionCount": 0
}
```

---

## Phase 1 Limitations

**What's Included:**
- ✅ 4 ADK-compliant agents
- ✅ 6 connector tool shims (4 active, 2 placeholders)
- ✅ NewsFeed demo
- ✅ ARV validation
- ✅ GCP deployment scripts

**What's Not Included (Future Phases):**
- ⏳ Billing/metering system
- ⏳ Multi-tenant auth
- ⏳ Web UI
- ⏳ CRM integrations (HubSpot, Salesforce)
- ⏳ Email sending (Sendgrid, Mailgun)
- ⏳ Advanced agents (ICP scorer, list builder)

---

## Troubleshooting

### ARV Validation Fails

```bash
# Check YAML syntax
yamllint agents/*.yaml

# Check JSON schemas
jq . newsfeed-demo/news_story.schema.json
jq . agents/_schemas/AgentConfig.schema.json
```

### Agent Deployment Fails

```bash
# Verify ADK installation
adk --version

# Check GCP auth
gcloud auth list

# Verify staging bucket exists
gsutil ls gs://vertex-$GCP_PROJECT-staging/
```

### Connector Returns NOT_CONFIGURED

```bash
# Verify secret exists
gcloud secrets list | grep workspace-123-clay-key

# Test secret access
gcloud secrets versions access latest --secret="workspace-123-clay-key"
```

---

## Development

### Run Tests

```bash
npm run validate  # ARV compliance check
```

### Type Check

```bash
npm run typecheck
```

### Local Demo

```bash
npm run demo
```

---

## Support

### Documentation
- **Full Index:** [000-docs/000-INDEX.md](000-docs/000-INDEX.md)
- **After-Action Report:** [000-docs/034-AA-REPT-phase-1-after-action-report.md](000-docs/034-AA-REPT-phase-1-after-action-report.md)

### Issues
Open GitHub issue for bugs or feature requests.

---

## License

Proprietary. All rights reserved.

---

**Last Updated:** 2025-10-31
**Version:** 1.0.0-phase1
**Status:** Phase 1 Foundation Complete
