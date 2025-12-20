# Phase 3: Secret Manager Automation - Test Examples

**Date:** 2025-11-02
**Phase:** 3 of 5 - Secret Manager Automation
**Purpose:** Test tenant secret creation, validation, and automation

---

## Environment Setup

Replace these values with your actual deployment:

```bash
# Firebase Function URLs (after deployment)
export AUDIT_ON_DEMAND_URL="https://us-central1-pipelinepilot-prod.cloudfunctions.net/auditTenantSecretsOnDemand"
export AUDIT_SINGLE_URL="https://us-central1-pipelinepilot-prod.cloudfunctions.net/auditSingleTenant"
export START_CAMPAIGN_URL="https://us-central1-pipelinepilot-prod.cloudfunctions.net/startCampaign"

# Test tenant ID (must exist in Firestore /tenants/)
export TEST_TENANT="tenant_abc12345"

# GCP Project
export PROJECT_ID="pipelinepilot-prod"
```

---

## Test 1: Run On-Demand Audit for All Tenants ✅

**Purpose:** Trigger audit job to create/verify secrets for all active tenants

```bash
curl -X POST "$AUDIT_ON_DEMAND_URL" \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "ok": true,
  "message": "Tenant secret audit complete",
  "report": {
    "timestamp": "2025-11-02T22:30:00Z",
    "tenantsChecked": 5,
    "tenantsHealthy": 2,
    "tenantsMissingSecrets": 0,
    "tenantsWithPlaceholders": 3,
    "tenantsWithErrors": 0,
    "details": [
      {
        "tenantId": "tenant_abc12345",
        "status": "placeholder",
        "missing": [],
        "placeholders": ["CLAY", "APOLLO", "CLEARBIT", "CRUNCHBASE"],
        "errors": []
      }
    ]
  }
}
```

**Verify Secrets Created:**
```bash
# List all tenant secrets
gcloud secrets list --project=$PROJECT_ID | grep "TENANT_$TEST_TENANT"

# Expected output (4 secrets per tenant):
# TENANT_tenant_abc12345_CLAY_API_KEY
# TENANT_tenant_abc12345_APOLLO_API_KEY
# TENANT_tenant_abc12345_CLEARBIT_API_KEY
# TENANT_tenant_abc12345_CRUNCHBASE_API_KEY
```

---

## Test 2: Audit a Single Tenant ✅

**Purpose:** Verify secrets for a specific tenant

```bash
curl -X POST "$AUDIT_SINGLE_URL?tenantId=$TEST_TENANT" \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "ok": true,
  "tenantId": "tenant_abc12345",
  "result": {
    "allConfigured": false,
    "secrets": {
      "CLAY": "placeholder",
      "APOLLO": "placeholder",
      "CLEARBIT": "placeholder",
      "CRUNCHBASE": "placeholder"
    },
    "missing": [],
    "placeholders": ["CLAY", "APOLLO", "CLEARBIT", "CRUNCHBASE"],
    "errors": []
  }
}
```

---

## Test 3: Check Secret Health in Firestore ✅

**Purpose:** Verify secret health was written to Firestore

```bash
# Get secret health document
gcloud firestore documents describe \
  "tenants/$TEST_TENANT/config/secrets" \
  --project=$PROJECT_ID
```

**Expected Output:**
```yaml
fields:
  CLAY:
    stringValue: placeholder
  APOLLO:
    stringValue: placeholder
  CLEARBIT:
    stringValue: placeholder
  CRUNCHBASE:
    stringValue: placeholder
  allConfigured:
    booleanValue: false
  checkedAt:
    timestampValue: '2025-11-02T22:30:00Z'
```

---

## Test 4: Verify IAM Bindings on Secrets ✅

**Purpose:** Ensure both Cloud Functions SA and Vertex AI RE SA have access

```bash
# Check IAM policy for one secret
gcloud secrets get-iam-policy \
  "TENANT_${TEST_TENANT}_CLAY_API_KEY" \
  --project=$PROJECT_ID
```

**Expected Output:**
```yaml
bindings:
- members:
  - serviceAccount:365258353703-compute@developer.gserviceaccount.com
  - serviceAccount:service-365258353703@gcp-sa-aiplatform-re.iam.gserviceaccount.com
  role: roles/secretmanager.secretAccessor
etag: ...
version: 1
```

---

## Test 5: Try Campaign with Placeholder Secrets ❌

**Purpose:** Verify Vertex call is blocked when secrets are placeholders

```bash
curl -X POST "$START_CAMPAIGN_URL" \
  -H "x-tenant-id: $TEST_TENANT" \
  -H "Content-Type: application/json" \
  -d '{
    "campaignId": "test_placeholder_secrets",
    "icp": "B2B SaaS",
    "domains": ["test.com"],
    "email": "test@test.com"
  }'
```

**Expected Response (422 Unprocessable Entity):**
```json
{
  "ok": false,
  "error": "TENANT_SECRETS_INCOMPLETE",
  "message": "Tenant tenant_abc12345 is missing required API keys. Missing: . Placeholders: CLAY, APOLLO, CLEARBIT, CRUNCHBASE. Please configure these secrets in Secret Manager.",
  "tenantId": "tenant_abc12345",
  "missing": [],
  "placeholders": ["CLAY", "APOLLO", "CLEARBIT", "CRUNCHBASE"]
}
```

---

## Test 6: Configure a Real Secret Value ✅

**Purpose:** Replace placeholder with real API key

```bash
# Update one secret with real value
echo -n "sk_live_YOUR_REAL_CLAY_API_KEY" | \
  gcloud secrets versions add "TENANT_${TEST_TENANT}_CLAY_API_KEY" \
    --data-file=- \
    --project=$PROJECT_ID
```

**Verify New Version:**
```bash
# List versions
gcloud secrets versions list \
  "TENANT_${TEST_TENANT}_CLAY_API_KEY" \
  --project=$PROJECT_ID

# Expected: 2 versions (placeholder + real)
```

**Run Audit Again:**
```bash
curl -X POST "$AUDIT_SINGLE_URL?tenantId=$TEST_TENANT" \
  -H "Content-Type: application/json"
```

**Expected Response (CLAY now shows "ok"):**
```json
{
  "ok": true,
  "tenantId": "tenant_abc12345",
  "result": {
    "allConfigured": false,
    "secrets": {
      "CLAY": "ok",
      "APOLLO": "placeholder",
      "CLEARBIT": "placeholder",
      "CRUNCHBASE": "placeholder"
    },
    "missing": [],
    "placeholders": ["APOLLO", "CLEARBIT", "CRUNCHBASE"],
    "errors": []
  }
}
```

---

## Test 7: Configure All Secrets ✅

**Purpose:** Set all 4 secrets to real values

```bash
# Update all secrets
echo -n "sk_live_REAL_CLAY_KEY" | \
  gcloud secrets versions add "TENANT_${TEST_TENANT}_CLAY_API_KEY" --data-file=- --project=$PROJECT_ID

echo -n "sk_live_REAL_APOLLO_KEY" | \
  gcloud secrets versions add "TENANT_${TEST_TENANT}_APOLLO_API_KEY" --data-file=- --project=$PROJECT_ID

echo -n "sk_live_REAL_CLEARBIT_KEY" | \
  gcloud secrets versions add "TENANT_${TEST_TENANT}_CLEARBIT_API_KEY" --data-file=- --project=$PROJECT_ID

echo -n "sk_live_REAL_CRUNCHBASE_KEY" | \
  gcloud secrets versions add "TENANT_${TEST_TENANT}_CRUNCHBASE_API_KEY" --data-file=- --project=$PROJECT_ID
```

**Run Audit:**
```bash
curl -X POST "$AUDIT_SINGLE_URL?tenantId=$TEST_TENANT" \
  -H "Content-Type: application/json"
```

**Expected Response (all "ok"):**
```json
{
  "ok": true,
  "tenantId": "tenant_abc12345",
  "result": {
    "allConfigured": true,
    "secrets": {
      "CLAY": "ok",
      "APOLLO": "ok",
      "CLEARBIT": "ok",
      "CRUNCHBASE": "ok"
    },
    "missing": [],
    "placeholders": [],
    "errors": []
  }
}
```

---

## Test 8: Campaign with Configured Secrets ✅

**Purpose:** Verify Vertex call succeeds when all secrets configured

```bash
curl -X POST "$START_CAMPAIGN_URL" \
  -H "x-tenant-id: $TEST_TENANT" \
  -H "Content-Type: application/json" \
  -d '{
    "campaignId": "test_configured_secrets",
    "icp": "B2B SaaS",
    "domains": ["example.com"],
    "email": "contact@example.com"
  }'
```

**Expected Response (200 OK):**
```json
{
  "ok": true,
  "tenantId": "tenant_abc12345",
  "campaignId": "test_configured_secrets",
  "runId": "xyz123...",
  "result": {
    "output": "..."
  }
}
```

---

## Test 9: Check Audit Logs in Firestore ✅

**Purpose:** Verify audit activities are logged

```bash
# List recent audit logs
gcloud firestore documents list \
  --collection-id=tenant_audit \
  --project=$PROJECT_ID \
  --limit=5 \
  --order-by=timestamp
```

**Expected Entries:**
```yaml
- action: secret_audit
  timestamp: 2025-11-02T22:30:00Z
  source: tenant_secret_audit_job
  summary:
    tenantsChecked: 5
    tenantsHealthy: 2
    ...

- tenant_id: tenant_abc12345
  action: secret_audit_single
  timestamp: 2025-11-02T22:35:00Z
  source: audit_single_tenant_endpoint
  ...
```

---

## Test 10: Rotate a Secret for One Tenant ✅

**Purpose:** Update a secret without affecting other tenants

```bash
# Generate new API key (example)
NEW_CLAY_KEY="sk_live_NEW_ROTATED_KEY"

# Add new version to specific tenant's secret
echo -n "$NEW_CLAY_KEY" | \
  gcloud secrets versions add "TENANT_${TEST_TENANT}_CLAY_API_KEY" \
    --data-file=- \
    --project=$PROJECT_ID

# Verify new version is latest
gcloud secrets versions list \
  "TENANT_${TEST_TENANT}_CLAY_API_KEY" \
  --project=$PROJECT_ID
```

**Expected:** New version is state:ENABLED, older versions remain but are not used.

**Verify Other Tenants Unaffected:**
```bash
# List secrets for different tenant
gcloud secrets list --project=$PROJECT_ID | grep "TENANT_tenant_xyz98765"

# Should only show tenant_xyz98765 secrets, not affected by tenant_abc12345 rotation
```

---

## Test 11: Scheduled Audit (Manual Trigger)

**Purpose:** Verify scheduled function can be manually triggered

```bash
# Using Firebase CLI
firebase functions:call auditTenantSecretsScheduled \
  --project=pipelinepilot-prod

# Or using gcloud
gcloud scheduler jobs run tenant-secret-audit \
  --location=us-central1 \
  --project=pipelinepilot-prod
```

**Check Logs:**
```bash
gcloud functions logs read auditTenantSecretsScheduled \
  --region=us-central1 \
  --project=pipelinepilot-prod \
  --limit=50
```

**Expected Log Entries:**
```
[TENANT-SECRET-AUDIT] Starting scheduled audit
[TENANT-SECRET-AUDIT] Found 5 active tenants
[TENANT-SECRET-AUDIT] Processing tenant: tenant_abc12345
[TENANT-SECRETS] Ensuring secrets for tenant: tenant_abc12345
[TENANT-SECRETS] Secret exists: TENANT_tenant_abc12345_CLAY_API_KEY
[TENANT-SECRETS] Secret is configured: TENANT_tenant_abc12345_CLAY_API_KEY
...
[TENANT-SECRET-AUDIT] Scheduled audit complete
```

---

## Test 12: Multi-Tenant Secret Isolation ✅

**Purpose:** Verify tenants cannot access each other's secrets

**Setup:**
```bash
export TENANT_1="tenant_abc12345"
export TENANT_2="tenant_xyz98765"

# Ensure both tenants have secrets
curl -X POST "$AUDIT_SINGLE_URL?tenantId=$TENANT_1"
curl -X POST "$AUDIT_SINGLE_URL?tenantId=$TENANT_2"
```

**Verify IAM Isolation:**
```bash
# Tenant 1's secret should NOT grant access to Tenant 2
gcloud secrets get-iam-policy \
  "TENANT_${TENANT_1}_CLAY_API_KEY" \
  --project=$PROJECT_ID

# Should only show:
# - Cloud Functions SA (project-wide)
# - Vertex AI RE SA (project-wide)
# NO tenant-specific service accounts
```

**Verify Namespace Isolation:**
```bash
# Each tenant has distinct secrets
gcloud secrets describe "TENANT_${TENANT_1}_CLAY_API_KEY" --project=$PROJECT_ID
gcloud secrets describe "TENANT_${TENANT_2}_CLAY_API_KEY" --project=$PROJECT_ID

# Should be two separate secrets with different names
```

---

## Monitoring Commands

### View Audit Function Logs
```bash
# On-demand audit logs
gcloud functions logs read auditTenantSecretsOnDemand \
  --region=us-central1 \
  --project=pipelinepilot-prod \
  --limit=50

# Scheduled audit logs
gcloud functions logs read auditTenantSecretsScheduled \
  --region=us-central1 \
  --project=pipelinepilot-prod \
  --limit=50

# Single tenant audit logs
gcloud functions logs read auditSingleTenant \
  --region=us-central1 \
  --project=pipelinepilot-prod \
  --limit=50
```

### Check Secret Status
```bash
# List all tenant secrets
gcloud secrets list --project=$PROJECT_ID | grep "TENANT_"

# Count secrets per tenant
gcloud secrets list --project=$PROJECT_ID | grep "TENANT_${TEST_TENANT}" | wc -l
# Expected: 4 (one per provider)

# Check secret versions
for provider in CLAY APOLLO CLEARBIT CRUNCHBASE; do
  echo "=== $provider ==="
  gcloud secrets versions list \
    "TENANT_${TEST_TENANT}_${provider}_API_KEY" \
    --project=$PROJECT_ID \
    --limit=3
done
```

### Check Firestore Health Documents
```bash
# List all tenant secret health docs
gcloud firestore documents list \
  --collection-path="tenants/$TEST_TENANT/config" \
  --project=$PROJECT_ID

# Get specific health doc
gcloud firestore documents describe \
  "tenants/$TEST_TENANT/config/secrets" \
  --project=$PROJECT_ID
```

---

## Troubleshooting

### Issue: "TENANT_SECRETS_INCOMPLETE" on valid tenant

**Cause:** Secrets exist but have placeholder values

**Fix:**
```bash
# Update all secrets with real values
for provider in CLAY APOLLO CLEARBIT CRUNCHBASE; do
  echo -n "sk_live_REAL_${provider}_KEY" | \
    gcloud secrets versions add "TENANT_${TEST_TENANT}_${provider}_API_KEY" \
      --data-file=- \
      --project=$PROJECT_ID
done

# Run audit to update health
curl -X POST "$AUDIT_SINGLE_URL?tenantId=$TEST_TENANT"
```

### Issue: "Permission denied" creating secrets

**Cause:** Cloud Functions SA lacks Secret Manager permissions

**Fix:**
```bash
# Grant secretmanager.admin for secret creation
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:365258353703-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.admin"
```

### Issue: Audit function times out

**Cause:** Too many tenants to process in single execution

**Fix:**
- Increase function memory: `memory: "1GiB"`
- Increase timeout: `timeout: 540` (9 minutes)
- Process tenants in batches

### Issue: Secret health not updated in Firestore

**Cause:** Firestore rules block writes

**Fix:**
```bash
# Ensure rules allow Functions to write /config/secrets
# Functions use admin SDK which bypasses rules, so this shouldn't happen

# Check Firestore rules deployment
firebase deploy --only firestore:rules --project=$PROJECT_ID
```

---

## Success Criteria Checklist

Phase 3 is complete when ALL tests pass:

- [ ] **Test 1**: On-demand audit creates secrets for all tenants
- [ ] **Test 2**: Single tenant audit works correctly
- [ ] **Test 3**: Secret health written to Firestore `/config/secrets`
- [ ] **Test 4**: Both SAs have `secretAccessor` role on all secrets
- [ ] **Test 5**: Campaign blocked with placeholder secrets (422)
- [ ] **Test 6**: Updating one secret changes status from placeholder to ok
- [ ] **Test 7**: All 4 secrets configured shows `allConfigured: true`
- [ ] **Test 8**: Campaign succeeds with all secrets configured (200)
- [ ] **Test 9**: Audit actions logged to `/tenant_audit/`
- [ ] **Test 10**: Secret rotation for one tenant doesn't affect others
- [ ] **Test 11**: Scheduled audit runs successfully
- [ ] **Test 12**: Tenants have isolated secrets (no cross-access)

---

**Document Status:** ✅ Complete
**Author:** Build Captain (Claude Code)
**Phase:** 3 - Secret Manager Automation
**Next:** Deploy and test before Phase 4
