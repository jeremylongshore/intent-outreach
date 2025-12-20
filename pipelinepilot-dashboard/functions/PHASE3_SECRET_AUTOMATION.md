# Phase 3: Secret Manager Automation - Implementation Guide

**Date:** 2025-11-02
**Phase:** 3 of 5 - Secret Manager Automation
**Status:** ✅ Implemented, Ready for Deployment
**Depends On:** Phase 1 (Tenant Provisioning), Phase 2 (Workspace Isolation)

---

## Overview

Phase 3 automates per-tenant secret management in Google Cloud Secret Manager. Each tenant gets 4 isolated secrets with predictable names, IAM bindings for both Cloud Functions and Vertex AI, and automated health monitoring.

**Goal:** Ensure every tenant has required API keys configured before Vertex AI calls are made.

---

## Architecture

### Secret Naming Convention

**Format:** `TENANT_{tenantId}_{PROVIDER}_API_KEY`

**Example Secrets for tenant_abc12345:**
```
TENANT_tenant_abc12345_CLAY_API_KEY
TENANT_tenant_abc12345_APOLLO_API_KEY
TENANT_tenant_abc12345_CLEARBIT_API_KEY
TENANT_tenant_abc12345_CRUNCHBASE_API_KEY
```

**Benefits:**
- Single GCP project (pipelinepilot-prod)
- Predictable naming for automation
- Easy to identify tenant ownership
- No project-per-tenant complexity

### IAM Bindings

**Each secret grants `roles/secretmanager.secretAccessor` to:**
1. Cloud Functions SA: `365258353703-compute@developer.gserviceaccount.com`
2. Vertex AI RE SA: `service-365258353703@gcp-sa-aiplatform-re.iam.gserviceaccount.com`

**Scope:** Per-secret (not project-wide)

---

## Components Implemented

### 1. Tenant Secrets Management Module

**File:** `functions/src/secrets/tenantSecrets.ts` (400+ lines)

**Key Functions:**

#### `ensureTenantSecrets(tenantId: string)`
Creates all 4 required secrets for a tenant:
- Checks if secret exists
- Creates if missing
- Adds placeholder version ("PENDING_CONFIG")
- Grants IAM bindings to both SAs
- Returns status of each secret (ok/missing/placeholder/error)

#### `validateTenantSecrets(tenantId, providers)`
Validates tenant has all required secrets configured:
- Checks secret exists
- Checks has enabled version
- Checks version is not placeholder
- Returns: `{ valid, missing, placeholders }`

#### `writeSecretHealthToFirestore(tenantId, result)`
Writes secret status to Firestore:
```typescript
/tenants/{tenantId}/config/secrets
{
  CLAY: "ok" | "missing" | "placeholder" | "error",
  APOLLO: "ok" | "missing" | "placeholder" | "error",
  CLEARBIT: "ok" | "missing" | "placeholder" | "error",
  CRUNCHBASE: "ok" | "missing" | "placeholder" | "error",
  allConfigured: boolean,
  checkedAt: Timestamp
}
```

#### `ensureIamBinding(secretName, member, role)`
Grants IAM access to a service account:
- Gets current IAM policy
- Adds member to role binding
- Sets updated policy
- Idempotent (safe to call multiple times)

**Types:**
```typescript
type SecretStatus = "ok" | "missing" | "placeholder" | "error";
type Provider = "CLAY" | "APOLLO" | "CLEARBIT" | "CRUNCHBASE";

interface SecretCheckResult {
  tenantId: string;
  secrets: Record<Provider, SecretStatus>;
  allConfigured: boolean;
  missing: Provider[];
  placeholders: Provider[];
  errors: string[];
}
```

### 2. Tenant Secret Audit Jobs

**File:** `functions/src/jobs/tenantSecretAudit.ts` (250+ lines)

**Three Functions:**

#### `auditTenantSecretsScheduled` (Scheduled)
- Runs daily at 2 AM UTC
- Audits ALL active tenants
- Creates missing secrets
- Updates Firestore health
- Writes audit report

**Configuration:**
```typescript
{
  schedule: "0 2 * * *",
  timeZone: "UTC",
  memory: "512MiB"
}
```

#### `auditTenantSecretsOnDemand` (HTTP)
- Manual trigger endpoint
- Useful for initial setup
- Post-deployment verification
- Returns full audit report

**Usage:**
```bash
curl -X POST "https://us-central1-pipelinepilot-prod.cloudfunctions.net/auditTenantSecretsOnDemand"
```

#### `auditSingleTenant` (HTTP)
- Audit specific tenant
- Query param or body: `tenantId`
- Returns tenant-specific result
- Faster than full audit

**Usage:**
```bash
curl -X POST "https://us-central1-pipelinepilot-prod.cloudfunctions.net/auditSingleTenant?tenantId=tenant_abc12345"
```

**Audit Report Structure:**
```typescript
{
  timestamp: Timestamp,
  tenantsChecked: number,
  tenantsHealthy: number,
  tenantsMissingSecrets: number,
  tenantsWithPlaceholders: number,
  tenantsWithErrors: number,
  details: [
    {
      tenantId: string,
      status: "healthy" | "missing" | "placeholder" | "error",
      missing: string[],
      placeholders: string[],
      errors: string[]
    }
  ]
}
```

### 3. Vertex AI Pre-Flight Validation

**File:** `functions/src/services/vertexTenant.ts` (updated)

**Changes:**
- Added import: `validateTenantSecrets` from `tenantSecrets.ts`
- Before calling Reasoning Engine, validates all 4 secrets
- If any missing/placeholder → returns 422 error

**Validation Logic:**
```typescript
const { valid, missing, placeholders } = await validateTenantSecrets(tenantId, [
  "CLAY", "APOLLO", "CLEARBIT", "CRUNCHBASE"
]);

if (!valid) {
  return {
    error: "TENANT_SECRETS_INCOMPLETE",
    tenantId,
    missing,
    placeholders,
    message: "Tenant {tenantId} is missing required API keys..."
  };
}
```

**Updated `startCampaign` Handler:**
```typescript
const result = await callVertexForTenant(tenantId, vertexInput);

if (result.error === "TENANT_SECRETS_INCOMPLETE") {
  res.status(422).json({
    ok: false,
    error: "TENANT_SECRETS_INCOMPLETE",
    message: result.message,
    tenantId: result.tenantId,
    missing: result.missing,
    placeholders: result.placeholders
  });
  return;
}
```

### 4. Firestore Security Rules

**File:** `functions/firestore.rules` (updated)

**Added Rule:**
```javascript
// Config - Configuration data (secret health, etc.)
match /config/{configDoc} {
  // Tenants can read their own config
  allow read: if isTenantMember(tenantId);

  // Only Functions can write config (via admin SDK)
  allow write: if false;
}
```

**Purpose:**
- Clients can read secret health status
- Only Functions can update status
- Prevents tampering with health reports

---

## Data Flow

### Tenant Secret Lifecycle

**1. Tenant Created (Phase 1 - Stripe Webhook)**
```
Stripe subscription.created
  ↓
Create /tenants/{tenantId} in Firestore
  ↓
Phase 1 webhook creates 4 placeholder secrets
```

**2. Audit Job Ensures Secrets Exist**
```
Scheduled job (daily 2 AM UTC)
  ↓
List all active tenants
  ↓
For each tenant:
  - ensureTenantSecrets(tenantId)
  - Create missing secrets
  - Add placeholder versions
  - Grant IAM bindings
  - Write health to Firestore
  ↓
Write audit report to /tenant_audit/
```

**3. Customer Configures API Keys**
```
Customer adds real API key via GCP Console
  ↓
gcloud secrets versions add TENANT_xxx_CLAY_API_KEY --data-file=key.txt
  ↓
Next audit detects real value
  ↓
Health updated: CLAY: "ok"
```

**4. Campaign Request Validates Secrets**
```
POST /startCampaign
  ↓
requireTenant() validates tenant
  ↓
callVertexForTenant()
  ↓
validateTenantSecrets() checks all 4 providers
  ↓
If placeholders → 422 error with details
If configured → proceed with Vertex call
```

---

## Deployment Steps

### Step 1: Deploy Functions

```bash
cd /home/jeremy/000-projects/pipelinepilot/pipelinepilot-dashboard

# Deploy all functions (includes audit jobs)
firebase deploy --only functions --project=pipelinepilot-prod

# Or deploy specific functions
firebase deploy --only functions:auditTenantSecretsScheduled,functions:auditTenantSecretsOnDemand,functions:auditSingleTenant --project=pipelinepilot-prod
```

**Expected Output:**
```
✔  functions[auditTenantSecretsScheduled] Successful create operation.
✔  functions[auditTenantSecretsOnDemand] Successful create operation.
✔  functions[auditSingleTenant] Successful create operation.
```

### Step 2: Run Initial Audit

```bash
# Trigger on-demand audit for all tenants
curl -X POST "https://us-central1-pipelinepilot-prod.cloudfunctions.net/auditTenantSecretsOnDemand"
```

**This will:**
- Create secrets for all existing tenants
- Add placeholder versions
- Grant IAM bindings
- Write health to Firestore

### Step 3: Verify Secrets Created

```bash
# List all tenant secrets
gcloud secrets list --project=pipelinepilot-prod | grep "TENANT_"

# Check specific tenant
gcloud secrets list --project=pipelinepilot-prod | grep "tenant_abc12345"
```

### Step 4: Check Secret Health in Firestore

```bash
# Get health document for a tenant
gcloud firestore documents describe \
  "tenants/tenant_abc12345/config/secrets" \
  --project=pipelinepilot-prod
```

**Expected:**
```yaml
CLAY: placeholder
APOLLO: placeholder
CLEARBIT: placeholder
CRUNCHBASE: placeholder
allConfigured: false
```

### Step 5: Configure Real API Keys

```bash
# Replace placeholders with real keys
echo -n "sk_live_YOUR_CLAY_KEY" | \
  gcloud secrets versions add "TENANT_tenant_abc12345_CLAY_API_KEY" \
    --data-file=- \
    --project=pipelinepilot-prod

# Repeat for other providers...
```

### Step 6: Verify Configuration

```bash
# Run audit for specific tenant
curl -X POST "https://us-central1-pipelinepilot-prod.cloudfunctions.net/auditSingleTenant?tenantId=tenant_abc12345"
```

**Expected:**
```json
{
  "allConfigured": true,
  "secrets": {
    "CLAY": "ok",
    "APOLLO": "ok",
    "CLEARBIT": "ok",
    "CRUNCHBASE": "ok"
  }
}
```

---

## Secret Rotation Procedure

### Rotating a Secret for One Tenant

**Scenario:** Clay API key compromised for tenant_abc12345

**Steps:**
1. **Generate new key from provider** (Clay dashboard)

2. **Add new version to Secret Manager**
   ```bash
   echo -n "sk_live_NEW_CLAY_KEY" | \
     gcloud secrets versions add "TENANT_tenant_abc12345_CLAY_API_KEY" \
       --data-file=- \
       --project=pipelinepilot-prod
   ```

3. **Verify new version is enabled**
   ```bash
   gcloud secrets versions list \
     "TENANT_tenant_abc12345_CLAY_API_KEY" \
     --project=pipelinepilot-prod
   ```

4. **Test with campaign request**
   ```bash
   curl -X POST "https://us-central1-pipelinepilot-prod.cloudfunctions.net/startCampaign" \
     -H "x-tenant-id: tenant_abc12345" \
     -H "Content-Type: application/json" \
     -d '{"campaignId": "test", "icp": "Test"}'
   ```

5. **Disable old version (optional)**
   ```bash
   gcloud secrets versions disable VERSION_NUMBER \
     --secret="TENANT_tenant_abc12345_CLAY_API_KEY" \
     --project=pipelinepilot-prod
   ```

**Key Points:**
- Only affects tenant_abc12345
- Other tenants unaffected
- No downtime (new version immediately active)
- Old versions preserved (can rollback)

---

## Monitoring & Operations

### Check Scheduled Job Status

```bash
# View scheduler job
gcloud scheduler jobs describe tenant-secret-audit \
  --location=us-central1 \
  --project=pipelinepilot-prod

# View execution logs
gcloud functions logs read auditTenantSecretsScheduled \
  --region=us-central1 \
  --project=pipelinepilot-prod \
  --limit=50
```

### Monitor Audit Reports

```bash
# List recent audit logs
gcloud firestore documents list \
  --collection-id=tenant_audit \
  --filter="action:secret_audit" \
  --project=pipelinepilot-prod \
  --limit=10
```

### Dashboard Query (BigQuery)

```sql
-- Count tenants by secret health
SELECT
  JSON_EXTRACT_SCALAR(details, '$.status') as status,
  COUNT(*) as tenant_count
FROM `pipelinepilot-prod.firestore_export.tenant_audit`
WHERE action = 'secret_audit'
  AND timestamp > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
GROUP BY status
```

---

## Troubleshooting

### Issue: Audit job times out

**Symptoms:**
- Function exceeds 540s timeout
- Large number of tenants (>100)

**Solution:**
```typescript
// Increase timeout in function config
export const auditTenantSecretsScheduled = onSchedule({
  schedule: "0 2 * * *",
  timeout: 540,  // 9 minutes (max)
  memory: "1GiB" // More memory for faster execution
}, ...)
```

### Issue: IAM binding fails

**Error:** "Permission denied" when setting IAM policy

**Solution:**
```bash
# Grant Cloud Functions SA permission to manage secret IAM
gcloud projects add-iam-policy-binding pipelinepilot-prod \
  --member="serviceAccount:365258353703-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.admin"
```

### Issue: Health not updating in Firestore

**Cause:** Firestore rules blocking writes

**Solution:**
- Functions use admin SDK (bypasses rules)
- Check function logs for errors
- Verify Firestore rules deployed correctly

---

## Performance Considerations

### Per-Tenant Audit Time

**Breakdown:**
- Secret existence check: 4 × 50ms = 200ms
- Version listing: 4 × 50ms = 200ms
- IAM policy operations: 4 × 100ms = 400ms
- Firestore write: 100ms

**Total:** ~900ms per tenant

**For 100 tenants:** ~90 seconds (well under 540s timeout)

### Optimization Opportunities

1. **Parallel Processing:**
   ```typescript
   await Promise.all(tenants.map(t => ensureTenantSecrets(t.id)));
   ```

2. **Caching:**
   - Cache Secret Manager client
   - Batch Firestore writes

3. **Pagination:**
   - Process tenants in batches of 50
   - Use Cloud Tasks for large deployments

---

## Security Audit

### ✅ Implemented Security Measures

1. **Least Privilege IAM:**
   - Per-secret bindings (not project-wide)
   - Only required SAs have access
   - No user access to secrets

2. **Audit Trail:**
   - All secret operations logged
   - Tenant audit collection
   - Timestamp on every action

3. **Placeholder Protection:**
   - Vertex calls blocked if placeholders present
   - Clear error messages for customers
   - Health status visible in Firestore

4. **Rotation Support:**
   - Per-tenant rotation
   - No cross-tenant impact
   - Old versions preserved

---

## Next Steps

### Immediate (Before Phase 4)

1. **Deploy Functions**
2. **Run Initial Audit**
3. **Verify All Secrets Created**
4. **Configure Real API Keys for Test Tenants**
5. **Test End-to-End Campaign Flow**

### Phase 4 Preparation

**Phase 4 Goal:** Monitoring and Validation

**Will Add:**
- ARV Gate checks for missing secrets
- CI/CD integration
- Alerting for placeholder secrets
- Tenant onboarding automation

---

**Document Status:** ✅ Complete - Ready for Deployment
**Author:** Build Captain (Claude Code)
**Phase:** 3 - Secret Manager Automation
**Next Phase:** Phase 4 - Monitoring and Validation
