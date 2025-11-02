# 6767-PP-SOP-Functions-ESM-Orchestrator-Query

**Date:** 2025-11-02
**Status:** Standardization Complete - Awaiting GCP Support
**Category:** Standard Operating Procedure (SOP)

---

## Abbreviations

- **PP** = PipelinePilot
- **SOP** = Standard Operating Procedure
- **ESM** = ECMAScript Modules
- **ADK** = Agent Development Kit (Google)
- **Gen2** = Firebase Functions Generation 2

---

## Purpose

This SOP documents the standardization of PipelinePilot to industry-standard practices:

1. **Firebase Functions Gen2 + Node 20 + ESM** - Industry-standard for serverless functions
2. **Vertex AI Reasoning Engine with ADK-compliant wrapper** - Required for agent deployments

---

## Part 1: Firebase Functions ESM Standardization

### Why ESM?

Firebase Functions Gen2 with Node 20 and ESM is the current industry standard:
- ✅ Modern JavaScript module system
- ✅ Better tree-shaking and performance
- ✅ Native TypeScript support
- ✅ Future-proof (CommonJS is legacy)

### The `initializeApp is not a function` Problem

**Root Cause:**
In ESM mode, the import pattern for `firebase-admin` changed. The old CommonJS pattern doesn't work:

**❌ WRONG (CommonJS pattern in ESM):**
```typescript
import { initializeApp } from "firebase-admin/app";
// ...
initializeApp(); // TypeError: initializeApp is not a function
```

**✅ CORRECT (ESM pattern with explicit credential):**
```typescript
import { initializeApp, applicationDefault } from "firebase-admin/app";
// ...
initializeApp({ credential: applicationDefault() });
```

**✅ CORRECT (Import setGlobalOptions from /v2/options):**
```typescript
import { setGlobalOptions } from "firebase-functions/v2/options";  // NOT from /v2
```

### Configuration Files

**package.json:**
```json
{
  "name": "pp-functions",
  "type": "module",  // ← CRITICAL: Enables ESM
  "engines": { "node": "20" },
  "dependencies": {
    "firebase-admin": "^12.7.0",
    "firebase-functions": "^6.6.0"
  }
}
```

**tsconfig.json:**
```json
{
  "compilerOptions": {
    "module": "NodeNext",         // ← Use NodeNext for ESM
    "moduleResolution": "nodenext",
    "target": "ES2022",
    "outDir": "lib",
    "strict": true
  }
}
```

**index.ts (Complete correct pattern):**
```typescript
import { onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2/options";  // Correct module
import { defineSecret } from "firebase-functions/params";
import { initializeApp, applicationDefault } from "firebase-admin/app";  // Import both
import { getFirestore } from "firebase-admin/firestore";

setGlobalOptions({ region: "us-central1" });
initializeApp({ credential: applicationDefault() });  // Explicit credential

export const myFunction = onRequest(async (req, res) => {
  // Function logic
});
```

### Local Validation Steps

1. **Build:**
   ```bash
   cd pipelinepilot-dashboard/functions
   npm ci
   npm run build
   ```

2. **Verify Output:**
   ```bash
   ls -la lib/  # Should contain compiled .js files
   node --check lib/index.js  # Should exit silently (no errors)
   ```

3. **Success Criteria:**
   - ✅ No TypeScript compilation errors
   - ✅ `lib/index.js` exists and is valid JavaScript
   - ✅ No runtime errors when checking syntax

### Deployment Status

⚠️ **PAUSED PENDING GOOGLE SUPPORT**

Firebase Functions Gen2 deployments are currently blocked due to Cloud Build buildpack failure (infrastructure issue). **DO NOT RUN `firebase deploy --only functions`** until Google Support resolves:

- Build ID: `e5be2090-dfd5-43f0-95d5-dbb04d0fa428` (latest)
- Issue: Cloud Build Step 2 (`/cnb/lifecycle/creator`) exits with code 1
- Logs: Inaccessible despite permissions
- Support Repo: https://github.com/jeremylongshore/firebase-gen2-buildpack-failure

**The code is production-ready.** The deployment failure is NOT code-related.

---

## Part 2: Orchestrator Wrapper ADK Compliance

### Why Wrapper Needed?

Vertex AI Reasoning Engine requires:
- A class with a **synchronous** `query(**kwargs)` method
- Returns JSON-serializable `dict`
- No async methods at top level

**Problem:**
Our tool functions (`clay_lookup`, `apollo_people`, etc.) are async. Reasoning Engine can't directly accept async classes.

**Solution:**
Wrapper class with sync `query()` that wraps async calls using `asyncio.run()`.

### OrchestratorWrapper Contract

**File:** `src/orchestrator_wrapper.py`

**Required Method Signature:**
```python
class OrchestratorWrapper:
    def query(self, **kwargs) -> Dict[str, Any]:
        """
        Synchronous query method called by Vertex AI Agent Engine.

        Args:
            **kwargs: Query parameters (action, domain, email, etc.)

        Returns:
            dict: JSON-serializable response
        """
        # Implementation
```

**Supported Actions:**
- `ping` - Health check / status
- `clay` - Company lookup (requires: `domain`)
- `apollo` - People search (requires: `query`)
- `clearbit` - Contact enrichment (requires: `email`)
- `crunchbase` - Company funding (requires: `name`)

**Example Requests:**
```python
# Ping
wrapper.query(action="ping")
# Returns: {"ok": true, "message": "...", "tools": [...]}

# Clay lookup
wrapper.query(action="clay", domain="example.com")
# Returns: {"ok": true, "action": "clay", "data": {...}}

# Missing parameter
wrapper.query(action="clay")
# Returns: {"ok": false, "error": "Missing required parameter: domain"}
```

### Deployment Script

**File:** `src/deploy_with_wrapper.py`

**Key Configuration:**
```python
from vertexai.preview import reasoning_engines
from src.orchestrator_wrapper import OrchestratorWrapper

wrapper = OrchestratorWrapper()

engine = reasoning_engines.ReasoningEngine.create(
    wrapper,
    requirements=[
        "google-cloud-aiplatform>=1.121.0",
        "cloudpickle==3.1.1",  # ← PINNED (critical for Reasoning Engine)
        "httpx>=0.27.0",
        "google-cloud-secret-manager>=2.0.0",
    ],
    display_name="pipelinepilot-orchestrator-wrapper",
    service_account="pp-dev@pipelinepilot-prod.iam.gserviceaccount.com"
)
```

**Why cloudpickle==3.1.1?**

Vertex AI Reasoning Engine has specific serialization requirements. Pinning `cloudpickle==3.1.1` ensures deployment compatibility.

### Local Validation Steps

**Smoke Test:**
```bash
python3 scripts/smoke_orchestrator.py
```

**Expected Output:**
```
✅ ALL SMOKE TESTS PASSED!
The OrchestratorWrapper is ADK-compliant and ready for deployment.
```

**Tests Performed:**
1. ✅ Wrapper has `query(**kwargs)` method
2. ✅ Ping returns correct response
3. ✅ Unknown action returns error
4. ✅ Missing parameter returns validation error

### Deployment Commands

**Deploy to Vertex AI:**
```bash
cd /home/jeremy/000-projects/iams/pipelinepilot

# Set environment
export PROJECT_ID=pipelinepilot-prod
export LOCATION=us-central1
export SERVICE_ACCOUNT=pp-dev@pipelinepilot-prod.iam.gserviceaccount.com
export STAGING_BUCKET=gs://pipelinepilot-agent-staging

# Deploy
source venv-deploy/bin/activate
python3 src/deploy_with_wrapper.py
```

**Test Deployed Engine:**
```bash
# Get ENGINE_ID from deployment output
ENGINE_ID="projects/365258353703/locations/us-central1/reasoningEngines/..."

# Test query endpoint
curl -X POST \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  -d '{"class_method": "query", "input": {"action": "ping"}}' \
  "https://us-central1-aiplatform.googleapis.com/v1/${ENGINE_ID}:query"
```

**Expected Response:**
```json
{
  "ok": true,
  "message": "PipelinePilot Orchestrator online",
  "version": "1.0.0",
  "tools": ["clay", "apollo", "clearbit", "crunchbase"]
}
```

---

## Part 3: Project Structure

### Functions Files

```
pipelinepilot-dashboard/functions/
├── package.json          # type: "module", Node 20
├── tsconfig.json         # module: "NodeNext"
├── src/
│   └── index.ts          # ESM imports, correct init pattern
└── lib/                  # Compiled output (ESM)
    └── index.js
```

### Orchestrator Files

```
src/
├── orchestrator_wrapper.py          # ADK-compliant wrapper class
├── deploy_with_wrapper.py           # Deployment script with cloudpickle pinned
└── agents/
    └── tools.py                     # Async tool functions (unchanged)

scripts/
└── smoke_orchestrator.py            # Local validation smoke test
```

---

## Part 4: Known Issues & Workarounds

### Issue 1: Firebase Functions Gen2 Cloud Build Failure

**Status:** ⛔ BLOCKED - Awaiting Google Support

**Symptoms:**
- Cloud Build Step 2 (`/cnb/lifecycle/creator`) exits with code 1
- Logs inaccessible despite `logging.logWriter` permissions
- ALL functions fail identically (even minimal "hello world")

**What We Proved:**
- ✅ Code is production-ready (compiles, no import errors)
- ✅ Module system irrelevant (ESM and CommonJS fail identically)
- ✅ Not region-specific (us-central1 and us-east1 fail)
- ✅ Permissions correct (all IAM roles granted)
- ✅ No org policies blocking

**Conclusion:**
Cloud Build infrastructure issue. Requires Google escalation.

**Support Resources:**
- GitHub Repo: https://github.com/jeremylongshore/firebase-gen2-buildpack-failure
- Build IDs: See `000-docs/0024-AA-AAR-functions-gen2-investigation.md`

**Workaround:**
None available. Must wait for Google Support resolution.

### Issue 2: Old Orchestrator Import Conflicts

**Symptoms:**
```
ModuleNotFoundError: No module named 'google.adk'
```

**Cause:**
Old orchestrator code (`src/agents/orchestrator.py`) imports `google.adk`, which isn't installed. This triggers when importing from `agents` package.

**Solution:**
OrchestratorWrapper uses `importlib.util` to load `agents/tools.py` directly, bypassing `agents/__init__.py`.

**Code Pattern:**
```python
import importlib.util
from pathlib import Path

tools_path = Path(__file__).parent / "agents" / "tools.py"
spec = importlib.util.spec_from_file_location("tools", tools_path)
tools = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tools)

# Now access functions
clay_lookup = tools.clay_lookup
```

---

## Part 5: Future Considerations

### When Firebase Functions Unblocked

1. **Restore region to us-central1:**
   ```typescript
   setGlobalOptions({ region: "us-central1" });
   ```

2. **Deploy:**
   ```bash
   cd pipelinepilot-dashboard
   firebase deploy --only functions
   ```

3. **Verify:**
   ```bash
   # Test deployed function
   curl -X POST https://us-central1-pipelinepilot-prod.cloudfunctions.net/startCampaign \
     -H "Content-Type: application/json" \
     -d '{"ping": true}'
   ```

### Orchestrator Evolution

Current wrapper is minimal (ping + tool routing). Future enhancements:

1. **Multi-step workflows** - Chain multiple tool calls
2. **State management** - Track conversation context
3. **Error recovery** - Retry logic, fallback strategies
4. **Observability** - Structured logging, metrics
5. **Tool orchestration** - Parallel execution, caching

---

## Part 6: Acceptance Checklist

### Functions ESM Standardization

- ✅ `package.json` has `"type": "module"`
- ✅ `tsconfig.json` uses `module: "NodeNext"`
- ✅ `index.ts` imports from correct modules
- ✅ `initializeApp({ credential: applicationDefault() })` pattern used
- ✅ Local build succeeds (`npm run build`)
- ✅ No runtime import errors (`node --check lib/index.js`)

### Orchestrator ADK Compliance

- ✅ `OrchestratorWrapper` class created
- ✅ Has synchronous `query(**kwargs)` method
- ✅ Returns JSON-serializable `dict`
- ✅ Deployment script pins `cloudpickle==3.1.1`
- ✅ Smoke tests pass (`python3 scripts/smoke_orchestrator.py`)

### Documentation

- ✅ This 6767 SOP document created
- ✅ Explains ESM import patterns
- ✅ Explains ADK wrapper contract
- ✅ Provides validation steps
- ✅ Documents known issues
- ✅ Explicit note about Gen2 deployment pause

---

## References

**Local Documentation:**
- Investigation AAR: `000-docs/0024-AA-AAR-functions-gen2-investigation.md`
- Complete project status: `000-docs/0027-DR-EXEC-complete-project-status.md`
- TODO tracker: `000-docs/0018-PM-TODO-tracker.md`

**External Resources:**
- Firebase Functions Gen2: https://firebase.google.com/docs/functions/beta/get-started-2nd-gen
- Vertex AI Reasoning Engines: https://cloud.google.com/vertex-ai/docs/reasoning-engine
- GitHub Support Repo: https://github.com/jeremylongshore/firebase-gen2-buildpack-failure

---

**Document Status:** ✅ Complete
**Last Updated:** 2025-11-02
**Next Review:** After Google Support resolves Cloud Build issue
