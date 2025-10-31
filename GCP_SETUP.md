# GCP Setup for GitHub Actions Deployment

This guide walks you through setting up Google Cloud Platform for automated deployment via GitHub Actions using Workload Identity Federation.

---

## Prerequisites

- GCP account with billing enabled
- `gcloud` CLI authenticated
- GitHub repository: https://github.com/jeremylongshore/pipelinepilot

---

## Step 1: Create GCP Project

```bash
# Set variables
export PROJECT_ID=pipelinepilot-prod
export PROJECT_NAME="PipelinePilot Prod"
export REGION=us-central1
export FIRESTORE_LOCATION=us-central

# List billing accounts and pick one
gcloud beta billing accounts list

# Set your billing account ID
export BILLING_ACCOUNT=REPLACE_WITH_YOUR_BILLING_ACCOUNT_ID

# Create project
gcloud projects create "$PROJECT_ID" --name="$PROJECT_NAME"

# Link billing
gcloud beta billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT"

# Set as default project
gcloud config set project "$PROJECT_ID"
gcloud config set compute/region "$REGION"
```

---

## Step 2: Enable Required APIs

```bash
gcloud services enable \
  aiplatform.googleapis.com \
  firestore.googleapis.com \
  secretmanager.googleapis.com \
  storage.googleapis.com \
  iam.googleapis.com \
  serviceusage.googleapis.com \
  cloudresourcemanager.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com
```

---

## Step 3: Create Firestore Database

```bash
gcloud firestore databases create --location="$FIRESTORE_LOCATION" || true
```

---

## Step 4: Create Vertex AI Staging Bucket

```bash
gsutil mb -l "$REGION" -p "$PROJECT_ID" "gs://vertex-$PROJECT_ID-staging" || true
gsutil uniformbucketlevelaccess set on "gs://vertex-$PROJECT_ID-staging"
gsutil versioning set on "gs://vertex-$PROJECT_ID-staging"
```

---

## Step 5: Create Service Account

```bash
# Create service account
gcloud iam service-accounts create pipelinepilot-core \
  --display-name="PipelinePilot Core" \
  --project="$PROJECT_ID"

export SA="pipelinepilot-core@$PROJECT_ID.iam.gserviceaccount.com"

# Assign roles (least privilege)
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA" \
  --role="roles/aiplatform.user"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA" \
  --role="roles/secretmanager.secretAccessor"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA" \
  --role="roles/datastore.user"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA" \
  --role="roles/storage.objectAdmin"

# Allow service account to impersonate itself (for workflows)
gcloud iam service-accounts add-iam-policy-binding "$SA" \
  --member="serviceAccount:$SA" \
  --role="roles/iam.serviceAccountUser"
```

---

## Step 6: Create Secret Manager Secrets

```bash
# Create secrets for BYO API keys
for secret in CLAY_API_KEY APOLLO_API_KEY CLEARBIT_API_KEY CRUNCHBASE_API_KEY ZOOMINFO_API_KEY SALESNAV_TOKEN SALESNAV_COOKIE; do
  gcloud secrets create "$secret" --replication-policy="automatic" || true
done

# Example: Set a secret value (replace REPLACE_ME with actual key)
echo -n "REPLACE_ME" | gcloud secrets versions add CLAY_API_KEY --data-file=-

# Grant service account access to secrets
for secret in CLAY_API_KEY APOLLO_API_KEY CLEARBIT_API_KEY CRUNCHBASE_API_KEY ZOOMINFO_API_KEY SALESNAV_TOKEN SALESNAV_COOKIE; do
  gcloud secrets add-iam-policy-binding "$secret" \
    --member="serviceAccount:$SA" \
    --role="roles/secretmanager.secretAccessor"
done
```

---

## Step 7: Setup Workload Identity Federation (GitHub Actions)

```bash
export POOL=github-pool
export PROVIDER=github-provider
export REPO=jeremylongshore/pipelinepilot

# Create workload identity pool
gcloud iam workload-identity-pools create "$POOL" \
  --location=global \
  --display-name="GitHub Pool" \
  --project="$PROJECT_ID"

# Create OIDC provider
gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" \
  --location=global \
  --workload-identity-pool="$POOL" \
  --display-name="GitHub OIDC" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --project="$PROJECT_ID"

# Get project number
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"

# Allow GitHub Actions to impersonate the service account
gcloud iam service-accounts add-iam-policy-binding "$SA" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/attribute.repository/$REPO" \
  --project="$PROJECT_ID"

# Output values for GitHub Secrets
echo ""
echo "=== Add these to GitHub Secrets ==="
echo "WIF_PROVIDER=projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/providers/$PROVIDER"
echo "GCP_SA_EMAIL=$SA"
echo "GCP_PROJECT=$PROJECT_ID"
echo "GCP_REGION=$REGION"
```

---

## Step 8: Configure GitHub Secrets

Go to: https://github.com/jeremylongshore/pipelinepilot/settings/secrets/actions

Add these secrets:

| Secret Name | Value |
|-------------|-------|
| `WIF_PROVIDER` | `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/providers/github-provider` |
| `GCP_SA_EMAIL` | `pipelinepilot-core@pipelinepilot-prod.iam.gserviceaccount.com` |
| `GCP_PROJECT` | `pipelinepilot-prod` |
| `GCP_REGION` | `us-central1` |

---

## Step 9: Trigger Deployment

Push to main branch or trigger manually:

```bash
# Push code (will trigger deployment)
git push origin main

# Or trigger manually via GitHub UI:
# https://github.com/jeremylongshore/pipelinepilot/actions
```

---

## Verification

### Check Firestore
```bash
gcloud firestore databases list --project="$PROJECT_ID"
```

### Check Staging Bucket
```bash
gsutil ls -p "$PROJECT_ID"
```

### Check Service Account
```bash
gcloud iam service-accounts list --project="$PROJECT_ID"
```

### Check Secrets
```bash
gcloud secrets list --project="$PROJECT_ID"
```

### Check Deployed Agents
```bash
# After deployment via GitHub Actions
gcloud ai models list --region="$REGION" --project="$PROJECT_ID"
```

---

## Troubleshooting

### GitHub Actions fails with "Permission denied"
- Verify WIF_PROVIDER secret is correct
- Check service account has workloadIdentityUser role
- Ensure repository name matches exactly

### "Billing not enabled" error
- Verify billing account is linked: `gcloud beta billing projects describe "$PROJECT_ID"`
- Link billing if needed: `gcloud beta billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT"`

### API not enabled errors
- Re-run Step 2 to enable all required APIs
- Check enabled APIs: `gcloud services list --enabled --project="$PROJECT_ID"`

### Firestore already exists
- This is OK, the `|| true` handles it
- Verify location: `gcloud firestore databases describe --project="$PROJECT_ID"`

---

## Security Best Practices

1. **Least Privilege:** Service account only has required roles
2. **WIF over Keys:** No service account keys needed
3. **Secret Manager:** All API keys in Secret Manager, never in code
4. **Private Repo:** GitHub repo is private
5. **Audit Logging:** Enable Cloud Audit Logs for compliance

---

## Cost Estimates

**Phase 1 (Foundation - this setup):**
- Firestore: ~$0.01/day (minimal reads/writes)
- Secret Manager: ~$0.06/month (7 secrets)
- Cloud Storage: ~$0.02/month (staging bucket)
- Vertex AI: $0 (no deployed models yet)

**Phase 2 (With Connectors):**
- Vertex AI: ~$0.001 per agent invocation
- External APIs: Billed by provider (user pays with BYO keys)

**Total Phase 1:** < $1/month

---

## Next Steps

1. ✅ Run all commands in this guide
2. ✅ Add secrets to GitHub
3. ✅ Push code to trigger deployment
4. ⏭️ Monitor GitHub Actions workflow
5. ⏭️ Begin Phase 2: Implement connector logic

---

**Last Updated:** 2025-10-31
**Status:** Ready for execution
