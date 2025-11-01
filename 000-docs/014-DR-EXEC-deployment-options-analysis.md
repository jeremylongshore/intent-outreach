# PipelinePilot Deployment Options - Executive Analysis

**Date:** 2025-11-01
**Current Status:** Dashboard LIVE | Backend BLOCKED
**Decision Required:** Choose deployment path

---

## 🎯 Current Situation

### What's Working ✅
- **Dashboard:** https://pipelinepilot-prod.web.app (LIVE)
- **Python ADK Agents:** Complete code for 4 agents + 5 tools
- **Firebase Project:** Fully configured with web app credentials

### What's Blocked ⚠️
- **Firebase Functions Gen2:** Cloud Build IAM issues (30+ min troubleshooting, still failing)
- **Agent Engine Deployment:** ReasoningEngine API signature changed, deploy script needs update

---

## 📊 Deployment Options Comparison

| Option | Time | Complexity | Scalability | Production Ready | Cost |
|--------|------|------------|-------------|------------------|------|
| **A: Client-Side Gemini** | 15 min | Low | Medium | No | Low |
| **B: Functions Gen1 + Gemini** | 1 hour | Medium | High | Yes | Low |
| **C: Functions Gen1 + Agent Engine** | 3 hours | High | High | Yes | Medium |
| **D: Cloud Run + Agent Engine** | 4 hours | High | Very High | Yes | Medium |

---

## OPTION A: Client-Side Gemini API Calls

### Architecture
```
Dashboard (Browser)
    ↓ Direct API call
Gemini 2.0 Flash API
    ↓
Results displayed in Dashboard
```

### What You Get
- ✅ Working demo in 15 minutes
- ✅ Uses your Python agent prompts (copy/paste to TypeScript)
- ✅ Dashboard shows real AI-generated leads
- ✅ No backend deployment needed

### What You Don't Get
- ❌ API key visible in browser (security risk)
- ❌ No orchestration (single API call, not multi-agent workflow)
- ❌ No Secret Manager integration
- ❌ No Firestore triggers
- ❌ Can't use Clay/Apollo/Clearbit tools (CORS blocked)

### Implementation
```typescript
// dashboard/lib/gemini.ts
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(
  process.env.NEXT_PUBLIC_GEMINI_API_KEY
);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

export async function runResearch(icp: string, domains: string[]) {
  const prompt = `You are the Research Agent for PipelinePilot.

Input: ICP description and/or a list of company domains.
Goal: Produce up to 25 candidate leads with website, fit_score, and short notes.

ICP: ${icp}
Domains: ${domains.join(", ")}

Output format (JSON):
{
  "leads": [
    {
      "company": "string (2-120 chars)",
      "website": "string (valid URI)",
      "fit_score": "integer (0-100)",
      "notes": "string (0-500 chars)"
    }
  ]
}`;

  const result = await model.generateContent(prompt);
  return JSON.parse(result.response.text());
}
```

### Security Setup
```bash
# Restrict API key in GCP Console
gcloud alpha services api-keys update GEMINI_API_KEY \
  --allowed-referrers="https://pipelinepilot-prod.web.app/*" \
  --api-target=service=generativelanguage.googleapis.com
```

### Best For
- ✅ Quick prototype/demo
- ✅ Testing dashboard UI
- ✅ Showing stakeholders TODAY
- ❌ NOT for production (API key exposure)

---

## OPTION B: Firebase Functions Gen1 + Direct Gemini Calls

### Architecture
```
Dashboard (Browser)
    ↓ HTTPS
Firebase Functions Gen1 (Node.js 18)
    ↓ API call
Gemini 2.0 Flash API
    ↓
Results written to Firestore
    ↓ Real-time listener
Dashboard updates automatically
```

### What You Get
- ✅ Server-side execution (API keys safe)
- ✅ Secret Manager integration
- ✅ Firestore triggers (auto-process campaigns)
- ✅ Proven IAM (Gen1 always works)
- ✅ Can call external APIs (Clay, Apollo, etc.)
- ✅ Production-ready security

### What You Don't Get
- ❌ No Agent Engine orchestration
- ❌ Single Gemini call per agent (not proper agent framework)
- ❌ Manual prompt management

### Implementation
```bash
# 1. Downgrade to Gen1
cd pipelinepilot-dashboard/functions
npm install firebase-functions@^4.9.0

# 2. Update package.json
{
  "engines": { "node": "18" }
}

# 3. Change imports
// OLD (Gen2):
import { onRequest } from 'firebase-functions/v2/https';

// NEW (Gen1):
import * as functions from 'firebase-functions';
export const api = functions.https.onRequest(async (req, res) => {...});

# 4. Deploy (will work immediately)
firebase deploy --only functions
```

### Functions Code
```typescript
// functions/src/index.ts (Gen1)
import * as functions from 'firebase-functions';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';

initializeApp();
const db = getFirestore();

export const runCampaign = functions.firestore
  .document('campaigns/{campaignId}')
  .onCreate(async (snap, context) => {
    const campaign = snap.data();

    // Call Gemini with agent prompts
    const genAI = new GoogleGenerativeAI(functions.config().gemini.key);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    // Research
    const researchResult = await model.generateContent(RESEARCH_PROMPT);
    const leads = JSON.parse(researchResult.response.text()).leads;

    // Write to Firestore
    const batch = db.batch();
    leads.forEach(lead => {
      const ref = snap.ref.collection('leads').doc();
      batch.set(ref, lead);
    });
    await batch.commit();
  });
```

### Best For
- ✅ Production deployment
- ✅ Security requirements met
- ✅ Need external API calls (Clay, Apollo)
- ✅ Want it working in 1 hour

---

## OPTION C: Firebase Functions Gen1 + Vertex AI Agent Engine

### Architecture
```
Dashboard (Browser)
    ↓ HTTPS
Firebase Functions Gen1 (Node.js 18)
    ↓ REST API
Vertex AI Agent Engine (Python ADK)
    ├─ Orchestrator Agent
    ├─ Research Agent (→ Clay, Apollo)
    ├─ Enrich Agent (→ Clearbit, Crunchbase)
    └─ Outreach Agent (→ Gemini)
    ↓
Results written to Firestore
    ↓ Real-time listener
Dashboard updates automatically
```

### What You Get
- ✅ Full Agent Engine orchestration
- ✅ Python ADK agents deployed to managed platform
- ✅ Auto-scaling, monitoring, tracing
- ✅ Tool execution with Secret Manager
- ✅ Proper multi-agent workflow
- ✅ Production-grade architecture

### What You Don't Get
- ❌ Takes 3 hours (fix deploy script + wire functions)
- ❌ More complex debugging

### Implementation Steps

#### Step 1: Fix Agent Deploy Script (1 hour)
```python
# src/deploy.py - CURRENT (BROKEN)
reasoning_engine = reasoning_engines.ReasoningEngine.create(
    reasoning_engine_spec={...}  # ❌ Wrong API
)

# FIXED VERSION
from vertexai.preview import reasoning_engines
from google.cloud import aiplatform

# Define agent as Python object first
class ResearchAgent:
    def query(self, input: str) -> dict:
        # Agent logic here
        return {"leads": [...]}

# Then create reasoning engine from object
agent = ResearchAgent()
reasoning_engine = reasoning_engines.ReasoningEngine.create(
    agent,
    requirements=["google-cloud-aiplatform>=1.112.0", "httpx>=0.27.0"],
    display_name="PipelinePilot Research Agent"
)
```

#### Step 2: Deploy Agents (30 min)
```bash
source venv-deploy/bin/activate
export PROJECT_ID=pipelinepilot-prod
export LOCATION=us-central1
python src/deploy_fixed.py
# Returns: reasoning_engine_id for each agent
```

#### Step 3: Wire Functions to Agents (1 hour)
```typescript
// functions/src/index.ts
import { GoogleAuth } from 'google-auth-library';

const ORCHESTRATOR_ID = "projects/.../reasoningEngines/123456";

export const runCampaign = functions.firestore
  .document('campaigns/{campaignId}')
  .onCreate(async (snap, context) => {
    const auth = new GoogleAuth();
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    // Call Agent Engine
    const response = await fetch(
      `https://us-central1-aiplatform.googleapis.com/v1/${ORCHESTRATOR_ID}:query`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `ICP: ${campaign.icp}, Domains: ${campaign.domains}`
        })
      }
    );

    const result = await response.json();
    // Write to Firestore...
  });
```

#### Step 4: Test End-to-End (30 min)
```bash
# Create test campaign in dashboard
# Monitor Agent Engine execution in Cloud Console
# Verify results appear in Firestore
# Check dashboard real-time updates
```

### Best For
- ✅ Production system with proper agent orchestration
- ✅ Need tracing, monitoring, auto-scaling
- ✅ Want "proper" agent architecture
- ✅ Have 3 hours to implement

---

## OPTION D: Cloud Run Service + Vertex AI Agent Engine

### Architecture
```
Dashboard (Browser)
    ↓ HTTPS
Cloud Run Service (Python FastAPI)
    ├─ /api/campaigns/start endpoint
    └─ Pub/Sub subscriber for Firestore triggers
    ↓ Direct Python calls
Vertex AI Agent Engine (Python ADK)
    ├─ Orchestrator Agent
    ├─ Research Agent
    ├─ Enrich Agent
    └─ Outreach Agent
    ↓
Results written to Firestore
```

### What You Get
- ✅ Bypass Firebase Functions entirely
- ✅ Python backend (same language as agents)
- ✅ Full control over deployment
- ✅ Easier debugging (logs in one place)
- ✅ Can call Agent Engine directly (no REST API overhead)

### What You Don't Get
- ❌ Takes 4 hours to implement
- ❌ Need to manually wire Firestore triggers via Pub/Sub
- ❌ More infrastructure to manage

### Implementation

#### Step 1: Create FastAPI Backend (2 hours)
```python
# service/main.py
from fastapi import FastAPI
from google.cloud import firestore
from vertexai.preview import reasoning_engines

app = FastAPI()
db = firestore.Client()

# Load deployed agents
orchestrator = reasoning_engines.ReasoningEngine(
    "projects/.../reasoningEngines/123456"
)

@app.post("/api/campaigns/start")
async def start_campaign(campaign_id: str):
    # Get campaign from Firestore
    campaign_ref = db.collection('campaigns').document(campaign_id)
    campaign = campaign_ref.get().to_dict()

    # Call orchestrator directly (Python object, not REST)
    result = orchestrator.query(
        message=f"ICP: {campaign['icp']}, Domains: {campaign['domains']}"
    )

    # Write results to Firestore
    for lead in result['leads']:
        campaign_ref.collection('leads').add(lead)

    return {"status": "complete"}
```

#### Step 2: Deploy to Cloud Run (1 hour)
```bash
# Create Dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]

# Deploy
gcloud run deploy pipelinepilot-api \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --service-account pipelinepilot-core@pipelinepilot-prod.iam.gserviceaccount.com \
  --project pipelinepilot-prod
```

#### Step 3: Wire Firestore Triggers (1 hour)
```bash
# Create Pub/Sub topic
gcloud pubsub topics create campaign-created

# Create Eventarc trigger
gcloud eventarc triggers create campaign-trigger \
  --destination-run-service=pipelinepilot-api \
  --destination-run-region=us-central1 \
  --event-filters="type=google.cloud.firestore.document.v1.created" \
  --event-filters="database=(default)" \
  --event-filters-path-pattern="document=campaigns/{campaignId}" \
  --service-account=pipelinepilot-core@pipelinepilot-prod.iam.gserviceaccount.com
```

### Best For
- ✅ Want full control
- ✅ Prefer Python backend (same as agents)
- ✅ Need custom orchestration logic
- ✅ Have 4 hours + comfortable with Cloud Run

---

## 🎯 Decision Matrix

### Choose Option A If:
- ⏰ Need demo TODAY
- 🎨 Just testing UI/UX
- 👥 Showing stakeholders a prototype
- ⚠️ OK with API key in client (temporary)

### Choose Option B If:
- ⏰ Need production in 1 hour
- 🔒 Security is important
- 🛠️ Need external API calls (Clay, Apollo)
- ✅ Don't need Agent Engine orchestration yet

### Choose Option C If:
- ⏰ Have 3 hours today
- 🏗️ Want proper agent architecture
- 📊 Need monitoring/tracing
- ✅ This is the production system

### Choose Option D If:
- ⏰ Have 4 hours + planning phase
- 🐍 Prefer Python everywhere
- 🎛️ Want maximum control
- 🔧 Comfortable with Cloud Run + Pub/Sub

---

## 💡 Recommended Path

### PHASE 1: Quick Win (TODAY)
**Deploy Option B** (Firebase Functions Gen1 + Gemini)

**Why:**
- ✅ Production-ready in 1 hour
- ✅ Secure (no API keys in client)
- ✅ Can call external APIs
- ✅ Dashboard fully functional

**Trade-off:**
- Not using Agent Engine (yet)
- Single Gemini call per agent workflow

### PHASE 2: Upgrade (NEXT WEEK)
**Migrate to Option C** (Add Agent Engine)

**Why:**
- ✅ Functions already deployed (don't touch frontend)
- ✅ Just update functions to call Agent Engine
- ✅ No dashboard changes needed

**Steps:**
1. Fix agent deploy script
2. Deploy agents to Agent Engine
3. Update functions to call agents instead of Gemini directly
4. Deploy updated functions

---

## 📋 Implementation Checklist

### If You Choose Option A (15 min):
- [ ] Install `@google/generative-ai` in dashboard
- [ ] Add Gemini API key to `.env.local`
- [ ] Create `lib/gemini.ts` with agent prompts
- [ ] Update campaign page to call Gemini
- [ ] Set API key restrictions in GCP Console
- [ ] Test in browser
- [ ] Deploy dashboard update

### If You Choose Option B (1 hour):
- [ ] Downgrade to `firebase-functions@^4.9.0`
- [ ] Change Node engine to 18
- [ ] Convert imports to Gen1 syntax
- [ ] Add Gemini API package
- [ ] Add agent prompts to functions
- [ ] Set Gemini API key in Firebase config
- [ ] Deploy functions
- [ ] Test campaign creation
- [ ] Verify Firestore writes
- [ ] Check dashboard updates

### If You Choose Option C (3 hours):
- [ ] Fix `src/deploy.py` with new ReasoningEngine API
- [ ] Deploy 4 agents to Agent Engine
- [ ] Save reasoning engine IDs
- [ ] Downgrade functions to Gen1
- [ ] Add Google Auth to functions
- [ ] Wire functions to call Agent Engine REST API
- [ ] Deploy functions
- [ ] Test end-to-end
- [ ] Set up monitoring/alerts
- [ ] Document agent endpoints

### If You Choose Option D (4 hours):
- [ ] Create FastAPI service structure
- [ ] Implement campaign API endpoints
- [ ] Deploy agents to Agent Engine
- [ ] Wire FastAPI to agents (Python SDK)
- [ ] Create Dockerfile
- [ ] Deploy to Cloud Run
- [ ] Set up Eventarc trigger for Firestore
- [ ] Test Pub/Sub integration
- [ ] Update dashboard API endpoint
- [ ] Deploy and test end-to-end

---

## 💰 Cost Comparison

| Option | Estimated Monthly Cost (1000 campaigns/month) |
|--------|----------------------------------------------|
| **A: Client-Side** | $5 (Gemini API only) |
| **B: Gen1 + Gemini** | $10 (Functions + Gemini) |
| **C: Gen1 + Agent Engine** | $30 (Functions + Agent Engine + Gemini) |
| **D: Cloud Run + Agent Engine** | $25 (Cloud Run + Agent Engine + Gemini) |

*Note: Actual costs depend on usage patterns, tool API costs (Clay, Apollo), and data storage.*

---

## 🚀 My Recommendation

**START WITH OPTION B** (Firebase Functions Gen1 + Gemini)

### Why This Path?
1. ✅ **Production-ready in 1 hour** (not 15 min prototype)
2. ✅ **Secure** (API keys server-side)
3. ✅ **Can call external APIs** (Clay, Apollo, etc.)
4. ✅ **Easy upgrade path** to Agent Engine later
5. ✅ **Dashboard doesn't change** when you upgrade

### Migration Path
```
Week 1: Option B (Functions + Gemini) ← START HERE
    ↓
Week 2: Fix agent deploy script
    ↓
Week 3: Option C (Functions + Agent Engine)
    ↓ (optional)
Month 2: Option D (Cloud Run) if needed
```

---

## 📞 Next Steps

**Ready to execute?** Pick your option and I'll implement it right now:

```bash
# Option A: 15 minutes
"Implement Option A - client-side Gemini"

# Option B: 1 hour (RECOMMENDED)
"Implement Option B - Functions Gen1"

# Option C: 3 hours
"Implement Option C - Agent Engine"

# Option D: 4 hours
"Implement Option D - Cloud Run"
```

---

**Generated:** 2025-11-01 06:30 UTC
**Status:** Decision required - dashboard LIVE, backend architecture choice needed
**Dashboard:** https://pipelinepilot-prod.web.app
