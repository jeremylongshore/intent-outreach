# 6767-UNIV-SOP-GCP-Pre-Build-Validation-Checklist

**Date:** 2025-11-02
**Status:** ✅ Universal Template - Mandatory for All GCP Projects
**Category:** Standard Operating Procedure (SOP)
**Scope:** All Google Cloud Platform projects in the ecosystem

---

## Abbreviations

- **GCP** = Google Cloud Platform
- **SOP** = Standard Operating Procedure
- **Gen2** = Firebase Functions Generation 2 (if applicable)
- **SA** = Service Account
- **IAM** = Identity and Access Management
- **RE** = Reasoning Engine (if applicable)

---

## Purpose

This SOP provides a **universal pre-build validation checklist** to prevent permission-related deployment failures across ALL Google Cloud projects. Based on lessons learned from real-world production debugging, this checklist ensures all permission layers are validated BEFORE deployment.

**Applicable To:**
- Firebase Functions (Gen1 or Gen2)
- Cloud Run services
- Cloud Functions
- Vertex AI Reasoning Engines
- Any GCP service requiring IAM permissions

**Time Saved:** Following this checklist takes 15 minutes. Skipping it can cost 45+ minutes of debugging.

**Critical Rule:** 🚨 **NO DEPLOYMENT WITHOUT COMPLETING THIS CHECKLIST** 🚨

---

## How to Use This Template

### Step 1: Define Your Project Variables

Before using this checklist, fill in your project-specific values:

```bash
# Project Configuration
export PROJECT_ID="your-project-id"              # e.g., pipelinepilot-prod
export PROJECT_NUMBER="123456789012"             # Get with: gcloud projects describe $PROJECT_ID --format="value(projectNumber)"
export REGION="us-central1"                      # Your deployment region
export FUNCTION_NAME="yourFunction"              # Firebase/Cloud Function name (if applicable)
export ENGINE_ID="projects/.../reasoningEngines/..." # Reasoning Engine ID (if applicable)

# Service Accounts (adjust based on your architecture)
export COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
export REASONING_SA="service-${PROJECT_NUMBER}@gcp-sa-aiplatform-re.iam.gserviceaccount.com"
export CUSTOM_SA="your-custom-sa@${PROJECT_ID}.iam.gserviceaccount.com"  # Optional

# Secrets (list all secrets your project uses)
export SECRETS=(
  "SECRET_NAME_1"
  "SECRET_NAME_2"
  "SECRET_NAME_3"
)
```

### Step 2: Customize Permission Layers

Identify which permission layers apply to YOUR project architecture:

- **Layer 1:** Cloud Build permissions (if using Firebase/Cloud Functions)
- **Layer 2:** Public access permissions (if needed for testing)
- **Layer 3:** Service-specific permissions (AI Platform, Cloud Run, etc.)
- **Layer 4:** Secret Manager permissions (if using secrets)
- **Layer 5:** Database permissions (Firestore, Cloud SQL, etc.)
- **Layer 6:** Additional service permissions

### Step 3: Follow the Checklist

Replace template variables with your actual values and follow each section.

---

## Pre-Deployment Validation Workflow

```
┌─────────────────────────────────────────────┐
│  MANDATORY PRE-BUILD VALIDATION CHECKLIST   │
├─────────────────────────────────────────────┤
│  1. ✅ Permission Validation (6 layers)     │
│  2. ✅ Secret Validation & Versioning       │
│  3. ✅ Service Account Mapping              │
│  4. ✅ Debug Logging Setup                  │
│  5. ✅ IAM Propagation Testing              │
│  6. ✅ End-to-End Smoke Test                │
└─────────────────────────────────────────────┘
         ↓
    ALL CHECKS PASS?
         ↓
    ✅ YES → DEPLOY
    ❌ NO  → FIX ISSUES, RE-RUN CHECKLIST
```

---

## Part 1: Permission Validation (Customizable Layers)

### Layer 1: Cloud Build Permissions (if using Firebase/Cloud Functions)

**Service Account:** `${PROJECT_NUMBER}-compute@developer.gserviceaccount.com`

**Common Required Roles:**
```bash
# ✅ roles/artifactregistry.writer      - Access build cache (Firebase Gen2, Cloud Run)
# ✅ roles/logging.logWriter            - Write build logs (all services)
# ✅ roles/storage.admin                - Access Cloud Storage (if needed)
```

**Validation Command:**
```bash
# List permissions for Cloud Build SA (replace $PROJECT_ID and $COMPUTE_SA)
gcloud projects get-iam-policy $PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:$COMPUTE_SA" \
  --format="table(bindings.role)"
```

**Expected Output:**
```
ROLE
roles/artifactregistry.writer
roles/logging.logWriter
```

**Fix If Missing:**
```bash
# Add Artifact Registry Writer
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$COMPUTE_SA" \
  --role="roles/artifactregistry.writer"

# Add Log Writer
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$COMPUTE_SA" \
  --role="roles/logging.logWriter"
```

**Common Variations:**
- **Cloud Run only:** May not need `artifactregistry.writer` if not using build cache
- **App Engine:** May need `appengine.appAdmin`
- **Cloud Functions Gen1:** May need `cloudfunctions.developer`

---

### Layer 2: Public Access Permissions (Testing Only - Optional)

**Service Account:** `allUsers`

**Common Required Roles:**
```bash
# ✅ roles/run.invoker        - Allow public Cloud Run/Functions access (TESTING ONLY)
# ✅ roles/iam.serviceAccountTokenCreator - For service impersonation (if needed)
```

**Validation Command:**
```bash
# For Firebase/Cloud Functions
gcloud functions get-iam-policy $FUNCTION_NAME \
  --region=$REGION \
  --project=$PROJECT_ID

# For Cloud Run
gcloud run services get-iam-policy $SERVICE_NAME \
  --region=$REGION \
  --project=$PROJECT_ID
```

**Expected Output:**
```yaml
bindings:
- members:
  - allUsers
  role: roles/run.invoker
```

**Fix If Missing:**
```bash
# For Firebase/Cloud Functions
gcloud functions add-invoker-policy-binding $FUNCTION_NAME \
  --region=$REGION \
  --member=allUsers \
  --project=$PROJECT_ID

# For Cloud Run
gcloud run services add-iam-policy-binding $SERVICE_NAME \
  --region=$REGION \
  --member=allUsers \
  --project=$PROJECT_ID
```

**⚠️ PRODUCTION SECURITY WARNING:**
- ❌ **NEVER use `allUsers` in production**
- ✅ After testing, REMOVE public access
- ✅ Restrict to specific service accounts or authenticated users only
- ✅ Use Identity-Aware Proxy (IAP) for production endpoints

**Production Alternative:**
```bash
# Replace allUsers with specific service account
gcloud run services add-iam-policy-binding $SERVICE_NAME \
  --region=$REGION \
  --member="serviceAccount:frontend-app@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.invoker" \
  --project=$PROJECT_ID
```

---

### Layer 3: Service-Specific Permissions (Customize Based on Your Stack)

**Service Account:** `${PROJECT_NUMBER}-compute@developer.gserviceaccount.com` or custom SA

**Common Required Roles by Service:**

```bash
# AI/ML Services
# ✅ roles/aiplatform.admin           - Full Vertex AI access (Reasoning Engine, Model Garden)
# ✅ roles/aiplatform.user            - Read-only Vertex AI access
# ✅ roles/ml.developer               - AI Platform (legacy) access

# Compute Services
# ✅ roles/compute.admin               - Compute Engine full access
# ✅ roles/run.admin                   - Cloud Run full access
# ✅ roles/cloudfunctions.admin        - Cloud Functions full access

# Data Services
# ✅ roles/bigquery.dataEditor         - BigQuery read/write
# ✅ roles/bigquery.jobUser            - Run BigQuery queries
# ✅ roles/storage.objectAdmin         - Cloud Storage full access

# Other Services
# ✅ roles/pubsub.publisher            - Publish Pub/Sub messages
# ✅ roles/cloudtasks.enqueuer         - Enqueue Cloud Tasks
# ✅ roles/cloudsql.client             - Connect to Cloud SQL
```

**Validation Command:**
```bash
# Check if SA has specific role (replace $ROLE with your required role)
gcloud projects get-iam-policy $PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:$COMPUTE_SA AND bindings.role:$ROLE" \
  --format="value(bindings.role)"
```

**Example - AI Platform:**
```bash
# Validate AI Platform access
gcloud projects get-iam-policy $PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:$COMPUTE_SA AND bindings.role:roles/aiplatform.admin" \
  --format="value(bindings.role)"
```

**Fix If Missing:**
```bash
# Add required role (replace $ROLE with your specific role)
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$COMPUTE_SA" \
  --role="$ROLE"

# Example - AI Platform
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$COMPUTE_SA" \
  --role="roles/aiplatform.admin"
```

**Best Practice:**
- Use **least privilege** - only grant roles actually needed
- Prefer `user` over `admin` roles when possible
- Use custom roles for fine-grained control

---

### Layer 4: Secret Manager Permissions (if using secrets)

**Service Accounts:** Can be any of the following depending on architecture:
- `${PROJECT_NUMBER}-compute@developer.gserviceaccount.com` (Cloud Functions/Cloud Run default)
- `service-${PROJECT_NUMBER}@gcp-sa-aiplatform-re.iam.gserviceaccount.com` (Reasoning Engine)
- `your-custom-sa@${PROJECT_ID}.iam.gserviceaccount.com` (Custom service account)

**Common Required Roles:**
```bash
# ✅ roles/secretmanager.secretAccessor  - Read secret values (most common)
# ✅ roles/secretmanager.admin           - Full secret management (avoid if possible)
# ✅ roles/secretmanager.viewer          - List secrets only (no values)
```

**Critical Understanding:**
- Grant `secretAccessor` on **individual secrets**, not project-wide
- Each SA needs explicit access to each secret it reads
- Secrets must have at least one version to be readable

**Validation Command:**
```bash
# Check each secret individually (replace $SECRETS array with your secrets)
for SECRET in "${SECRETS[@]}"; do
  echo "Checking $SECRET..."
  gcloud secrets get-iam-policy $SECRET \
    --project=$PROJECT_ID \
    --flatten="bindings[].members" \
    --filter="bindings.members:serviceAccount:$SERVICE_ACCOUNT"
done
```

**Example - Reasoning Engine SA:**
```bash
# Define your secrets
SECRETS=("API_KEY_1" "API_KEY_2" "DATABASE_PASSWORD")

# Check Reasoning Engine SA access
for SECRET in "${SECRETS[@]}"; do
  echo "Checking $SECRET..."
  gcloud secrets get-iam-policy $SECRET \
    --project=$PROJECT_ID \
    --flatten="bindings[].members" \
    --filter="bindings.members:serviceAccount:$REASONING_SA"
done
```

**Expected Output (for each secret):**
```yaml
bindings:
- members:
  - serviceAccount:service-123456789012@gcp-sa-aiplatform-re.iam.gserviceaccount.com
  role: roles/secretmanager.secretAccessor
```

**Fix If Missing:**
```bash
# Add secret accessor for specific SA (replace variables)
for SECRET in "${SECRETS[@]}"; do
  gcloud secrets add-iam-policy-binding $SECRET \
    --member="serviceAccount:$SERVICE_ACCOUNT" \
    --role="roles/secretmanager.secretAccessor" \
    --project=$PROJECT_ID
done
```

**Best Practice:**
- ✅ Grant access per-secret, not project-wide
- ✅ Use separate secrets for dev/staging/prod
- ✅ Rotate secrets regularly
- ✅ Audit secret access with Cloud Audit Logs

---

### Layer 5: Database Permissions (Choose based on your database)

**Service Account:** `${PROJECT_NUMBER}-compute@developer.gserviceaccount.com` or custom SA

**Common Required Roles by Database Type:**

```bash
# Firestore/Datastore
# ✅ roles/datastore.user              - Read/write documents (most common)
# ✅ roles/datastore.owner             - Full Firestore access (avoid)
# ✅ roles/datastore.viewer            - Read-only access

# Cloud SQL
# ✅ roles/cloudsql.client             - Connect to Cloud SQL instance
# ✅ roles/cloudsql.instanceUser       - Connect as specific user
# ✅ roles/cloudsql.admin              - Full Cloud SQL management (avoid)

# Cloud Spanner
# ✅ roles/spanner.databaseUser        - Read/write data
# ✅ roles/spanner.databaseReader      - Read-only access
# ✅ roles/spanner.databaseAdmin       - Full database management (avoid)

# BigQuery
# ✅ roles/bigquery.dataEditor         - Read/write tables
# ✅ roles/bigquery.dataViewer         - Read-only tables
# ✅ roles/bigquery.jobUser            - Run queries

# Bigtable
# ✅ roles/bigtable.user               - Read/write tables
# ✅ roles/bigtable.reader             - Read-only access
```

**Example - Firestore:**
```bash
# Validation command
gcloud projects get-iam-policy $PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:$COMPUTE_SA AND bindings.role:roles/datastore.user" \
  --format="value(bindings.role)"

# Fix if missing
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$COMPUTE_SA" \
  --role="roles/datastore.user"
```

**Example - Cloud SQL:**
```bash
# Validation command (instance-level permissions)
gcloud sql instances get-iam-policy $SQL_INSTANCE_NAME \
  --project=$PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:$COMPUTE_SA"

# Fix if missing
gcloud sql instances add-iam-policy-binding $SQL_INSTANCE_NAME \
  --member="serviceAccount:$COMPUTE_SA" \
  --role="roles/cloudsql.client" \
  --project=$PROJECT_ID
```

**Best Practice:**
- Use `user`/`client` roles, not `admin`/`owner`
- For Cloud SQL, also configure database users separately
- For BigQuery, consider dataset-level permissions instead of project-level

---

### Layer 6: Additional Service Permissions (if needed)

**Common Additional Services:**

```bash
# Logging & Monitoring
# ✅ roles/logging.logWriter           - Write logs (already covered in Layer 1)
# ✅ roles/monitoring.metricWriter     - Write custom metrics
# ✅ roles/cloudtrace.agent            - Write trace data

# Networking
# ✅ roles/compute.networkUser         - Use VPC networks
# ✅ roles/vpcaccess.user              - Use VPC connectors (for Cloud Functions/Run)

# Storage
# ✅ roles/storage.objectViewer        - Read GCS objects
# ✅ roles/storage.objectCreator       - Write GCS objects
# ✅ roles/storage.admin               - Full GCS access (avoid)

# Messaging
# ✅ roles/pubsub.publisher            - Publish to Pub/Sub
# ✅ roles/pubsub.subscriber           - Subscribe to Pub/Sub

# Tasks & Scheduling
# ✅ roles/cloudtasks.enqueuer         - Create Cloud Tasks
# ✅ roles/cloudscheduler.jobRunner    - Run Cloud Scheduler jobs
```

**Validation Template:**
```bash
# Check if SA has required role
gcloud projects get-iam-policy $PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:$SERVICE_ACCOUNT AND bindings.role:$ROLE" \
  --format="value(bindings.role)"
```

**Fix Template:**
```bash
# Add required role
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="$ROLE"
```

---

## Part 2: Secret Validation & Versioning

### Critical Requirement: Secrets MUST Have Versions

**Problem:** Even if a secret exists, it's not readable without at least one version.

**Common Error:**
```
404 Secret [projects/PROJECT_ID/secrets/SECRET_NAME] not found or has no versions
```

This error means:
1. Secret doesn't exist at all, OR
2. Secret exists but has ZERO versions (empty)

### Validation Steps

**1. Check All Secrets Exist:**
```bash
gcloud secrets list --project=$PROJECT_ID
```

**Expected Output:**
```
NAME                   CREATED              REPLICATION_POLICY  LOCATIONS
API_KEY_1             2025-11-02T23:58:00  automatic          -
DATABASE_PASSWORD     2025-11-02T23:58:00  automatic          -
SERVICE_ACCOUNT_KEY   2025-11-02T23:30:00  automatic          -
```

**2. Check Each Secret Has At Least One Version:**
```bash
# Using your $SECRETS array
for SECRET in "${SECRETS[@]}"; do
  echo "Checking $SECRET versions..."
  gcloud secrets versions list $SECRET --project=$PROJECT_ID --limit=1
done
```

**Expected Output (for each secret):**
```
NAME  STATE    CREATED              DESTROYED
1     enabled  2025-11-02T23:58:00  -
```

**3. If Secret Has No Versions, Add One:**

```bash
# Option 1: Add from file
gcloud secrets versions add $SECRET_NAME \
  --data-file=/path/to/secret.txt \
  --project=$PROJECT_ID

# Option 2: Add from stdin (for testing with placeholders)
echo -n "test-placeholder-value" | \
  gcloud secrets versions add $SECRET_NAME \
    --data-file=- \
    --project=$PROJECT_ID

# Option 3: Add from environment variable
echo -n "$SECRET_VALUE" | \
  gcloud secrets versions add $SECRET_NAME \
    --data-file=- \
    --project=$PROJECT_ID
```

**Example - Creating Secrets with Initial Versions:**
```bash
# Create secret AND add first version in one command
echo -n "my-secret-value" | \
  gcloud secrets create MY_SECRET_NAME \
    --data-file=- \
    --replication-policy="automatic" \
    --project=$PROJECT_ID
```

### Secret Management Best Practices

**1. Never Commit Secrets to Git:**
```bash
# Add to .gitignore
echo "*.env" >> .gitignore
echo "secrets/" >> .gitignore
echo "*.key" >> .gitignore
```

**2. Use Separate Secrets for Each Environment:**
```
API_KEY_DEV       # Development environment
API_KEY_STAGING   # Staging environment
API_KEY_PROD      # Production environment
```

**3. Rotate Secrets Regularly:**
```bash
# Add new version (old version still accessible)
echo -n "$NEW_SECRET_VALUE" | \
  gcloud secrets versions add $SECRET_NAME \
    --data-file=- \
    --project=$PROJECT_ID

# Disable old version after rotation
gcloud secrets versions disable 1 \
  --secret=$SECRET_NAME \
  --project=$PROJECT_ID

# Destroy old version (irreversible!)
gcloud secrets versions destroy 1 \
  --secret=$SECRET_NAME \
  --project=$PROJECT_ID
```

**4. Audit Secret Access:**
```bash
# View who accessed secrets (requires Cloud Audit Logs)
gcloud logging read \
  "resource.type=secretmanager.googleapis.com/Secret" \
  --project=$PROJECT_ID \
  --limit=50
```

---

## Part 3: Service Account Mapping

### Understanding GCP Service Accounts

**Default Service Accounts (Automatically Created):**

1. **Compute Engine Default SA:**
   - **Pattern:** `[PROJECT_NUMBER]-compute@developer.gserviceaccount.com`
   - **Used By:** Cloud Functions, Cloud Run, Compute Engine
   - **When Created:** Automatically when Compute API is enabled

2. **App Engine Default SA:**
   - **Pattern:** `[PROJECT_ID]@appspot.gserviceaccount.com`
   - **Used By:** App Engine applications
   - **When Created:** Automatically when App Engine is initialized

3. **Service-Specific SAs:**
   - **AI Platform (Reasoning Engine):** `service-[PROJECT_NUMBER]@gcp-sa-aiplatform-re.iam.gserviceaccount.com`
   - **Cloud Build:** `[PROJECT_NUMBER]@cloudbuild.gserviceaccount.com`
   - **Firebase Admin SDK:** `firebase-adminsdk-xxxxx@[PROJECT_ID].iam.gserviceaccount.com`

**Custom Service Accounts (User Created):**
- **Pattern:** `[SA_NAME]@[PROJECT_ID].iam.gserviceaccount.com`
- **Best Practice:** Create custom SAs for production with least privilege
- **Creation:**
  ```bash
  gcloud iam service-accounts create $SA_NAME \
    --display-name="My Custom Service Account" \
    --project=$PROJECT_ID
  ```

### Document Your Service Account Architecture

**Create a mapping table for YOUR project:**

| Service Account | Purpose | Required Roles |
|-----------------|---------|----------------|
| `${COMPUTE_SA}` | Run Cloud Functions/Cloud Run | `roles/logging.logWriter`, `roles/datastore.user` |
| `${CUSTOM_SA}` | Access external APIs | `roles/secretmanager.secretAccessor` on API keys |
| `${REASONING_SA}` | Run Reasoning Engine | `roles/secretmanager.secretAccessor` on secrets |

**Example Template:**
```bash
# Define your service accounts
export COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
export REASONING_SA="service-${PROJECT_NUMBER}@gcp-sa-aiplatform-re.iam.gserviceaccount.com"
export CUSTOM_SA="my-app-sa@${PROJECT_ID}.iam.gserviceaccount.com"

# Document which SA needs which permissions
# COMPUTE_SA needs:
#   - roles/logging.logWriter (project-level)
#   - roles/datastore.user (project-level)
#   - roles/aiplatform.admin (project-level)
#
# REASONING_SA needs:
#   - roles/secretmanager.secretAccessor on API_KEY_1
#   - roles/secretmanager.secretAccessor on API_KEY_2
```

### Validation Matrix Generator

**Generate complete permission matrix for your project:**

```bash
#!/bin/bash
# save as: scripts/validate-permissions.sh

PROJECT_ID="your-project-id"
PROJECT_NUMBER="123456789012"

echo "=== SERVICE ACCOUNT PERMISSION MATRIX ==="
echo ""

# List all service accounts
echo "1. ALL SERVICE ACCOUNTS IN PROJECT:"
gcloud iam service-accounts list --project=$PROJECT_ID

echo ""
echo "2. PROJECT-LEVEL PERMISSIONS:"

# Check Compute Engine SA
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
echo ""
echo "Compute Engine Default SA ($COMPUTE_SA):"
gcloud projects get-iam-policy $PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:$COMPUTE_SA" \
  --format="table(bindings.role)"

echo ""
echo "3. SECRET-LEVEL PERMISSIONS:"

# Check each secret
SECRETS=("API_KEY_1" "API_KEY_2" "DATABASE_PASSWORD")
for SECRET in "${SECRETS[@]}"; do
  echo ""
  echo "Secret: $SECRET"
  gcloud secrets get-iam-policy $SECRET --project=$PROJECT_ID 2>/dev/null || echo "  Secret not found"
done
```

---

## Part 4: Debug Logging Setup

### Mandatory: Comprehensive Debug Logging

**Purpose:** Generic "permission denied" errors hide the actual problem. Debug logging reveals the exact error.

**Real Example:**
```
Generic error:  7 PERMISSION_DENIED: Missing or insufficient permissions
Actual error:   403 Permission 'secretmanager.versions.access' denied for resource 'projects/pipelinepilot-prod/secrets/CLAY_API_KEY/versions/latest'
```

### Required Logging Pattern (index.ts)

```typescript
export const startCampaign = onRequest({ secrets: [ORCHESTRATOR_DEV_ID] }, async (req, res) => {
  try {
    // 1. Log incoming request
    console.log("[DEBUG] Request received:", JSON.stringify(req.body));

    // 2. Log secret retrieval
    const ENGINE_ID = ORCHESTRATOR_DEV_ID.value();
    console.log("[DEBUG] Engine ID:", ENGINE_ID);

    // 3. Log auth token acquisition
    console.log("[DEBUG] Getting auth token...");
    const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
    const client = await auth.getClient();
    const { token } = await client.getAccessToken();
    console.log("[DEBUG] Token acquired, length:", token?.length);

    // 4. Log API call details
    const url = `https://${REGION}-aiplatform.googleapis.com/v1/${ENGINE_ID}:query`;
    const payload = { class_method: "query", input: { ... } };
    console.log("[DEBUG] Calling Reasoning Engine:", url);
    console.log("[DEBUG] Payload:", JSON.stringify(payload));

    // 5. Log response status
    const r = await fetch(url, { ... });
    console.log("[DEBUG] Response status:", r.status, r.statusText);

    // 6. Log response body
    const out = await r.json();
    console.log("[DEBUG] Response body:", JSON.stringify(out));

    // 7. Log errors with full details
    if (!r.ok) {
      console.error("[ERROR] Reasoning Engine call failed:", r.status, JSON.stringify(out));
      res.status(r.status).json({ error: out.error || out.message, details: out });
      return;
    }

    // 8. Log Firestore write
    console.log("[DEBUG] Writing to Firestore...");
    await db.collection("campaigns").doc(String(campaignId)).collection("logs").add({ ts: Date.now(), out });

    console.log("[DEBUG] Success!");
    res.json({ ok: true, engine: ENGINE_ID, result: out });

  } catch (e) {
    console.error("[ERROR] Exception caught:", e);
    res.status(500).json({ error: (e as Error).message, stack: (e as Error).stack });
  }
});
```

### Viewing Logs

```bash
# View Firebase Functions logs (real-time)
gcloud functions logs read startCampaign \
  --region=us-central1 \
  --project=pipelinepilot-prod \
  --limit=50

# Follow logs in real-time
gcloud functions logs read startCampaign \
  --region=us-central1 \
  --project=pipelinepilot-prod \
  --limit=50 \
  --follow
```

---

## Part 5: IAM Propagation Testing

### Critical Understanding: IAM Changes Are NOT Instant

**Propagation Time:** IAM binding changes take **2-5 minutes** to fully propagate across GCP.

**Common Mistake:**
```bash
# Add permission
gcloud projects add-iam-policy-binding ...

# Test immediately (WRONG - will fail)
curl https://function-url  # ❌ Still shows "permission denied"
```

**Correct Approach:**
```bash
# Add permission
gcloud projects add-iam-policy-binding ...

# WAIT 3-5 minutes for propagation
echo "Waiting 3 minutes for IAM propagation..."
sleep 180

# Now test
curl https://function-url  # ✅ Should work
```

### Validation Protocol

**After Adding ANY Permission:**

1. **Wait minimum 3 minutes**
2. **Verify permission applied:**
   ```bash
   gcloud projects get-iam-policy pipelinepilot-prod \
     --flatten="bindings[].members" \
     --filter="bindings.members:serviceAccount:[SA_EMAIL]" \
     --format="table(bindings.role)"
   ```
3. **Test endpoint:**
   ```bash
   curl -X POST https://function-url -d '{"test": true}'
   ```
4. **Check logs for errors:**
   ```bash
   gcloud functions logs read startCampaign --limit=10
   ```

### Multi-Permission Changes

**If Adding Multiple Permissions:**
- Add ALL permissions first
- Wait 5 minutes (longer for multiple changes)
- Test once after waiting

**Do NOT:**
- Add one permission
- Test
- Add another permission
- Test
- Repeat (wastes time waiting for propagation)

---

## Part 6: End-to-End Smoke Test

### Pre-Deployment Smoke Test

**Purpose:** Verify ALL components work BEFORE deploying.

**Test Script:** `scripts/pre-deploy-smoke.sh`

```bash
#!/bin/bash
set -e

PROJECT_ID="pipelinepilot-prod"
REGION="us-central1"
FUNCTION_NAME="startCampaign"

echo "=== PRE-DEPLOYMENT SMOKE TEST ==="
echo ""

# 1. Check all secrets exist with versions
echo "✅ Checking secrets..."
for SECRET in CLAY_API_KEY APOLLO_API_KEY CLEARBIT_API_KEY CRUNCHBASE_API_KEY ORCHESTRATOR_DEV_ID; do
  VERSIONS=$(gcloud secrets versions list $SECRET --project=$PROJECT_ID --format="value(name)" | wc -l)
  if [ "$VERSIONS" -eq "0" ]; then
    echo "❌ FAIL: Secret $SECRET has no versions"
    exit 1
  fi
  echo "   ✓ $SECRET has $VERSIONS version(s)"
done

# 2. Check Cloud Build SA permissions
echo ""
echo "✅ Checking Cloud Build SA permissions..."
ROLES=$(gcloud projects get-iam-policy $PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:365258353703-compute@developer.gserviceaccount.com" \
  --format="value(bindings.role)")

for REQUIRED in "roles/artifactregistry.writer" "roles/aiplatform.admin" "roles/datastore.user"; do
  if echo "$ROLES" | grep -q "$REQUIRED"; then
    echo "   ✓ $REQUIRED"
  else
    echo "❌ FAIL: Missing role $REQUIRED"
    exit 1
  fi
done

# 3. Check Reasoning Engine SA secret access
echo ""
echo "✅ Checking Reasoning Engine SA secret access..."
for SECRET in CLAY_API_KEY APOLLO_API_KEY CLEARBIT_API_KEY CRUNCHBASE_API_KEY; do
  BINDING=$(gcloud secrets get-iam-policy $SECRET --project=$PROJECT_ID \
    --flatten="bindings[].members" \
    --filter="bindings.members:serviceAccount:service-365258353703@gcp-sa-aiplatform-re.iam.gserviceaccount.com" \
    --format="value(bindings.role)")

  if [ "$BINDING" == "roles/secretmanager.secretAccessor" ]; then
    echo "   ✓ $SECRET"
  else
    echo "❌ FAIL: No secret access for $SECRET"
    exit 1
  fi
done

# 4. Check TypeScript build
echo ""
echo "✅ Checking TypeScript build..."
cd pipelinepilot-dashboard/functions
npm run build > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "   ✓ TypeScript build successful"
else
  echo "❌ FAIL: TypeScript build failed"
  exit 1
fi

# 5. Check orchestrator wrapper
echo ""
echo "✅ Checking orchestrator wrapper..."
cd ../../
python3 scripts/smoke_orchestrator.py > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "   ✓ Orchestrator wrapper smoke test passed"
else
  echo "❌ FAIL: Orchestrator wrapper smoke test failed"
  exit 1
fi

echo ""
echo "=========================================="
echo "✅ ALL PRE-DEPLOYMENT CHECKS PASSED!"
echo "=========================================="
echo ""
echo "Ready to deploy:"
echo "  1. cd pipelinepilot-dashboard"
echo "  2. firebase deploy --only functions"
echo ""
```

**Run Before Every Deployment:**
```bash
cd /home/jeremy/000-projects/pipelinepilot
chmod +x scripts/pre-deploy-smoke.sh
./scripts/pre-deploy-smoke.sh
```

---

## Part 7: Common Failure Patterns & Solutions

### Failure Pattern 1: "Permission Denied" with No Details

**Symptom:**
```
7 PERMISSION_DENIED: Missing or insufficient permissions
```

**Root Cause:** Generic error - doesn't tell you WHICH permission is missing.

**Solution:**
1. Check debug logs for actual error:
   ```bash
   gcloud functions logs read startCampaign --limit=50
   ```
2. Look for `[DEBUG]` and `[ERROR]` lines
3. Find the actual 403 error with resource details

**Example:**
```
[DEBUG] Calling Reasoning Engine: https://...
[DEBUG] Response status: 403 Forbidden
[ERROR] Response body: {
  "error": {
    "code": 403,
    "message": "Permission 'secretmanager.versions.access' denied for resource 'projects/pipelinepilot-prod/secrets/CLAY_API_KEY/versions/latest'"
  }
}
```

**Now you know:** Missing `secretmanager.secretAccessor` on `CLAY_API_KEY`.

---

### Failure Pattern 2: "Secret Not Found" When Secret Exists

**Symptom:**
```
404 Secret [projects/pipelinepilot-prod/secrets/CLAY_API_KEY] not found or has no versions
```

**Root Cause:** Secret exists but has ZERO versions.

**Solution:**
```bash
# Check versions
gcloud secrets versions list CLAY_API_KEY --project=pipelinepilot-prod

# If empty, add placeholder version
echo -n "test-key-placeholder" | gcloud secrets versions add CLAY_API_KEY --data-file=- --project=pipelinepilot-prod
```

---

### Failure Pattern 3: Permission Added But Still Fails

**Symptom:**
- Added IAM binding
- Verified binding exists
- Test still fails with permission denied

**Root Cause:** IAM propagation delay (2-5 minutes).

**Solution:**
```bash
# Wait 3-5 minutes after adding permission
sleep 180

# Then test again
```

---

### Failure Pattern 4: Build Succeeds, Deploy Fails at Cloud Build

**Symptom:**
- `npm run build` works locally
- `firebase deploy` fails at Cloud Build step 2
- Error: `exit code 1` with no logs

**Root Cause:** Missing Artifact Registry permissions.

**Solution:**
```bash
# Add Artifact Registry Writer role
gcloud projects add-iam-policy-binding pipelinepilot-prod \
  --member="serviceAccount:365258353703-compute@developer.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

# Wait 3 minutes
sleep 180

# Retry deploy
firebase deploy --only functions
```

---

## Part 8: Mandatory Pre-Deployment Checklist

### Use This Before EVERY Deployment

```
┌─────────────────────────────────────────────────────────────┐
│           MANDATORY PRE-DEPLOYMENT CHECKLIST                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  LAYER 1: Cloud Build Permissions                          │
│    ☐ roles/artifactregistry.writer                         │
│    ☐ roles/logging.logWriter                               │
│                                                             │
│  LAYER 2: Cloud Run Public Access (Testing)                │
│    ☐ roles/run.invoker for allUsers                        │
│                                                             │
│  LAYER 3: AI Platform Permissions                          │
│    ☐ roles/aiplatform.admin                                │
│                                                             │
│  LAYER 4: Secret Manager (RE SA)                           │
│    ☐ roles/secretmanager.secretAccessor on CLAY_API_KEY    │
│    ☐ roles/secretmanager.secretAccessor on APOLLO_API_KEY  │
│    ☐ roles/secretmanager.secretAccessor on CLEARBIT_API_KEY│
│    ☐ roles/secretmanager.secretAccessor on CRUNCHBASE_API  │
│                                                             │
│  LAYER 5: Firestore Permissions                            │
│    ☐ roles/datastore.user                                  │
│                                                             │
│  LAYER 6: Secret Manager (Functions SA)                    │
│    ☐ roles/secretmanager.secretAccessor on ORCHESTRATOR_ID │
│                                                             │
│  SECRET VALIDATION:                                         │
│    ☐ CLAY_API_KEY has at least 1 version                   │
│    ☐ APOLLO_API_KEY has at least 1 version                 │
│    ☐ CLEARBIT_API_KEY has at least 1 version               │
│    ☐ CRUNCHBASE_API_KEY has at least 1 version             │
│    ☐ ORCHESTRATOR_DEV_ID has at least 1 version            │
│                                                             │
│  DEBUG LOGGING:                                             │
│    ☐ Console.log statements at all critical points         │
│    ☐ Request received logged                               │
│    ☐ Engine ID logged                                      │
│    ☐ Auth token acquisition logged                         │
│    ☐ API call URL and payload logged                       │
│    ☐ Response status and body logged                       │
│    ☐ Firestore write logged                                │
│    ☐ Errors logged with full details                       │
│                                                             │
│  BUILD VALIDATION:                                          │
│    ☐ npm run build succeeds                                │
│    ☐ lib/index.js exists                                   │
│    ☐ node --check lib/index.js passes                      │
│    ☐ python3 scripts/smoke_orchestrator.py passes          │
│                                                             │
│  PRE-DEPLOY SMOKE TEST:                                     │
│    ☐ ./scripts/pre-deploy-smoke.sh passes                  │
│                                                             │
│  IAM PROPAGATION:                                           │
│    ☐ If permissions changed, waited 3-5 minutes            │
│    ☐ Verified permissions applied (gcloud get-iam-policy)  │
│                                                             │
└─────────────────────────────────────────────────────────────┘

✅ ALL BOXES CHECKED? → PROCEED WITH DEPLOYMENT
❌ ANY BOX UNCHECKED? → FIX ISSUE, RE-RUN CHECKLIST
```

---

## Part 9: Quick Command Reference

### Permission Validation Commands

```bash
# Check Cloud Build SA permissions
gcloud projects get-iam-policy pipelinepilot-prod \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:365258353703-compute@developer.gserviceaccount.com" \
  --format="table(bindings.role)"

# Check secret access for Reasoning Engine SA
for SECRET in CLAY_API_KEY APOLLO_API_KEY CLEARBIT_API_KEY CRUNCHBASE_API_KEY; do
  gcloud secrets get-iam-policy $SECRET --project=pipelinepilot-prod \
    --flatten="bindings[].members" \
    --filter="bindings.members:serviceAccount:service-365258353703@gcp-sa-aiplatform-re.iam.gserviceaccount.com"
done

# Check all secret versions
for SECRET in CLAY_API_KEY APOLLO_API_KEY CLEARBIT_API_KEY CRUNCHBASE_API_KEY ORCHESTRATOR_DEV_ID; do
  echo "=== $SECRET ==="
  gcloud secrets versions list $SECRET --project=pipelinepilot-prod --limit=1
done
```

### Quick Fix Commands

```bash
# Add missing Cloud Build permissions
gcloud projects add-iam-policy-binding pipelinepilot-prod \
  --member="serviceAccount:365258353703-compute@developer.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding pipelinepilot-prod \
  --member="serviceAccount:365258353703-compute@developer.gserviceaccount.com" \
  --role="roles/aiplatform.admin"

gcloud projects add-iam-policy-binding pipelinepilot-prod \
  --member="serviceAccount:365258353703-compute@developer.gserviceaccount.com" \
  --role="roles/datastore.user"

# Add secret access for Reasoning Engine SA
for SECRET in CLAY_API_KEY APOLLO_API_KEY CLEARBIT_API_KEY CRUNCHBASE_API_KEY; do
  gcloud secrets add-iam-policy-binding $SECRET \
    --member="serviceAccount:service-365258353703@gcp-sa-aiplatform-re.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor" \
    --project=pipelinepilot-prod
done

# Create placeholder secret versions
echo -n "test-key-placeholder" | gcloud secrets versions add CLAY_API_KEY --data-file=- --project=pipelinepilot-prod
echo -n "test-apollo-key" | gcloud secrets versions add APOLLO_API_KEY --data-file=- --project=pipelinepilot-prod
echo -n "test-clearbit-key" | gcloud secrets versions add CLEARBIT_API_KEY --data-file=- --project=pipelinepilot-prod
echo -n "test-crunchbase-key" | gcloud secrets versions add CRUNCHBASE_API_KEY --data-file=- --project=pipelinepilot-prod
```

---

## Part 10: Post-Deployment Verification

### After Successful Deployment

**1. Test Function Endpoint:**
```bash
FUNCTION_URL="https://us-central1-pipelinepilot-prod.cloudfunctions.net/startCampaign"

curl -X POST $FUNCTION_URL \
  -H "Content-Type: application/json" \
  -d '{
    "campaignId": "test-001",
    "icp": "B2B SaaS companies with 10-50 employees",
    "domains": ["example.com"],
    "email": "founder@example.com"
  }'
```

**2. Expected Response:**
```json
{
  "ok": true,
  "engine": "projects/365258353703/locations/us-central1/reasoningEngines/...",
  "result": {
    "output": {
      "steps": [...],
      "leads": [...],
      "contacts": [...],
      "email": {
        "subject": "...",
        "body": "..."
      },
      "next_action": "..."
    }
  }
}
```

**3. Check Logs:**
```bash
gcloud functions logs read startCampaign \
  --region=us-central1 \
  --project=pipelinepilot-prod \
  --limit=50
```

**4. Verify Firestore Write:**
```bash
# Check if campaign log was written
gcloud firestore documents list \
  --collection-id=campaigns \
  --project=pipelinepilot-prod
```

**5. Monitor Performance:**
```bash
# View Cloud Monitoring metrics
gcloud monitoring time-series list \
  --filter='metric.type="cloudfunctions.googleapis.com/function/execution_count" AND resource.labels.function_name="startCampaign"' \
  --project=pipelinepilot-prod
```

---

## Part 11: Acceptance Criteria

### Deployment is ONLY Approved if ALL Criteria Pass

#### Permission Layer Validation
- ✅ Cloud Build SA has `artifactregistry.writer` and `logging.logWriter`
- ✅ Cloud Build SA has `aiplatform.admin`
- ✅ Cloud Build SA has `datastore.user`
- ✅ Cloud Build SA has `secretmanager.secretAccessor` on `ORCHESTRATOR_DEV_ID`
- ✅ Reasoning Engine SA has `secretmanager.secretAccessor` on all 4 API key secrets
- ✅ Public access configured for testing (if needed)

#### Secret Validation
- ✅ All 5 secrets exist
- ✅ All 5 secrets have at least 1 version
- ✅ Secret values are valid (not empty strings)

#### Debug Logging
- ✅ All critical points have console.log statements
- ✅ Request received logged
- ✅ Engine ID logged
- ✅ Auth token acquisition logged
- ✅ API call details logged
- ✅ Response status and body logged
- ✅ Firestore write logged
- ✅ Errors logged with full details and stack traces

#### Build Validation
- ✅ `npm run build` succeeds without errors
- ✅ `lib/index.js` exists
- ✅ `node --check lib/index.js` passes
- ✅ `python3 scripts/smoke_orchestrator.py` passes

#### Pre-Deploy Smoke Test
- ✅ `./scripts/pre-deploy-smoke.sh` passes all checks

#### IAM Propagation
- ✅ If permissions changed, waited minimum 3 minutes
- ✅ Verified permissions applied using `gcloud get-iam-policy`
- ✅ Tested endpoint and confirmed working

#### Post-Deploy Verification
- ✅ Function endpoint returns 200 OK
- ✅ Response JSON structure matches expected format
- ✅ Logs show successful execution (no errors)
- ✅ Firestore write confirmed
- ✅ End-to-end latency < 10 seconds

---

## Appendix A: Complete Example Configuration (PipelinePilot)

This section shows how to customize this universal SOP for a specific project.

### Project: PipelinePilot

**Architecture:**
- Firebase Functions Gen2 (Node 20 + ESM)
- Vertex AI Reasoning Engine (Python ADK wrapper)
- Firestore database
- Secret Manager for API keys
- External APIs (Clay, Apollo, Clearbit, Crunchbase)

### Step 1: Define Project Variables

```bash
# Project Configuration
export PROJECT_ID="pipelinepilot-prod"
export PROJECT_NUMBER="365258353703"  # gcloud projects describe $PROJECT_ID --format="value(projectNumber)"
export REGION="us-central1"
export FUNCTION_NAME="startCampaign"
export ENGINE_ID="projects/365258353703/locations/us-central1/reasoningEngines/1703754839890067456"

# Service Accounts
export COMPUTE_SA="365258353703-compute@developer.gserviceaccount.com"
export REASONING_SA="service-365258353703@gcp-sa-aiplatform-re.iam.gserviceaccount.com"
export CUSTOM_SA="pp-dev@pipelinepilot-prod.iam.gserviceaccount.com"

# Secrets
export SECRETS=(
  "CLAY_API_KEY"
  "APOLLO_API_KEY"
  "CLEARBIT_API_KEY"
  "CRUNCHBASE_API_KEY"
  "ORCHESTRATOR_DEV_ID"
)
```

### Step 2: Required Permissions by Layer

**Layer 1: Cloud Build (Compute SA)**
```bash
# Required roles
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$COMPUTE_SA" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$COMPUTE_SA" \
  --role="roles/logging.logWriter"
```

**Layer 2: Public Access (Testing Only)**
```bash
gcloud functions add-invoker-policy-binding $FUNCTION_NAME \
  --region=$REGION \
  --member=allUsers \
  --project=$PROJECT_ID
```

**Layer 3: AI Platform (Compute SA)**
```bash
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$COMPUTE_SA" \
  --role="roles/aiplatform.admin"
```

**Layer 4: Secret Manager (Reasoning Engine SA for API keys)**
```bash
for SECRET in CLAY_API_KEY APOLLO_API_KEY CLEARBIT_API_KEY CRUNCHBASE_API_KEY; do
  gcloud secrets add-iam-policy-binding $SECRET \
    --member="serviceAccount:$REASONING_SA" \
    --role="roles/secretmanager.secretAccessor" \
    --project=$PROJECT_ID
done
```

**Layer 5: Firestore (Compute SA)**
```bash
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$COMPUTE_SA" \
  --role="roles/datastore.user"
```

**Layer 6: Secret Manager (Compute SA for orchestrator ID)**
```bash
gcloud secrets add-iam-policy-binding ORCHESTRATOR_DEV_ID \
  --member="serviceAccount:$COMPUTE_SA" \
  --role="roles/secretmanager.secretAccessor" \
  --project=$PROJECT_ID
```

### Step 3: Secret Versioning

```bash
# Verify all secrets have versions
for SECRET in "${SECRETS[@]}"; do
  VERSIONS=$(gcloud secrets versions list $SECRET --project=$PROJECT_ID --format="value(name)" | wc -l)
  if [ "$VERSIONS" -eq "0" ]; then
    echo "⚠️  WARNING: $SECRET has no versions"
    # Add placeholder for testing
    echo -n "test-placeholder-value" | gcloud secrets versions add $SECRET --data-file=- --project=$PROJECT_ID
  else
    echo "✅ $SECRET has $VERSIONS version(s)"
  fi
done
```

### Step 4: Pre-Deployment Checklist

```bash
#!/bin/bash
# save as: scripts/pp-pre-deploy-check.sh

set -e

PROJECT_ID="pipelinepilot-prod"
PROJECT_NUMBER="365258353703"
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
REASONING_SA="service-${PROJECT_NUMBER}@gcp-sa-aiplatform-re.iam.gserviceaccount.com"
SECRETS=("CLAY_API_KEY" "APOLLO_API_KEY" "CLEARBIT_API_KEY" "CRUNCHBASE_API_KEY" "ORCHESTRATOR_DEV_ID")

echo "=== PIPELINEPILOT PRE-DEPLOYMENT VALIDATION ==="
echo ""

# Check Layer 1: Cloud Build permissions
echo "Layer 1: Cloud Build Permissions..."
for ROLE in "roles/artifactregistry.writer" "roles/logging.logWriter"; do
  BINDING=$(gcloud projects get-iam-policy $PROJECT_ID \
    --flatten="bindings[].members" \
    --filter="bindings.members:serviceAccount:$COMPUTE_SA AND bindings.role:$ROLE" \
    --format="value(bindings.role)")

  if [ "$BINDING" == "$ROLE" ]; then
    echo "  ✅ $ROLE"
  else
    echo "  ❌ MISSING: $ROLE"
    exit 1
  fi
done

# Check Layer 3: AI Platform
echo ""
echo "Layer 3: AI Platform Permissions..."
BINDING=$(gcloud projects get-iam-policy $PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:$COMPUTE_SA AND bindings.role:roles/aiplatform.admin" \
  --format="value(bindings.role)")

if [ "$BINDING" == "roles/aiplatform.admin" ]; then
  echo "  ✅ roles/aiplatform.admin"
else
  echo "  ❌ MISSING: roles/aiplatform.admin"
  exit 1
fi

# Check Layer 4: Secret Manager (Reasoning Engine SA)
echo ""
echo "Layer 4: Secret Manager (Reasoning Engine)..."
for SECRET in CLAY_API_KEY APOLLO_API_KEY CLEARBIT_API_KEY CRUNCHBASE_API_KEY; do
  BINDING=$(gcloud secrets get-iam-policy $SECRET --project=$PROJECT_ID \
    --flatten="bindings[].members" \
    --filter="bindings.members:serviceAccount:$REASONING_SA" \
    --format="value(bindings.role)")

  if [ "$BINDING" == "roles/secretmanager.secretAccessor" ]; then
    echo "  ✅ $SECRET"
  else
    echo "  ❌ MISSING: $SECRET access for Reasoning Engine SA"
    exit 1
  fi
done

# Check Layer 5: Firestore
echo ""
echo "Layer 5: Firestore Permissions..."
BINDING=$(gcloud projects get-iam-policy $PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:$COMPUTE_SA AND bindings.role:roles/datastore.user" \
  --format="value(bindings.role)")

if [ "$BINDING" == "roles/datastore.user" ]; then
  echo "  ✅ roles/datastore.user"
else
  echo "  ❌ MISSING: roles/datastore.user"
  exit 1
fi

# Check secret versions
echo ""
echo "Secret Versioning..."
for SECRET in "${SECRETS[@]}"; do
  VERSIONS=$(gcloud secrets versions list $SECRET --project=$PROJECT_ID --format="value(name)" | wc -l)
  if [ "$VERSIONS" -eq "0" ]; then
    echo "  ❌ $SECRET has no versions"
    exit 1
  else
    echo "  ✅ $SECRET has $VERSIONS version(s)"
  fi
done

# Check TypeScript build
echo ""
echo "Build Validation..."
cd pipelinepilot-dashboard/functions
npm run build > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "  ✅ TypeScript build successful"
else
  echo "  ❌ TypeScript build failed"
  exit 1
fi

echo ""
echo "=========================================="
echo "✅ ALL PRE-DEPLOYMENT CHECKS PASSED!"
echo "=========================================="
echo ""
echo "Ready to deploy:"
echo "  cd pipelinepilot-dashboard"
echo "  firebase deploy --only functions"
```

### Step 5: Post-Deployment Verification

```bash
#!/bin/bash
# save as: scripts/pp-post-deploy-verify.sh

FUNCTION_URL="https://us-central1-pipelinepilot-prod.cloudfunctions.net/startCampaign"

echo "=== POST-DEPLOYMENT VERIFICATION ==="
echo ""

# Test endpoint
echo "Testing function endpoint..."
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST $FUNCTION_URL \
  -H "Content-Type: application/json" \
  -d '{
    "campaignId": "test-verify",
    "icp": "B2B SaaS",
    "domains": ["example.com"],
    "email": "test@example.com"
  }')

HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
RESPONSE_BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS/d')

if [ "$HTTP_STATUS" == "200" ]; then
  echo "✅ Function returned 200 OK"
  echo ""
  echo "Response:"
  echo "$RESPONSE_BODY" | jq '.'
else
  echo "❌ Function returned $HTTP_STATUS"
  echo "Response:"
  echo "$RESPONSE_BODY"
  exit 1
fi

# Check logs
echo ""
echo "Recent logs:"
gcloud functions logs read startCampaign \
  --region=us-central1 \
  --project=pipelinepilot-prod \
  --limit=10
```

### Service Account Permission Matrix

| Service Account | Purpose | Permissions |
|----------------|---------|-------------|
| `365258353703-compute@developer.gserviceaccount.com` | Run Firebase Functions, invoke RE | `artifactregistry.writer`, `aiplatform.admin`, `datastore.user`, `secretAccessor` on `ORCHESTRATOR_DEV_ID` |
| `service-365258353703@gcp-sa-aiplatform-re.iam.gserviceaccount.com` | Run Reasoning Engine, access API keys | `secretAccessor` on `CLAY_API_KEY`, `APOLLO_API_KEY`, `CLEARBIT_API_KEY`, `CRUNCHBASE_API_KEY` |
| `pp-dev@pipelinepilot-prod.iam.gserviceaccount.com` | (Optional) Custom SA for production | Same as Reasoning Engine SA |

---

## References

**Universal Resources:**
- GCP IAM Best Practices: https://cloud.google.com/iam/docs/best-practices
- Secret Manager Guide: https://cloud.google.com/secret-manager/docs/creating-and-accessing-secrets
- Service Accounts: https://cloud.google.com/iam/docs/service-accounts
- Cloud Functions IAM: https://cloud.google.com/functions/docs/securing/function-identity
- Firestore Security: https://cloud.google.com/firestore/docs/security/overview

**Project-Specific Documentation (PipelinePilot Example):**
- ESM/ADK SOP: `6767-PP-SOP-Functions-ESM-Orchestrator-Query.md`
- Deployment AAR: `0028-AA-DEPL-firebase-functions-deployment-success.md`
- Project Status: `0027-DR-EXEC-complete-project-status.md`
- Permission Matrix: `0028-AA-DEPL-firebase-functions-deployment-success.md` (Part: Permission Matrix)

---

## How to Use This SOP for Other Projects

1. **Copy this document** to your project's `000-docs/` folder
2. **Define your variables** in Step 1 (project ID, service accounts, secrets)
3. **Customize permission layers** based on your architecture
4. **Create project-specific scripts** using the templates in Appendix A
5. **Update the checklist** in Part 8 with your specific requirements
6. **Run pre-deploy validation** before every deployment
7. **Document lessons learned** and update this SOP

**Example Projects Where This SOP Applies:**
- Firebase Functions + Firestore + Secret Manager
- Cloud Run + Cloud SQL + Pub/Sub
- App Engine + BigQuery + Cloud Storage
- Vertex AI Reasoning Engine + external APIs
- Any GCP service requiring IAM permissions

---

**Document Status:** ✅ Universal Template - Mandatory for All GCP Projects
**Last Updated:** 2025-11-02T00:45:00Z
**Next Review:** After 5 projects successfully use this template
**Enforcement:** 🚨 NO DEPLOYMENT WITHOUT CHECKLIST COMPLETION 🚨

---

**End of Universal SOP**
