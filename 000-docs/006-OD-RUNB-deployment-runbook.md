# Deployment Runbook - PipelinePilot Agent Engine

**Project:** PipelinePilot
**Date:** 2025-11-01
**Category:** Operations & Deployment (OD-RUNB)
**Status:** ✅ Validated

---

## Overview

This runbook provides step-by-step procedures for deploying, rolling back, and troubleshooting PipelinePilot agents on Vertex AI Agent Engine.

**Deployment Architecture:**
- **Agents:** 4 Python ADK agents deployed to Agent Engine
  - Research Agent (Clay + Apollo)
  - Enrich Agent (Clearbit + Crunchbase)
  - Outreach Agent (Message generation)
  - Orchestrator Agent (Workflow coordinator)
- **Dashboard:** React app deployed to Firebase Hosting
- **Functions:** Firebase Functions Gen1 calling Agent Engine endpoints
- **Database:** Firestore (campaign data)

---

## Prerequisites

### Required Access
- ✅ GCP Project: `pipelinepilot-prod`
- ✅ IAM Role: `roles/aiplatform.admin` (for agent deployment)
- ✅ Service Account: `pipelinepilot-core@pipelinepilot-prod.iam.gserviceaccount.com`
- ✅ Firebase Project: `pipelinepilot-prod`

### Required Tools
```bash
# Install Google Cloud SDK
which gcloud || curl https://sdk.cloud.google.com | bash

# Install Python dependencies
pip install google-cloud-aiplatform>=1.121.0 cloudpickle==3.1.1

# Install Firebase CLI
which firebase || npm install -g firebase-tools

# Authenticate
gcloud auth login
gcloud config set project pipelinepilot-prod
firebase login
```

### Required Secrets
Verify secrets exist in Secret Manager:
```bash
gcloud secrets list --project=pipelinepilot-prod

# Should show:
# APOLLO_API_KEY
# CLAY_API_KEY
# CLEARBIT_API_KEY
# CRUNCHBASE_API_KEY
```

---

## Deployment Procedures

### 1. Deploy Agent Engine (Agents)

**Estimated Time:** 20-40 minutes (5-10 min per agent)

#### Step 1.1: Pre-Deployment Checks
```bash
cd /path/to/pipelinepilot

# Verify branch
git branch --show-current  # Should be: migration/adk-python

# Verify bootstrap complete
gcloud secrets list --project=pipelinepilot-prod | grep -E "(CLAY|APOLLO|CLEARBIT|CRUNCHBASE)"
gsutil ls gs://pipelinepilot-prod-staging  # Should exist

# Verify service account
gcloud iam service-accounts describe pipelinepilot-core@pipelinepilot-prod.iam.gserviceaccount.com
```

#### Step 1.2: Deploy Agents
```bash
# Set environment
export PROJECT_ID=pipelinepilot-prod
export LOCATION=us-central1

# Run deployment (20-40 minutes)
python3 src/deploy_inline.py 2>&1 | tee logs/deploy-$(date +%Y%m%d-%H%M%S).log
```

**Expected Output:**
```
INFO:__main__:Deploying Research Agent
INFO:vertexai.reasoning_engines._reasoning_engines:Create ReasoningEngine backing LRO: projects/.../reasoningEngines/xxx/operations/yyy
INFO:__main__:✅ Research Agent deployed: projects/.../reasoningEngines/xxx
...
INFO:__main__:✅ ALL AGENTS DEPLOYED SUCCESSFULLY
```

#### Step 1.3: Capture Engine IDs
```bash
# Extract from deployment output
export RESEARCH_ENGINE_ID="projects/365258353703/locations/us-central1/reasoningEngines/xxx"
export ENRICH_ENGINE_ID="projects/365258353703/locations/us-central1/reasoningEngines/yyy"
export OUTREACH_ENGINE_ID="projects/365258353703/locations/us-central1/reasoningEngines/zzz"
export ORCHESTRATOR_ENGINE_ID="projects/365258353703/locations/us-central1/reasoningEngines/www"

# Save to file
cat > .env.agents << EOF
RESEARCH_ENGINE_ID=$RESEARCH_ENGINE_ID
ENRICH_ENGINE_ID=$ENRICH_ENGINE_ID
OUTREACH_ENGINE_ID=$OUTREACH_ENGINE_ID
ORCHESTRATOR_ENGINE_ID=$ORCHESTRATOR_ENGINE_ID
EOF
```

#### Step 1.4: Run Smoke Tests
```bash
# Test each agent
source .env.agents
./scripts/smoke-test.sh

# Expected output:
# ✅ Research Agent passed
# ✅ Enrich Agent passed
# ✅ Outreach Agent passed
# ✅ Orchestrator Agent passed
```

---

### 2. Deploy Firebase Functions

**Estimated Time:** 2-5 minutes

#### Step 2.1: Update Functions Configuration
```bash
cd pipelinepilot-dashboard/functions

# Update environment variables
firebase functions:config:set \
  agents.research="$RESEARCH_ENGINE_ID" \
  agents.enrich="$ENRICH_ENGINE_ID" \
  agents.outreach="$OUTREACH_ENGINE_ID" \
  agents.orchestrator="$ORCHESTRATOR_ENGINE_ID"

# Or update .env file
cat > .env << EOF
RESEARCH_ENGINE_ID=$RESEARCH_ENGINE_ID
ENRICH_ENGINE_ID=$ENRICH_ENGINE_ID
OUTREACH_ENGINE_ID=$OUTREACH_ENGINE_ID
ORCHESTRATOR_ENGINE_ID=$ORCHESTRATOR_ENGINE_ID
EOF
```

#### Step 2.2: Deploy Functions
```bash
# Build first
npm run build

# Deploy
firebase deploy --only functions --project=pipelinepilot-prod

# Expected output:
# ✔  functions: Finished running predeploy script.
# ✔  functions[us-central1-runCampaign] Successful update operation.
# ✔  Deploy complete!
```

#### Step 2.3: Test Functions
```bash
# Test runCampaign endpoint
curl -X POST https://us-central1-pipelinepilot-prod.cloudfunctions.net/runCampaign \
  -H "Content-Type: application/json" \
  -d '{"icp": "B2B SaaS", "domains": ["example.com"]}'

# Expected: {"status": "success", ...}
```

---

### 3. Deploy Dashboard (Frontend)

**Estimated Time:** 1-2 minutes

#### Step 3.1: Build Dashboard
```bash
cd pipelinepilot-dashboard
npm run build

# Verify build
ls -la dist/
```

#### Step 3.2: Deploy to Firebase Hosting
```bash
firebase deploy --only hosting --project=pipelinepilot-prod

# Expected output:
# ✔  Deploy complete!
# Hosting URL: https://pipelinepilot-prod.web.app
```

#### Step 3.3: Verify Deployment
```bash
# Open in browser
open https://pipelinepilot-prod.web.app

# Test campaign creation
# - Click "New Campaign"
# - Enter ICP and domains
# - Verify results appear
```

---

## Rollback Procedures

### Rollback Agent Deployment

**Important:** Agent Engine does not support rollback. To revert, you must:
1. Deploy previous agent version with new resource ID
2. Update Functions to point to old resource ID

```bash
# Option 1: Redeploy previous version
git checkout <previous-commit>
python3 src/deploy_inline.py

# Capture new engine IDs (will be different)
export RESEARCH_ENGINE_ID="projects/.../reasoningEngines/old-id"
# ... (repeat for all agents)

# Update Functions
cd pipelinepilot-dashboard/functions
firebase functions:config:set agents.research="$RESEARCH_ENGINE_ID" ...
firebase deploy --only functions

# Option 2: Use previous engine IDs (if they still exist)
# Verify old engines are still running:
gcloud ai reasoning-engines list --location=us-central1

# Update Functions to use old IDs
firebase functions:config:set agents.research="<old-id>" ...
firebase deploy --only functions
```

### Rollback Firebase Functions

```bash
cd pipelinepilot-dashboard/functions

# List previous deployments
gcloud functions list --project=pipelinepilot-prod

# Rollback to previous version
firebase deploy --only functions --version <previous-version>
```

### Rollback Dashboard

```bash
cd pipelinepilot-dashboard

# Rollback to previous commit
git checkout <previous-commit>
npm run build
firebase deploy --only hosting
```

---

## Troubleshooting

### Agent Deployment Failures

**Error:** "No module named 'agents'"
```bash
# Fix: Ensure agents defined inline in deploy_inline.py
grep "class ResearchAgent" src/deploy_inline.py
# Should show: class definition inside deploy_inline.py
```

**Error:** "Can't get attribute '_class_setstate'"
```bash
# Fix: Pin cloudpickle version
grep "cloudpickle" src/deploy_inline.py
# Should show: cloudpickle==3.1.1
```

**Error:** "Reasoning Engine resource failed to start"
```bash
# Check Cloud Logging
gcloud logging read \
  "resource.type=aiplatform.googleapis.com/ReasoningEngine AND severity=ERROR" \
  --limit=5 --project=pipelinepilot-prod --format="value(textPayload)"

# Common fixes:
# 1. Check vertexai.init() not called in agent __init__
# 2. Verify cloudpickle==3.1.1 in requirements
# 3. Ensure no module imports from agents.* package
```

### Firebase Functions Failures

**Error:** "Cloud Build IAM error"
```bash
# Fix: Ensure using Gen1 (not Gen2)
grep "firebase-functions" pipelinepilot-dashboard/functions/package.json
# Should show: "firebase-functions": "^4.9.0" (Gen1)

# NOT: "firebase-functions": "^5.0.0" (Gen2)
```

**Error:** "Agent Engine endpoint not found"
```bash
# Verify engine IDs set
firebase functions:config:get

# Should show:
# {
#   "agents": {
#     "research": "projects/.../reasoningEngines/xxx",
#     ...
#   }
# }

# If missing, set them:
firebase functions:config:set agents.research="$RESEARCH_ENGINE_ID" ...
```

### Dashboard Issues

**Error:** "Campaign not starting"
```bash
# Check Firestore rules
firebase firestore:rules:get

# Check Functions logs
firebase functions:log --project=pipelinepilot-prod

# Test Functions directly
curl -X POST https://us-central1-pipelinepilot-prod.cloudfunctions.net/runCampaign \
  -H "Content-Type: application/json" \
  -d '{"icp": "test", "domains": []}'
```

---

## Monitoring

### Check Agent Health
```bash
# List all reasoning engines
gcloud ai reasoning-engines list \
  --location=us-central1 \
  --project=pipelinepilot-prod

# Describe specific engine
gcloud ai reasoning-engines describe <engine-id> \
  --location=us-central1 \
  --project=pipelinepilot-prod
```

### Check Functions Health
```bash
# List functions
gcloud functions list --project=pipelinepilot-prod

# Get function logs
firebase functions:log --project=pipelinepilot-prod --limit=50
```

### Check Dashboard Health
```bash
# Test hosting
curl -I https://pipelinepilot-prod.web.app

# Expected: HTTP/2 200
```

---

## Emergency Contacts

**GCP Support:** https://cloud.google.com/support
**Firebase Support:** https://firebase.google.com/support
**Vertex AI Agent Engine Docs:** https://cloud.google.com/vertex-ai/docs/agent-engine

---

## Appendix

### Deployment Checklist
- [ ] Verify GCP project and permissions
- [ ] Verify secrets in Secret Manager
- [ ] Verify staging bucket exists
- [ ] Deploy agents (20-40 min)
- [ ] Capture engine IDs
- [ ] Run smoke tests
- [ ] Update Functions config
- [ ] Deploy Functions
- [ ] Deploy Dashboard
- [ ] Test end-to-end workflow

### Post-Deployment Verification
```bash
# 1. Agent health
gcloud ai reasoning-engines list --location=us-central1

# 2. Functions health
firebase functions:log --limit=10

# 3. Dashboard health
curl -I https://pipelinepilot-prod.web.app

# 4. End-to-end test
# - Open dashboard
# - Create new campaign
# - Verify results in Firestore
```

---

**Last Updated:** 2025-11-01 17:50 UTC
**Owner:** Migration Captain (Claude Code)
**Status:** ✅ Validated (inline pattern)
