# PipelinePilot ADK Migration - TODO Checklist

**Migration Captain:** Claude Code
**Start Time:** 2025-11-01 06:35 UTC
**Target:** Deploy Python ADK agents to Vertex AI Agent Engine

---

## PHASE 1: AUDIT & SETUP (30 min)
- [x] Create TODO.md checklist
- [ ] Run audit for YAML agents and banned imports
- [ ] Verify migration branch exists
- [ ] Document current state in audit report

**Status:** In progress
**Blockers:** None

---

## PHASE 2: FIX AGENT DEPLOYMENT (1 hour)
- [ ] Fix `src/deploy.py` with correct ReasoningEngine API
- [ ] Create GCP bootstrap script
- [ ] Run bootstrap (enable APIs, create SA, grant IAM)
- [ ] Deploy agents to Vertex AI Agent Engine
- [ ] Capture reasoning engine IDs
- [ ] Create smoke test script
- [ ] Run smoke test and verify traces

**Status:** Not started
**Blockers:** Waiting for Phase 1

---

## PHASE 3: FIREBASE FUNCTIONS GEN1 SHIM (1 hour)
- [ ] Downgrade to firebase-functions v4.9.0
- [ ] Update package.json engines to Node 18
- [ ] Convert imports to Gen1 syntax
- [ ] Create HTTPS endpoint calling Agent Engine :streamQuery
- [ ] Wire results to Firestore
- [ ] Set functions config with reasoning engine ID
- [ ] Deploy functions
- [ ] Test dashboard → functions → agents → Firestore flow

**Status:** Not started
**Blockers:** Need reasoning engine ID from Phase 2

---

## PHASE 4: CI GUARDS (30 min)
- [ ] Create .github/workflows/adk-guard.yml
- [ ] Create .github/workflows/arv-gate.yml
- [ ] Test guards locally
- [ ] Verify guards pass on migration branch

**Status:** Not started
**Blockers:** None (can run in parallel)

---

## PHASE 5: DOCUMENTATION (30 min)
- [ ] Create ADR-0001-adopt-vertex-adk.md
- [ ] Create adk_migration_AAR.md with trace IDs
- [ ] Create secrets.md with required keys
- [ ] Create runbook.md for deploy/rollback
- [ ] Update audit report with findings
- [ ] Update 000-INDEX.md

**Status:** Not started
**Blockers:** Need deployment artifacts from Phase 2-3

---

## PHASE 6: PR & VERIFICATION (30 min)
- [ ] Commit all changes
- [ ] Push migration branch
- [ ] Open PR with structured body
- [ ] Verify CI passes
- [ ] Document final engine IDs and URLs
- [ ] Mark PR ready for review (DO NOT MERGE)

**Status:** Not started
**Blockers:** All previous phases

---

## TOTAL ESTIMATED TIME: 3.5 hours

**Current Phase:** Phase 1 - Audit & Setup
**Next Action:** Run forbidden patterns audit
