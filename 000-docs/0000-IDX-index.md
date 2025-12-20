# Document Index - PipelinePilot

**Last Updated:** 2025-11-02T01:15:00Z

---

## Project Management (PM)

- **0018-PM-TODO-tracker.md** - Firebase Functions Gen2 deployment investigation TODO tracker
  - Status: BLOCKED - Phase D complete, requires GCP Support

---

## Testing & Quality (TQ)

- **0019-TQ-SMK-dev-engine.txt** - Smoke test results for orchestrator dev engine
  - Status: Pending deployment success

- **0023-TQ-BUILD-logs.txt** - Cloud Build logs from deployment attempts
  - Contains: Deployment output from ESM, CommonJS, and minimal hello attempts
  - Finding: Logs remain largely inaccessible despite permissions

---

## After Action Reviews (AA)

- **0024-AA-AAR-functions-gen2-investigation.md** - Comprehensive investigation AAR
  - **CRITICAL:** Detailed analysis of Firebase Functions Gen2 deployment failures
  - Finding: Systemic Cloud Build/infrastructure issue, NOT code-related
  - Recommendation: Escalate to GCP Support with Build IDs
  - Build IDs documented: dee392d6-a308-4e92-ba60-be20b8404fe5 (+ 3 others)

---

## Status Summary

🔴 **BLOCKED** - Firebase Functions Gen2 deployment fails at Cloud Build buildpack stage (exit code 1) for ALL functions, including minimal hello world. Issue is confirmed to be systemic infrastructure problem, NOT code-related.

**Next Action:** User must open GCP Support case (Priority: P2) with Build IDs and AAR.
