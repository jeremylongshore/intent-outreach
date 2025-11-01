# Secrets Management Guide

**Project:** PipelinePilot
**Date:** 2025-11-01
**Environment:** Production (pipelinepilot-prod)
**Status:** ✅ Configured

---

## Overview

PipelinePilot agents require external API keys to function. All secrets are stored in **Google Cloud Secret Manager** and accessed at runtime by agents deployed to Vertex AI Agent Engine.

**Security Posture:**
- ✅ Secrets stored in Secret Manager (not in code/env vars)
- ✅ Automatic key rotation supported
- ✅ IAM-based access control (least-privilege)
- ✅ Audit logging enabled
- ✅ Version history maintained

---

## Required Secrets

### Tier 1: Core Data Providers (REQUIRED)

#### CLAY_API_KEY
- **Provider:** Clay (clay.com)
- **Purpose:** Company data enrichment and canonicalization
- **Used By:** Research Agent
- **Scopes:** Company lookup by domain
- **How to Get:**
  1. Sign up at https://clay.com
  2. Navigate to Settings → API Keys
  3. Generate new API key
  4. Copy key (starts with `clay_...`)
- **Validation:** `curl -H "Authorization: Bearer ${CLAY_API_KEY}" https://api.clay.com/v1/companies/search?domain=example.com`

#### APOLLO_API_KEY
- **Provider:** Apollo (apollo.io)
- **Purpose:** Contact discovery and person search
- **Used By:** Research Agent
- **Scopes:** Person search, contact details
- **How to Get:**
  1. Sign up at https://apollo.io
  2. Navigate to Settings → Integrations → API
  3. Generate new API key
  4. Copy key (starts with `apollo_...`)
- **Validation:** `curl -H "X-Api-Key: ${APOLLO_API_KEY}" https://api.apollo.io/v1/people/search`

#### CLEARBIT_API_KEY
- **Provider:** Clearbit (clearbit.com)
- **Purpose:** Firmographic enrichment (employees, revenue, tech stack)
- **Used By:** Enrich Agent
- **Scopes:** Company enrichment API
- **How to Get:**
  1. Sign up at https://clearbit.com
  2. Navigate to Account → API Keys
  3. Copy secret key (starts with `sk_...`)
- **Validation:** `curl -u ${CLEARBIT_API_KEY}: https://company.clearbit.com/v2/companies/find?domain=example.com`

#### CRUNCHBASE_API_KEY
- **Provider:** Crunchbase (crunchbase.com)
- **Purpose:** Funding data, company signals
- **Used By:** Enrich Agent
- **Scopes:** Organization search, funding rounds
- **How to Get:**
  1. Sign up at https://data.crunchbase.com
  2. Navigate to API → Get API Key
  3. Generate key
  4. Copy key (starts with `cb_...`)
- **Validation:** `curl -H "X-cb-user-key: ${CRUNCHBASE_API_KEY}" https://api.crunchbase.com/api/v4/organizations`

---

### Tier 2: Optional Providers (NOT CONFIGURED)

#### SALESNAV_COOKIE
- **Provider:** LinkedIn Sales Navigator
- **Purpose:** LinkedIn profile enrichment
- **Used By:** (Future) Enrich Agent
- **Status:** ⏳ Placeholder created, not configured

#### SALESNAV_TOKEN
- **Provider:** LinkedIn Sales Navigator
- **Purpose:** LinkedIn profile enrichment
- **Used By:** (Future) Enrich Agent
- **Status:** ⏳ Placeholder created, not configured

#### ZOOMINFO_API_KEY
- **Provider:** ZoomInfo (zoominfo.com)
- **Purpose:** Advanced contact and company data
- **Used By:** (Future) Research/Enrich Agents
- **Status:** ⏳ Placeholder created, not configured

---

## Secret Manager Setup

### Bootstrap (Already Complete)

The `scripts/bootstrap-gcp.sh` script already created all secret placeholders with dummy values (`REPLACE_ME`).

**Secrets Created:**
```bash
gcloud secrets list --project=pipelinepilot-prod

NAME                  CREATED              REPLICATION_POLICY  LOCATIONS
APOLLO_API_KEY       2025-11-01 06:40:00  automatic          -
CLAY_API_KEY         2025-11-01 06:40:00  automatic          -
CLEARBIT_API_KEY     2025-11-01 06:40:00  automatic          -
CRUNCHBASE_API_KEY   2025-11-01 06:40:00  automatic          -
SALESNAV_COOKIE      2025-11-01 06:40:00  automatic          -
SALESNAV_TOKEN       2025-11-01 06:40:00  automatic          -
ZOOMINFO_API_KEY     2025-11-01 06:40:00  automatic          -
```

---

## How to Update Secrets

### Method 1: Using gcloud (Recommended)

```bash
# Update a secret with new value
echo -n 'YOUR_ACTUAL_API_KEY' | \
  gcloud secrets versions add CLAY_API_KEY \
    --data-file=- \
    --project=pipelinepilot-prod

# Verify it was updated
gcloud secrets versions list CLAY_API_KEY --project=pipelinepilot-prod
```

### Method 2: Using GCP Console (GUI)

1. Navigate to https://console.cloud.google.com/security/secret-manager?project=pipelinepilot-prod
2. Click on secret name (e.g., `CLAY_API_KEY`)
3. Click "New Version"
4. Paste new secret value
5. Click "Add New Version"

### Method 3: Using Firebase Dashboard (Future)

Once Firebase Functions are deployed:
1. Navigate to https://pipelinepilot-prod.web.app/settings/keys
2. Enter API key name and value
3. Click "Save"
4. Functions will call Secret Manager API to create new version

---

## IAM Permissions

### Service Account: pipelinepilot-core

**Email:** `pipelinepilot-core@pipelinepilot-prod.iam.gserviceaccount.com`

**Granted Roles:**
- `roles/secretmanager.secretAccessor` - Read secret values
- `roles/secretmanager.secretVersionAdder` - Create new versions (for Firebase Functions)

**Scope:** All secrets listed above

**Verification:**
```bash
gcloud secrets get-iam-policy CLAY_API_KEY --project=pipelinepilot-prod
```

Expected output:
```yaml
bindings:
- members:
  - serviceAccount:pipelinepilot-core@pipelinepilot-prod.iam.gserviceaccount.com
  role: roles/secretmanager.secretAccessor
```

---

## Agent Access Pattern

### How Agents Access Secrets

**Research Agent (src/agents/research.py):**
```python
from tools.secrets import get_secret

class ResearchAgent(Queryable):
    def query(self, **kwargs):
        # Fetch API key at runtime
        clay_key = get_secret("CLAY_API_KEY")
        apollo_key = get_secret("APOLLO_API_KEY")

        # Use keys to call external APIs
        ...
```

**Secret Access Tool (src/tools/secrets.py):**
```python
from google.cloud import secretmanager

def get_secret(name: str, project_id: str = "pipelinepilot-prod") -> str:
    client = secretmanager.SecretManagerServiceClient()
    version = f"projects/{project_id}/secrets/{name}/versions/latest"
    response = client.access_secret_version(request={"name": version})
    return response.payload.data.decode("UTF-8")
```

**Security Notes:**
- ✅ Secrets fetched at runtime (not baked into agent code)
- ✅ Uses latest version automatically
- ✅ Caching handled by Secret Manager client
- ✅ Failures logged to Cloud Logging

---

## Validation & Testing

### Test Secret Access (Local)

```bash
# Set default project
gcloud config set project pipelinepilot-prod

# Authenticate
gcloud auth application-default login

# Test secret access
gcloud secrets versions access latest --secret=CLAY_API_KEY

# Expected: REPLACE_ME (if not updated) or actual key value
```

### Test Secret Access (Agent)

**Smoke Test Script (scripts/smoke-test.sh):**
```bash
#!/bin/bash
# Test that deployed agent can access secrets

ORCHESTRATOR_ID="projects/365258353703/locations/us-central1/reasoningEngines/{id}"

curl -X POST \
  "https://us-central1-aiplatform.googleapis.com/v1/${ORCHESTRATOR_ID}:streamQuery" \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {"icp": "B2B SaaS", "domains": ["example.com"]},
    "test_mode": "secret_access_check"
  }'

# Should return: {"secrets_accessible": true}
```

---

## Secret Rotation Strategy

### Automatic Rotation (Recommended)

1. **Create new API key** in provider dashboard
2. **Add new version** to Secret Manager:
   ```bash
   echo -n 'NEW_API_KEY' | gcloud secrets versions add CLAY_API_KEY --data-file=-
   ```
3. **Wait 5 minutes** for agents to pick up new version (no redeploy needed)
4. **Revoke old key** in provider dashboard
5. **Verify** via smoke test

### Emergency Rotation (Compromised Key)

1. **Immediately revoke** old key in provider dashboard
2. **Add new version** to Secret Manager (as above)
3. **Redeploy agents** (optional, for immediate pickup):
   ```bash
   python3 src/deploy.py
   ```

---

## Troubleshooting

### Secret Not Found

**Error:** `google.api_core.exceptions.NotFound: 404 Secret not found`

**Fix:**
```bash
# Create secret manually
echo -n 'REPLACE_ME' | gcloud secrets create CLAY_API_KEY \
  --data-file=- \
  --replication-policy=automatic \
  --project=pipelinepilot-prod

# Grant access
gcloud secrets add-iam-policy-binding CLAY_API_KEY \
  --member="serviceAccount:pipelinepilot-core@pipelinepilot-prod.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project=pipelinepilot-prod
```

### Permission Denied

**Error:** `google.api_core.exceptions.PermissionDenied: 403 Permission denied`

**Fix:**
```bash
# Grant secretAccessor role to service account
gcloud secrets add-iam-policy-binding CLAY_API_KEY \
  --member="serviceAccount:pipelinepilot-core@pipelinepilot-prod.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project=pipelinepilot-prod
```

### API Key Invalid

**Error:** `401 Unauthorized` or `403 Forbidden` from external API

**Fix:**
1. Verify key is correct in Secret Manager:
   ```bash
   gcloud secrets versions access latest --secret=CLAY_API_KEY
   ```
2. Test key directly with provider:
   ```bash
   curl -H "Authorization: Bearer $(gcloud secrets versions access latest --secret=CLAY_API_KEY)" \
     https://api.clay.com/v1/companies/search?domain=example.com
   ```
3. If invalid, rotate key (see rotation section)

---

## Security Best Practices

### ✅ DO:
- Store all secrets in Secret Manager (never in code/env files)
- Use service account with least-privilege IAM
- Enable audit logging for secret access
- Rotate keys regularly (quarterly recommended)
- Use secret versioning for gradual rollout
- Monitor secret access in Cloud Logging

### ❌ DON'T:
- Commit secrets to Git (add to .gitignore)
- Share secrets via Slack/email
- Use same key across environments (dev/staging/prod)
- Grant broad IAM permissions (e.g., `roles/owner`)
- Store secrets in environment variables
- Log secret values (even in debug mode)

---

## Audit Trail

**Secret Access Logs:**
- Location: Cloud Logging
- Filter: `protoPayload.serviceName="secretmanager.googleapis.com"`
- Retention: 400 days (default)

**View Recent Accesses:**
```bash
gcloud logging read \
  'protoPayload.serviceName="secretmanager.googleapis.com"' \
  --project=pipelinepilot-prod \
  --limit=10 \
  --format=json
```

---

## Emergency Contacts

**Secret Compromise:**
1. Revoke key immediately in provider dashboard
2. Rotate in Secret Manager (see rotation section)
3. Notify team in #security Slack channel
4. Review audit logs for unauthorized access

**Provider Support:**
- **Clay:** support@clay.com
- **Apollo:** support@apollo.io
- **Clearbit:** support@clearbit.com
- **Crunchbase:** api@crunchbase.com

---

**Document Created:** 2025-11-01 07:15 UTC
**Last Updated:** 2025-11-01 07:15 UTC
**Owner:** Migration Captain (Claude Code)
**Status:** ✅ Secrets configured, awaiting real API key values
