# Engine IDs

**Last Updated:** 2025-11-01
**Status:** Dev Deployed

---

## Development Environment

### Orchestrator Agent Engine
**Deployed:** 2025-11-01 18:33:49 (LATEST - Direct orchestration ✅)
**Resource ID:**
```
projects/365258353703/locations/us-central1/reasoningEngines/1703754839890067456
```

**Configuration:**
- Project: `pipelinepilot-prod`
- Location: `us-central1`
- Model: `gemini-2.0-flash-exp`
- Tools: 4 (clay_lookup, apollo_people, clearbit_enrich, crunchbase_company)
- Service Account: `pp-dev@pipelinepilot-prod.iam.gserviceaccount.com`
- Staging Bucket: `gs://pipelinepilot-agent-staging`
- **Implementation:** Direct orchestration logic in OrchestratorWrapper (no ADK Agent wrapper)
- **Fix Applied:** Removed ADK Agent dependency, implemented workflow directly in async query() method

**Labels:**
```json
{
  "branch": "fix-orchestrator-in-engine",
  "tier": "dev",
  "component": "orchestrator",
  "version": "v1"
}
```

**Console URL:**
https://console.cloud.google.com/vertex-ai/agent-engine/projects/365258353703/locations/us-central1/reasoningEngines/1703754839890067456

**Firebase Functions Config (Gen2 Secret):**
```bash
firebase functions:secrets:set ORCHESTRATOR_DEV_ID --data="projects/365258353703/locations/us-central1/reasoningEngines/1703754839890067456"
```

---

### Previous Deployments (Deprecated)

**Deployment 2:**
**Deployed:** 2025-11-01 18:27:10
**Resource ID:** `projects/365258353703/locations/us-central1/reasoningEngines/4446447012958699520`
**Status:** Failed - ADK Agent API incompatibility ('LlmAgent' object has no attribute 'send_message')

**Deployment 1:**
**Deployed:** 2025-11-01 17:10:04
**Resource ID:** `projects/365258353703/locations/us-central1/reasoningEngines/5660167112535048192`
**Status:** Failed - wrapper signature incompatible with Agent Engine kwargs unpacking

---

## Production Environment

**Status:** Not yet deployed

---

## Testing

### Direct Query (Python)
```python
from vertexai.preview import reasoning_engines

engine = reasoning_engines.ReasoningEngine(
    'projects/365258353703/locations/us-central1/reasoningEngines/4446447012958699520'
)

result = engine.query(input={
    "icp": "B2B SaaS companies",
    "domains": ["example.com"],
    "email": "contact@example.com"
})
```

### Via Firebase Functions
```bash
curl -X POST https://us-central1-pipelinepilot-prod.cloudfunctions.net/api/campaigns/start \
  -H "Content-Type: application/json" \
  -d '{"id": "test-campaign-id"}'
```
