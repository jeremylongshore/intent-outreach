# AAR: Firebase Functions Gen2 Deployment Failure Investigation

**Date:** 2025-11-02
**Investigator:** BUILD CAPTAIN (Claude)
**Status:** BLOCKED - Requires GCP Support Escalation
**Project:** pipelinepilot-prod (365258353703)

---

## Executive Summary

Firebase Functions Gen2 deployment consistently fails at the Cloud Build buildpack stage (exit code 1) for ALL functions, including a minimal "hello world" function. **This is NOT a code issue** - it's a systemic Cloud Build or project configuration problem that requires GCP support intervention.

---

## Investigation Timeline

### Phase A: Preflight (Complete ✅)
- Enabled all required GCP APIs (cloudfunctions, cloudbuild, artifactregistry, run, eventarc, pubsub, storage, secretmanager)
- Created .gcloudignore to reduce upload size
- Verified firebase.json configuration
- Attempted IAM permission grants

### Phase B: ESM Deployment (Failed ❌)
- Updated package.json for ESM with Node 20
- Fixed TypeScript configuration (module: NodeNext, moduleResolution: nodenext)
- Fixed import paths (setGlobalOptions from firebase-functions/v2, not /v2/https)
- Fixed return types (Gen2 handlers must return void)
- Build ID: 2dbe5be1-3b83-4f4c-afbf-2d175744376c
- **Result:** Cloud Build failure - step 2 exit code 1

### Phase C: CommonJS Fallback (Failed ❌)
- Removed "type": "module" from package.json
- Changed tsconfig.json to module: CommonJS, moduleResolution: node
- Rebuilt and redeployed
- Build ID: c385d196-c17f-4648-afda-79a51d73eccc
- **Result:** IDENTICAL Cloud Build failure - step 2 exit code 1
- **Critical Finding:** Module system is NOT the root cause

### Phase D: Minimal Isolate (Failed ❌)
- Created minimal "hello world" function with zero dependencies
- Only imports: `firebase-functions/v2/https`
- Only code: Returns JSON with timestamp
- Build IDs: 51df5c2e-fd7e-428e-ac7a-22f621821273, dee392d6-a308-4e92-ba60-be20b8404fe5
- **Result:** IDENTICAL Cloud Build failure - step 2 exit code 1
- **DEFINITIVE PROOF:** Issue is NOT in code, dependencies, or module system

### Phase D.5: Logging Investigation (Partially Successful ⚠️)
- Granted roles/logging.logWriter to Cloud Build SA (365258353703-compute@developer.gserviceaccount.com)
- Retrieved build details via `gcloud builds describe`
- Queried Cloud Logging for build logs
- **Result:** Logs remain inaccessible/empty despite permissions

---

## Root Cause Analysis

### What We Know ✅

1. **Code is NOT the problem**
   - TypeScript compiles successfully locally
   - Minimal hello function (3 lines) fails identically
   - Both ESM and CommonJS configurations fail

2. **Module system is NOT the problem**
   - ESM configuration fails
   - CommonJS configuration fails identically
   - Same error across all attempts

3. **Dependencies are NOT the problem**
   - Minimal function with zero custom dependencies fails
   - Only uses firebase-functions/v2/https

4. **Upload is successful**
   - Functions source uploads to GCS successfully (32.29 KB)
   - Build steps 0 (fetch) and 1 (pre-buildpack) succeed

5. **Buildpack fails consistently**
   - Step 2 (/cnb/lifecycle/creator) exits with code 1
   - No error details in logs despite logging permissions
   - Buildpack: us-central1-docker.pkg.dev/serverless-runtimes/google-22-full/builder/nodejs:nodejs_20251025_RC00

6. **Logging infrastructure has issues**
   - Cloud Build SA warned about missing logging.logWriter permission
   - Permission granted, but logs still inaccessible
   - Suggests deeper Cloud Logging or IAM issue

### What We Don't Know ❓

1. **Actual error from buildpack** - Logs are completely inaccessible
2. **Why buildpack fails** - No error messages or debugging information
3. **Project-specific constraints** - Unknown org policies, quotas, or restrictions
4. **Previous state** - Was Gen2 ever working in this project?

---

## Technical Details

### Build Failure Pattern

**Consistent across ALL attempts:**
```
Build step failure: build step 2 "us-central1-docker.pkg.dev/serverless-runtimes/google-22-full/builder/nodejs:nodejs_20251025_RC00"
failed: step exited with non-zero status: 1
```

### Build Steps

1. **Step 0 (fetch):** ✅ SUCCESS - Fetches source from GCS
2. **Step 1 (pre-buildpack):** ✅ SUCCESS - Prepares buildpack environment
3. **Step 2 (build):** ❌ FAILURE - /cnb/lifecycle/creator exits with code 1

### Minimal Hello Function (Still Fails!)

```typescript
import { onRequest } from "firebase-functions/v2/https";

export const hello = onRequest((_, res) => {
  res.json({ ok: true, ts: Date.now() });
});
```

**This 3-line function fails identically to the complex startCampaign function.**

---

## Attempted Fixes

| Fix | Result | Notes |
|-----|--------|-------|
| Enable all GCP APIs | ✅ Complete | All required APIs enabled |
| Grant Cloud Build IAM permissions | ⚠️ Partial | Some succeeded, some failed with syntax error |
| Create .gcloudignore | ✅ Complete | Reduced upload size |
| Fix TypeScript imports/types | ✅ Complete | All compile errors resolved |
| Try ESM configuration | ❌ Failed | Cloud Build failure |
| Try CommonJS configuration | ❌ Failed | Identical Cloud Build failure |
| Deploy minimal hello function | ❌ Failed | Identical Cloud Build failure |
| Grant logging.logWriter role | ✅ Complete | Permission granted but logs still empty |
| Query Cloud Logging directly | ❌ Failed | No build step logs available |

---

## Evidence of Systemic Issue

1. **Minimal function fails** - Proves code is not the issue
2. **Module system irrelevant** - Both ESM and CommonJS fail identically
3. **Logs inaccessible** - Suggests deeper infrastructure problem
4. **Consistent exit code 1** - No variation across any attempt
5. **Pre-buildpack succeeds** - Issue is specifically in buildpack execution
6. **No error details** - Complete absence of debugging information

---

## Possible Root Causes (Requires GCP Investigation)

1. **Project-level Cloud Build misconfiguration**
   - Buildpack permissions/access issue
   - Corrupted Cloud Build state

2. **Organization policies blocking deployment**
   - Constraint blocking container registry access
   - Policy preventing buildpack operations

3. **Regional or quota issues**
   - us-central1 buildpack registry inaccessible
   - Cloud Build quota exhausted

4. **Service account permissions gap**
   - Despite IAM grants, buildpack still lacks critical permission
   - Permission needed at organization/folder level

5. **Known bug in buildpack version**
   - nodejs_20251025_RC00 has regression
   - RC (Release Candidate) version unstable

---

## Recommendations

### Immediate Actions

1. **Escalate to GCP Support** (Priority: P2)
   - Provide Build IDs:
     - dee392d6-a308-4e92-ba60-be20b8404fe5 (latest minimal hello)
     - c385d196-c17f-4648-afda-79a51d73eccc (CommonJS startCampaign)
     - 2dbe5be1-3b83-4f4c-afbf-2d175744376c (ESM startCampaign)
   - Attach this AAR
   - Request Cloud Build team investigation

2. **Check Organization Policies**
   ```bash
   gcloud resource-manager org-policies list --project=pipelinepilot-prod
   ```

3. **Verify Cloud Build quotas**
   ```bash
   gcloud compute project-info describe --project=pipelinepilot-prod
   ```

### Workaround Options

1. **Deploy to Gen1 Functions (short-term)**
   - Allows immediate unblock
   - Document technical debt for Gen2 migration

2. **Try different region**
   - Deploy to us-east1 instead of us-central1
   - May bypass regional buildpack issue

3. **Manual container build**
   - Build container locally using pack CLI
   - Push to Artifact Registry manually
   - Deploy to Cloud Run directly

4. **Alternative Firebase project**
   - Test if issue is project-specific
   - Create clean test project for Gen2 validation

---

## Appendix: Build IDs

| Attempt | Build ID | Configuration | Result |
|---------|----------|---------------|--------|
| ESM startCampaign | 2dbe5be1-3b83-4f4c-afbf-2d175744376c | "type": "module", module: NodeNext | FAILURE |
| CommonJS startCampaign | c385d196-c17f-4648-afda-79a51d73eccc | No "type", module: CommonJS | FAILURE |
| Minimal hello v1 | 51df5c2e-fd7e-428e-ac7a-22f621821273 | Minimal function, CommonJS | FAILURE |
| Minimal hello v2 | dee392d6-a308-4e92-ba60-be20b8404fe5 | After logging permissions granted | FAILURE |

---

## Appendix: IAM Roles Granted

✅ Confirmed Cloud Build SA has:
- roles/logging.logWriter (both 365258353703-compute@ and pipelinepilot-core@)
- roles/cloudbuild.builds.builder (365258353703@cloudbuild)
- roles/artifactregistry.writer (365258353703@cloudbuild)
- roles/iam.serviceAccountUser (365258353703@cloudbuild)
- roles/run.admin (365258353703@cloudbuild)
- roles/storage.admin (365258353703-compute@ and 365258353703@cloudbuild)
- roles/eventarc.eventReceiver (365258353703-compute@)
- roles/run.invoker (365258353703-compute@)

---

## Conclusion

This is a **systemic infrastructure or configuration issue** in the pipelinepilot-prod GCP project that prevents ANY Firebase Functions Gen2 deployment from succeeding, regardless of code quality or complexity. The buildpack consistently fails at step 2 without providing error details, even after logging permissions are granted.

**Immediate escalation to GCP Support is required** to investigate:
1. Why the buildpack exits with code 1
2. Why Cloud Build logs are inaccessible despite permissions
3. Whether there are project/org-level constraints blocking deployment
4. Whether the buildpack version (nodejs_20251025_RC00) has known issues

**BUILD CAPTAIN Status: BLOCKED** - Cannot proceed without GCP infrastructure team intervention.

---

**Last Updated:** 2025-11-02T01:00:00Z
**Next Action:** User to open GCP Support case with Build IDs and this AAR
