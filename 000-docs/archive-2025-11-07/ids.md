
## Dev Deployment (2025-11-01)

**Orchestrator Agent Engine:**
```
projects/365258353703/locations/us-central1/reasoningEngines/5660167112535048192
```

**Deployment Details:**
- Project: `pipelinepilot-prod`
- Location: `us-central1`
- Service Account: `pp-dev@pipelinepilot-prod.iam.gserviceaccount.com`
- Staging Bucket: `gs://pipelinepilot-agent-staging`
- Labels: `{"branch": "fix-orchestrator-in-engine", "tier": "dev", "component": "orchestrator", "version": "v1"}`

**Console:**
https://console.cloud.google.com/vertex-ai/agent-engine/projects/365258353703/locations/us-central1/reasoningEngines/5660167112535048192

**Test Usage:**
```python
from vertexai.preview import reasoning_engines
engine = reasoning_engines.ReasoningEngine('projects/365258353703/locations/us-central1/reasoningEngines/5660167112535048192')
result = engine.query(input={"icp": "B2B SaaS", "domains": ["example.com"]})
```
