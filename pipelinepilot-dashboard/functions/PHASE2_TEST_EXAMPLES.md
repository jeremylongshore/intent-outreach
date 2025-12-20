# Phase 2: Workspace Isolation - Test Examples

**Date:** 2025-11-02
**Phase:** 2 of 5 - Tenant Workspace Isolation
**Purpose:** Test tenant authentication and isolation

---

## Environment Setup

Replace these values with your actual deployment:

```bash
# Firebase Function URL (after deployment)
export FUNCTION_URL="https://us-central1-pipelinepilot-prod.cloudfunctions.net/startCampaign"

# Test tenant ID (must exist in Firestore /tenants/)
export TEST_TENANT="tenant_abc12345"

# Non-existent tenant (for negative testing)
export FAKE_TENANT="tenant_notfound"
```

---

## Test 1: Success with x-tenant-id Header ✅

**Purpose:** Verify tenant_id in header works

```bash
curl -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: $TEST_TENANT" \
  -d '{
    "campaignId": "test_header_campaign",
    "icp": "B2B SaaS companies",
    "domains": ["example.com", "demo.com"],
    "email": "contact@example.com"
  }'
```

**Expected Response:**
```json
{
  "ok": true,
  "tenantId": "tenant_abc12345",
  "campaignId": "test_header_campaign",
  "runId": "xyz123...",
  "result": {
    "output": "..."
  }
}
```

**Firestore Verification:**
```bash
# Check that data was written to tenant-scoped collection
gcloud firestore documents list \
  --collection-id=runs \
  --filter="tenantId:tenant_abc12345" \
  --project=pipelinepilot-prod
```

---

## Test 2: Success with tenant_id in Body ✅

**Purpose:** Verify tenant_id in request body works

```bash
curl -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "'$TEST_TENANT'",
    "campaignId": "test_body_campaign",
    "icp": "Enterprise healthcare",
    "domains": ["health.com"],
    "email": "admin@health.com"
  }'
```

**Expected Response:**
```json
{
  "ok": true,
  "tenantId": "tenant_abc12345",
  "campaignId": "test_body_campaign",
  "runId": "abc456...",
  "result": {
    "output": "..."
  }
}
```

---

## Test 3: Failure - Missing tenant_id ❌

**Purpose:** Verify request is rejected without tenant_id

```bash
curl -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "campaignId": "test_no_tenant",
    "icp": "Any company",
    "domains": ["test.com"],
    "email": "test@test.com"
  }'
```

**Expected Response (400 Bad Request):**
```json
{
  "ok": false,
  "error": "TENANT_ID_REQUIRED",
  "message": "tenant_id must be provided via x-tenant-id header, request body, or auth token"
}
```

---

## Test 4: Failure - Non-Existent Tenant ❌

**Purpose:** Verify request is rejected for non-existent tenant

```bash
curl -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: $FAKE_TENANT" \
  -d '{
    "campaignId": "test_fake_tenant",
    "icp": "Test",
    "domains": ["test.com"],
    "email": "test@test.com"
  }'
```

**Expected Response (404 Not Found):**
```json
{
  "ok": false,
  "error": "TENANT_NOT_FOUND",
  "message": "Tenant 'tenant_notfound' does not exist",
  "tenantId": "tenant_notfound"
}
```

---

## Test 5: Failure - Inactive Tenant ❌

**Purpose:** Verify request is rejected for canceled/inactive tenant

**Setup:**
```bash
# First, mark tenant as canceled in Firestore
gcloud firestore documents update tenants/$TEST_TENANT \
  --project=pipelinepilot-prod \
  --update-mask="status" \
  --set=status:canceled
```

**Test:**
```bash
curl -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: $TEST_TENANT" \
  -d '{
    "campaignId": "test_inactive_tenant",
    "icp": "Test",
    "domains": ["test.com"],
    "email": "test@test.com"
  }'
```

**Expected Response (403 Forbidden):**
```json
{
  "ok": false,
  "error": "TENANT_INACTIVE",
  "message": "Tenant 'tenant_abc12345' is not active (status: canceled)",
  "tenantId": "tenant_abc12345",
  "status": "canceled"
}
```

**Cleanup:**
```bash
# Restore tenant to active status
gcloud firestore documents update tenants/$TEST_TENANT \
  --project=pipelinepilot-prod \
  --update-mask="status" \
  --set=status:active
```

---

## Test 6: Verify Tenant Isolation in Firestore

**Purpose:** Ensure data is written to correct tenant-scoped path

**Step 1:** Run successful campaign
```bash
curl -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: $TEST_TENANT" \
  -d '{
    "campaignId": "isolation_test",
    "icp": "Isolation test",
    "domains": ["isolation.com"],
    "email": "test@isolation.com"
  }'
```

**Step 2:** Verify data location
```bash
# Should return documents
gcloud firestore documents list \
  --collection-path="tenants/$TEST_TENANT/runs" \
  --project=pipelinepilot-prod

# Should return empty (no top-level campaigns collection)
gcloud firestore documents list \
  --collection-id=campaigns \
  --project=pipelinepilot-prod
```

---

## Test 7: Vertex AI Receives tenant_id

**Purpose:** Verify tenant_id is passed to Reasoning Engine

**Test:**
```bash
curl -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: $TEST_TENANT" \
  -d '{
    "campaignId": "vertex_test",
    "icp": "AI test",
    "domains": ["vertex.com"],
    "email": "test@vertex.com"
  }'
```

**Verify in Logs:**
```bash
# Check Cloud Functions logs
gcloud functions logs read startCampaign \
  --region=us-central1 \
  --project=pipelinepilot-prod \
  --limit=50

# Look for log entries showing tenant_id in Vertex payload:
# [VERTEX-TENANT] Calling Reasoning Engine for tenant: tenant_abc12345
# [VERTEX-TENANT] Payload: { "input": { "tenant_id": "tenant_abc12345", ... } }
```

---

## Test 8: Multi-Tenant Concurrency

**Purpose:** Verify multiple tenants can run simultaneously without interference

**Setup:**
```bash
# Create second test tenant
export TEST_TENANT_2="tenant_xyz98765"
```

**Run Concurrent Tests:**
```bash
# Tenant 1
curl -X POST "$FUNCTION_URL" \
  -H "x-tenant-id: tenant_abc12345" \
  -H "Content-Type: application/json" \
  -d '{"campaignId": "tenant1_campaign", "icp": "Tenant 1"}' &

# Tenant 2
curl -X POST "$FUNCTION_URL" \
  -H "x-tenant-id: tenant_xyz98765" \
  -H "Content-Type: application/json" \
  -d '{"campaignId": "tenant2_campaign", "icp": "Tenant 2"}' &

wait
```

**Verify Isolation:**
```bash
# Each tenant should have their own runs
gcloud firestore documents list \
  --collection-path="tenants/tenant_abc12345/runs" \
  --project=pipelinepilot-prod

gcloud firestore documents list \
  --collection-path="tenants/tenant_xyz98765/runs" \
  --project=pipelinepilot-prod
```

---

## Test 9: Firestore Security Rules (Client SDK)

**Purpose:** Verify client SDK respects tenant isolation rules

**Setup:** Create test Node.js script

```javascript
// test-firestore-rules.js
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { getAuth, signInWithCustomToken } from 'firebase/auth';

const app = initializeApp({
  projectId: 'pipelinepilot-prod',
  // ... other config
});

const db = getFirestore(app);
const auth = getAuth(app);

async function testTenantIsolation() {
  // Sign in with token containing tenant_id
  await signInWithCustomToken(auth, customToken); // Must have tenant_id in claims

  try {
    // Should succeed - reading own tenant
    const myTenantRef = collection(db, 'tenants', 'tenant_abc12345', 'runs');
    const mySnapshot = await getDocs(myTenantRef);
    console.log('✅ Can read own tenant:', mySnapshot.size, 'documents');

    // Should fail - reading different tenant
    const otherTenantRef = collection(db, 'tenants', 'tenant_xyz98765', 'runs');
    const otherSnapshot = await getDocs(otherTenantRef);
    console.log('❌ Should NOT reach here - cross-tenant read blocked');
  } catch (error) {
    console.log('✅ Cross-tenant read blocked:', error.code);
  }
}

testTenantIsolation();
```

---

## Success Criteria Checklist

Phase 2 is complete when ALL tests pass:

- [ ] **Test 1**: Request with `x-tenant-id` header succeeds
- [ ] **Test 2**: Request with `tenant_id` in body succeeds
- [ ] **Test 3**: Request without tenant_id returns 400
- [ ] **Test 4**: Request with non-existent tenant returns 404
- [ ] **Test 5**: Request with inactive tenant returns 403
- [ ] **Test 6**: Data written to `tenants/{tenantId}/runs` (not top-level)
- [ ] **Test 7**: Vertex AI receives `tenant_id` in payload (verify logs)
- [ ] **Test 8**: Multiple tenants can run concurrently without interference
- [ ] **Test 9**: Firestore rules block cross-tenant reads from client SDK

---

## Monitoring Commands

### View Function Logs
```bash
# Real-time logs
gcloud functions logs read startCampaign \
  --region=us-central1 \
  --project=pipelinepilot-prod \
  --limit=50 \
  --follow

# Filter for tenant validation
gcloud functions logs read startCampaign \
  --region=us-central1 \
  --project=pipelinepilot-prod \
  --limit=50 \
  | grep TENANT-AUTH
```

### Check Tenant Data
```bash
# List all runs for a tenant
gcloud firestore documents list \
  --collection-path="tenants/$TEST_TENANT/runs" \
  --project=pipelinepilot-prod

# View specific run
gcloud firestore documents describe \
  "tenants/$TEST_TENANT/runs/{runId}" \
  --project=pipelinepilot-prod
```

### Verify No Top-Level Data
```bash
# Should return empty - no top-level campaigns
gcloud firestore documents list \
  --collection-id=campaigns \
  --project=pipelinepilot-prod

# Should return empty - no top-level runs
gcloud firestore documents list \
  --collection-id=runs \
  --project=pipelinepilot-prod
```

---

## Troubleshooting

### Issue: "TENANT_ID_REQUIRED" even with header

**Cause:** Header name might be case-sensitive or misspelled

**Fix:**
```bash
# Ensure lowercase and hyphenated
-H "x-tenant-id: tenant_abc12345"

# NOT these:
# -H "X-Tenant-Id: ..."
# -H "x_tenant_id: ..."
# -H "tenantId: ..."
```

### Issue: "TENANT_NOT_FOUND" for valid tenant

**Cause:** Tenant document doesn't exist in Firestore

**Fix:**
```bash
# Create tenant manually (or use Stripe webhook from Phase 1)
gcloud firestore documents create tenants/tenant_abc12345 \
  --project=pipelinepilot-prod \
  --data='{"status":"active","plan":"pro","tier":"paid","created_at":"2025-11-02T00:00:00Z"}'
```

### Issue: Function deployment fails

**Cause:** Missing dependencies or TypeScript errors

**Fix:**
```bash
cd functions
npm install
npm run build

# Check for errors
echo $?  # Should be 0
```

---

**Document Status:** ✅ Complete
**Author:** Build Captain (Claude Code)
**Phase:** 2 - Workspace Isolation
**Next:** Deploy and test before Phase 3
