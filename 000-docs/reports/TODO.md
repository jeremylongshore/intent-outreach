# BUILD CAPTAIN - Deployment Plan

**Date:** 2025-11-01
**Branch:** fix/orchestrator-in-engine
**Phase:** Deploy dev Engine + end-to-end integration
**Status:** IN PROGRESS

---

## UltraThink Plan

### Objective
Deploy single orchestrator ADK agent with all 4 function tools to Vertex AI Agent Engine, wire Firebase Functions, prove end-to-end with smoke test.

### Non-Negotiables
- ✅ ADK Python only (`google.adk.agents.Agent`)
- ✅ No stubs, no agent-to-agent calls, no YAML
- ✅ Secret Manager for all API keys
- ✅ Enable tracing
- ✅ Don't merge to main

---

## Execution Checkpoints

### Phase 1: Code Implementation ⏳
- [ ] 1.1 Review existing `src/agents/tools.py`
- [ ] 1.2 Update tools with proper Secret Manager + error handling
- [ ] 1.3 Review existing `src/agents/orchestrator.py`
- [ ] 1.4 Update to use ADK `Agent` (not `Queryable` stub)
- [ ] 1.5 Review existing `src/deploy_orchestrator.py`
- [ ] 1.6 Update with `enable_tracing=True`, scaling config, labels

### Phase 2: Deployment 🚀
- [ ] 2.1 Set environment variables (PROJECT_ID, LOCATION, SERVICE_ACCOUNT)
- [ ] 2.2 Deploy orchestrator: `python src/deploy_orchestrator.py`
- [ ] 2.3 Capture Engine resource ID from output
- [ ] 2.4 Save Engine ID to `000-docs/ids.md`

### Phase 3: Functions Integration 🔌
- [ ] 3.1 Install Functions dependencies (google-auth-library, node-fetch)
- [ ] 3.2 Set Functions config: `agents.orchestrator_dev_id`
- [ ] 3.3 Deploy Functions: `firebase deploy --only functions`

### Phase 4: Smoke Testing 🧪
- [ ] 4.1 Create `scripts/smoke.sh`
- [ ] 4.2 Run smoke test
- [ ] 4.3 Verify tool calls: Clay, Apollo, Clearbit, Crunchbase
- [ ] 4.4 Save results to `000-docs/reports/smoke/dev-engine.txt`

### Phase 5: Documentation & CI 📝
- [ ] 5.1 Update `000-docs/000-INDEX.md`
- [ ] 5.2 Verify `.github/workflows/policy.yml` passes
- [ ] 5.3 Commit all changes
- [ ] 5.4 Update PR #2 or create new PR

---

## Expected Outputs

**Files to create/update:**
1. `src/agents/tools.py` - 4 async functions with Secret Manager
2. `src/agents/orchestrator.py` - ADK Agent with all tools
3. `src/deploy_orchestrator.py` - Deploy with tracing + labels
4. `000-docs/ids.md` - Engine ID record
5. `scripts/smoke.sh` - Smoke test script
6. `000-docs/reports/smoke/dev-engine.txt` - Test results
7. `000-docs/000-INDEX.md` - Updated index

**Deliverables:**
- ✅ Deployed Engine ID
- ✅ Functions config set
- ✅ Smoke test passed
- ✅ PR ready for review (not merged)

---

## Progress Tracking

**Started:** 2025-11-01 16:30 UTC
**Current Phase:** Phase 1 - Code Implementation
**Blockers:** None
**Next Action:** Review existing implementation
