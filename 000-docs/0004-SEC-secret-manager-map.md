# Secret Manager Configuration

**Last Updated:** 2025-11-01
**Status:** Pending Configuration

---

## Required Secrets

### Orchestrator Engine ID

**Secret Name:** `ORCHESTRATOR_DEV_ID`
**Type:** Firebase Functions Secret (Gen2)
**Value:** `projects/365258353703/locations/us-central1/reasoningEngines/1703754839890067456`
**Usage:** Firebase Functions environment variable for Engine ID
**Configure:**
```bash
cd pipelinepilot-dashboard
firebase functions:secrets:set ORCHESTRATOR_DEV_ID --data="projects/365258353703/locations/us-central1/reasoningEngines/1703754839890067456"
```

**Status:** ⏳ PENDING

---

### Tool API Keys

**Used by:** Orchestrator agent tools (Clay, Apollo, Clearbit, Crunchbase)
**Storage:** Google Cloud Secret Manager
**Access:** Orchestrator Engine service account (pp-dev@pipelinepilot-prod.iam.gserviceaccount.com)

#### CLAY_API_KEY
**Purpose:** Clay company lookup API
**Configure:**
```bash
echo "YOUR_CLAY_API_KEY" | gcloud secrets create CLAY_API_KEY --data-file=-
```
**Status:** ⏳ PENDING

#### APOLLO_API_KEY
**Purpose:** Apollo.io people search API
**Configure:**
```bash
echo "YOUR_APOLLO_API_KEY" | gcloud secrets create APOLLO_API_KEY --data-file=-
```
**Status:** ⏳ PENDING

#### CLEARBIT_API_KEY
**Purpose:** Clearbit contact enrichment API
**Configure:**
```bash
echo "YOUR_CLEARBIT_API_KEY" | gcloud secrets create CLEARBIT_API_KEY --data-file=-
```
**Status:** ⏳ PENDING

#### CRUNCHBASE_API_KEY
**Purpose:** Crunchbase company funding data API
**Configure:**
```bash
echo "YOUR_CRUNCHBASE_API_KEY" | gcloud secrets create CRUNCHBASE_API_KEY --data-file=-
```
**Status:** ⏳ PENDING

---

## Service Account Permissions

**Service Account:** `pp-dev@pipelinepilot-prod.iam.gserviceaccount.com`

**Required Roles:**
- `roles/secretmanager.secretAccessor` - Access secrets
- `roles/aiplatform.user` - Access Vertex AI Agent Engine
- `roles/serviceusage.serviceUsageConsumer` - Use GCP services

**Grant Access to Secrets:**
```bash
for SECRET in CLAY_API_KEY APOLLO_API_KEY CLEARBIT_API_KEY CRUNCHBASE_API_KEY; do
  gcloud secrets add-iam-policy-binding $SECRET \
    --member="serviceAccount:pp-dev@pipelinepilot-prod.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done
```

---

## Verification

### Test Secret Access
```bash
# Test ORCHESTRATOR_DEV_ID
firebase functions:config:get

# Test Cloud Secret Manager access
gcloud secrets versions access latest --secret="CLAY_API_KEY"
```

### Smoke Test (Mock Mode)
Before configuring API keys, smoke test can run in mock mode:
```bash
SMOKE_ALLOW_MISSING_KEYS=1 ./scripts/smoke.sh
```

Expected result: MOCK PASS (function called but secrets not configured)

### Full Smoke Test
After configuring all secrets:
```bash
./scripts/smoke.sh
```

Expected result: All 4 tools execute successfully

---

## Security Notes

- **Never commit secrets** to version control
- Use Secret Manager for all API keys
- Use Firebase Secrets for Functions environment variables
- Rotate keys periodically
- Limit service account permissions to minimum required

---

**Last Updated:** 2025-11-01
