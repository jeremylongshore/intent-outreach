# TODO Tracker

**Last Updated:** 2025-11-01
**Branch:** fix/orchestrator-in-engine
**Status:** In Progress

---

## BUILD CAPTAIN Checklist

### Phase 1: Core Implementation ✅

- [x] **Orchestrator Agent** - Python ADK agent with 4 tools
  - Completed: 2025-11-01 16:45:00
  - File: `src/agents/orchestrator.py`
  - Agent name fixed: `pipelinepilot_orchestrator` (valid Python identifier)

- [x] **Agent Tools** - Real async function tools (no stubs)
  - Completed: 2025-11-01 16:30:00
  - File: `src/agents/tools.py`
  - Tools: clay_lookup, apollo_people, clearbit_enrich, crunchbase_company
  - Secret Manager integration added

- [x] **Deployment Script** - Self-contained inline deployment
  - Completed: 2025-11-01 17:00:00
  - File: `src/deploy_orchestrator_inline.py`
  - Pattern: All code inlined, no external module imports
  - Wrapper class: `OrchestratorWrapper` with `query()` method

- [x] **Deploy to Agent Engine** - Dev environment deployment
  - Completed: 2025-11-01 17:10:04
  - Engine ID: `projects/365258353703/locations/us-central1/reasoningEngines/5660167112535048192`
  - Model: gemini-2.0-flash-exp
  - Status: ✅ Deployed and operational

- [x] **Firebase Functions Config** - Set orchestrator_dev_id
  - Completed: 2025-11-01 17:15:00
  - Command: `firebase functions:config:set agents.orchestrator_dev_id="..."`
  - Code updated: Dev/prod routing in `index.ts`

---

### Phase 2: Documentation 🟡

- [x] **9000-IDX-index.md** - Master index
  - Completed: 2025-11-01 17:30:00

- [x] **9001-AUDT** - Migration audit (symlink)
  - Completed: 2025-11-01 17:31:00

- [x] **9002-ADR** - Architecture decision record (symlink)
  - Completed: 2025-11-01 17:31:00

- [x] **9003-RUNB** - Deployment runbook (symlink)
  - Completed: 2025-11-01 17:31:00

- [x] **9004-SEC** - Secret Manager map (symlink)
  - Completed: 2025-11-01 17:31:00

- [x] **9005-IDS-engine-ids.md** - Engine resource IDs
  - Completed: 2025-11-01 17:32:00

- [x] **9006-TODO-tracker.md** - This file
  - Completed: 2025-11-01 17:35:00

- [ ] **9007-SMK-dev-engine.txt** - Smoke test output
  - Status: Pending (awaiting smoke test execution)

- [x] **9008-POL-ci-policy-overview.md** - CI policy
  - Completed: 2025-11-01 17:36:00

- [x] **9009-ARV-gate-checks.md** - ARV gate requirements
  - Completed: 2025-11-01 17:37:00

- [x] **9010-AAR** - ADK migration AAR (symlink)
  - Completed: 2025-11-01 17:31:00

- [x] **9011-AAR** - Orchestration fix AAR (symlink)
  - Completed: 2025-11-01 17:31:00

- [x] **9012-LIM** - Agent Engine limitations (symlink)
  - Completed: 2025-11-01 17:31:00

---

### Phase 3: Integration & Testing 🔴

- [ ] **Firebase Functions Deployment** - CommonJS Gen1
  - Status: BLOCKED
  - Issue: ES module compatibility (firebase-admin v11)
  - Solution: Revert to CommonJS pattern
  - Required changes:
    1. Remove `"type": "module"` from package.json
    2. Convert imports to require()
    3. Convert exports to module.exports
    4. Update tsconfig.json to target CommonJS
  - Target: 2025-11-01 18:00:00

- [ ] **Smoke Test Script** - `scripts/smoke.sh`
  - Status: Pending
  - Requirements:
    - Query deployed Engine via REST API
    - Trigger all 4 tools (Clay, Apollo, Clearbit, Crunchbase)
    - Capture tool_call → tool_result events
    - Redirect output to `000-docs/9007-SMK-dev-engine.txt`
  - Target: 2025-11-01 18:30:00

- [ ] **Run Smoke Test**
  - Status: Pending (blocked by script creation)
  - Success criteria:
    - All 4 tools execute without errors
    - Valid responses from APIs
    - Output captured in 9007-SMK-dev-engine.txt
  - Target: 2025-11-01 18:45:00

---

### Phase 4: CI/CD 🔴

- [ ] **Create .github/workflows/policy.yml**
  - Status: Not started
  - Purpose: Block STUB, YAML agents, Genkit patterns
  - Target: 2025-11-01 19:00:00

- [ ] **Create .github/workflows/adk-guard.yml**
  - Status: Not started
  - Purpose: Enforce Python ADK only (no Genkit, Langchain, etc.)
  - Target: 2025-11-01 19:15:00

- [ ] **Create .github/workflows/arv-gate.yml**
  - Status: Not started
  - Purpose: Run ARV gate checks before merge
  - Target: 2025-11-01 19:30:00

- [ ] **Verify All CI Checks Pass**
  - Status: Not started
  - Requirements:
    - policy.yml: ✅ Pass
    - adk-guard.yml: ✅ Pass
    - arv-gate.yml: ✅ Pass
  - Target: 2025-11-01 20:00:00

---

### Phase 5: PR & Review 🔴

- [ ] **Update PR Description**
  - Status: Not started
  - Include:
    - Engine deployment details
    - Tool capabilities
    - Smoke test results
    - CI verification status
  - Target: 2025-11-01 20:15:00

- [ ] **Verify PR Status**
  - Status: Not started
  - Requirements:
    - Stacked on `fix/orchestrator-in-engine`
    - NOT merged to main
    - All CI checks passing
    - Smoke test evidence attached
  - Target: 2025-11-01 20:30:00

---

## Key Learnings

### Deployment Pattern
- **Reasoning Engine** requires objects with `query()` method
- **Wrapper pattern** necessary for ADK Agent compatibility
- **Self-contained inline** deployment most reliable (no module imports)
- **Agent names** must be valid Python identifiers (underscores, not hyphens)

### Module Import Challenges
- `extra_packages` parameter unreliable for custom modules
- Local packages not available in remote Reasoning Engine environment
- Inlining code in deployment script avoids import issues
- cloudpickle serializes all dependencies automatically

### Firebase Functions
- firebase-admin v11 + firebase-functions v4 incomplete ES module support
- CommonJS (Gen1) pattern required for compatibility
- `"type": "module"` causes initialization failures

### Tools & APIs
- Secret Manager integration for API keys
- Async httpx client for HTTP requests
- Error handling critical for API failures
- Timeout configuration prevents hanging requests

---

## Blockers

### 1. Firebase Functions ES Module Issue
**Status:** ACTIVE
**Impact:** HIGH
**Description:** Firebase Functions deployment blocked by ES module compatibility
**Solution:** Revert to CommonJS (Gen1) pattern as specified in BUILD CAPTAIN
**Owner:** In progress
**Target Resolution:** 2025-11-01 18:00:00

---

## Next Actions

1. **Fix Firebase Functions** (HIGH PRIORITY)
   - Revert ES module changes
   - Convert to CommonJS pattern
   - Deploy to Firebase

2. **Create Smoke Test Script** (HIGH PRIORITY)
   - Write `scripts/smoke.sh`
   - Query Engine REST API
   - Capture tool execution output

3. **Run Smoke Test** (HIGH PRIORITY)
   - Execute smoke.sh
   - Verify all 4 tools work
   - Capture to 9007-SMK-dev-engine.txt

4. **Create CI Workflows** (MEDIUM PRIORITY)
   - policy.yml
   - adk-guard.yml
   - arv-gate.yml

5. **Verify & Update PR** (LOW PRIORITY)
   - Ensure all checks pass
   - Update PR description
   - Confirm not merged to main

---

**Last Updated:** 2025-11-01 17:35:00
**Next Review:** After smoke test completion
