# Deployment Guide: PipelinePilot

**Document ID:** 006-OD-CICD-deployment-guide
**Created:** 2025-10-31
**Status:** Draft v0.2

---

## Prerequisites

### Required Accounts & Tools
- [ ] Google Cloud Platform account (billing enabled)
- [ ] GitHub account
- [ ] Stripe account
- [ ] Node.js 20+ installed locally
- [ ] gcloud CLI installed
- [ ] adk CLI installed (`pip install google-agent-sdk`)

### GCP APIs to Enable
```bash
gcloud services enable run.googleapis.com \
  firestore.googleapis.com \
  storage-api.googleapis.com \
  secretmanager.googleapis.com \
  aiplatform.googleapis.com \
  cloudbuild.googleapis.com
```

---

## Step 1: GitHub Repository Setup

### Create Private Repository
```bash
export GHUSER="YOUR_GITHUB_USERNAME"
gh repo create "$GHUSER/pipelinepilot" --private --clone
cd pipelinepilot

# Copy code to repo (if bootstrapping from template)
# ... (code already created)

git add .
git commit -m "feat: initial PipelinePilot scaffold (Vertex-native, multi-tenant)"
git push -u origin main
```

### Configure GitHub Secrets
```bash
# GCP Configuration
gh secret set GCP_PROJECT_ID --body "your-gcp-project"
gh secret set GCP_REGION --body "us-central1"
gh secret set VERTEX_STORAGE_BUCKET --body "vertex-ai-staging-your-project"

# Workload Identity Federation (WIF)
gh secret set WIF_PROVIDER --body "projects/123456/locations/global/workloadIdentityPools/gh-pool/providers/gh-provider"
gh secret set WIF_SERVICE_ACCOUNT --body "pipelinepilot-deployer@your-project.iam.gserviceaccount.com"

# Stripe (from Stripe Dashboard)
gh secret set STRIPE_SECRET_KEY --body "sk_live_..."
gh secret set STRIPE_PRICE_FLAT_MONTHLY --body "price_..."
gh secret set STRIPE_WEBHOOK_SECRET --body "whsec_..."

# Provider API Keys (optional - can use GSM instead)
gh secret set CLAY_API_KEY --body "sk_live_..."
gh secret set APOLLO_API_KEY --body "..."
gh secret set CLEARBIT_API_KEY --body "..."
gh secret set HUBSPOT_PRIVATE_APP_TOKEN --body "pat-..."
gh secret set HUNTER_API_KEY --body "..."
```

---

## Step 2: GCP Setup

### Create GCP Project
```bash
export PROJECT_ID="pipelinepilot-prod"
gcloud projects create $PROJECT_ID --name="PipelinePilot Production"
gcloud config set project $PROJECT_ID

# Link billing account
gcloud billing accounts list
gcloud billing projects link $PROJECT_ID --billing-account=BILLING_ACCOUNT_ID
```

### Enable Required APIs
```bash
gcloud services enable \
  run.googleapis.com \
  firestore.googleapis.com \
  storage-api.googleapis.com \
  secretmanager.googleapis.com \
  aiplatform.googleapis.com \
  cloudbuild.googleapis.com \
  cloudscheduler.googleapis.com
```

### Create Firestore Database
```bash
gcloud firestore databases create --location=us-central
```

### Create Vertex AI Storage Bucket
```bash
export BUCKET_NAME="vertex-ai-staging-${PROJECT_ID}"
gsutil mb -l us-central1 gs://$BUCKET_NAME/
gsutil iam ch allUsers:objectViewer gs://$BUCKET_NAME/  # Or more restrictive
```

### Create Service Accounts

#### Deployer (CI/CD)
```bash
gcloud iam service-accounts create pipelinepilot-deployer \
  --display-name="PipelinePilot CI/CD Deployer"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:pipelinepilot-deployer@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:pipelinepilot-deployer@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:pipelinepilot-deployer@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:pipelinepilot-deployer@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"
```

#### Runtime (Cloud Run)
```bash
gcloud iam service-accounts create pipelinepilot-runtime \
  --display-name="PipelinePilot Runtime Service Account"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:pipelinepilot-runtime@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/datastore.user"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:pipelinepilot-runtime@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:pipelinepilot-runtime@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"
```

### Setup Workload Identity Federation (WIF)

```bash
# Create workload identity pool
gcloud iam workload-identity-pools create github-pool \
  --location=global \
  --display-name="GitHub Actions Pool"

# Create provider
gcloud iam workload-identity-pools providers create-oidc github-provider \
  --location=global \
  --workload-identity-pool=github-pool \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='YOUR_GITHUB_USERNAME/pipelinepilot'"

# Bind service account
gcloud iam service-accounts add-iam-policy-binding \
  pipelinepilot-deployer@${PROJECT_ID}.iam.gserviceaccount.com \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/attribute.repository/YOUR_GITHUB_USERNAME/pipelinepilot"

# Get WIF provider name for GitHub secret
gcloud iam workload-identity-pools providers describe github-provider \
  --location=global \
  --workload-identity-pool=github-pool \
  --format="value(name)"
# Copy this value to WIF_PROVIDER GitHub secret
```

---

## Step 3: Store Secrets in Secret Manager

```bash
# Stripe
echo -n "sk_live_..." | gcloud secrets create stripe-secret-key --data-file=-
echo -n "whsec_..." | gcloud secrets create stripe-webhook-secret --data-file=-

# Provider API Keys
echo -n "sk_clay_..." | gcloud secrets create clay-api-key --data-file=-
echo -n "..." | gcloud secrets create apollo-api-key --data-file=-
echo -n "..." | gcloud secrets create clearbit-api-key --data-file=-
echo -n "pat-..." | gcloud secrets create hubspot-token --data-file=-
echo -n "..." | gcloud secrets create hunter-api-key --data-file=-

# Grant access to runtime service account
for secret in stripe-secret-key stripe-webhook-secret clay-api-key apollo-api-key clearbit-api-key hubspot-token hunter-api-key; do
  gcloud secrets add-iam-policy-binding $secret \
    --member="serviceAccount:pipelinepilot-runtime@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done
```

---

## Step 4: Deploy via GitHub Actions

### Trigger Deployment
```bash
git push origin main
```

GitHub Actions will:
1. Build TypeScript
2. Deploy Cloud Run service
3. Deploy Vertex AI agents
4. Run Vertex-purity check

### Monitor Deployment
```bash
# Watch GitHub Actions
gh run watch

# Check Cloud Run deployment
gcloud run services describe pipelinepilot-tools --region=us-central1

# Get service URL
gcloud run services describe pipelinepilot-tools \
  --region=us-central1 \
  --format='value(status.url)'
```

---

## Step 5: Setup Cloud Scheduler (Monthly Billing)

```bash
# Create Cloud Scheduler job for monthly billing
export SERVICE_URL=$(gcloud run services describe pipelinepilot-tools \
  --region=us-central1 \
  --format='value(status.url)')

gcloud scheduler jobs create http run-monthly-billing \
  --location=us-central1 \
  --schedule="0 0 1 * *" \
  --uri="${SERVICE_URL}/billing/run-monthly" \
  --http-method=POST \
  --oidc-service-account-email=pipelinepilot-runtime@${PROJECT_ID}.iam.gserviceaccount.com \
  --oidc-token-audience="${SERVICE_URL}"
```

---

## Step 6: Configure Stripe Webhook

### Get Cloud Run URL
```bash
echo $SERVICE_URL
# Example: https://pipelinepilot-tools-abc123-uc.a.run.app
```

### Add Webhook in Stripe Dashboard
1. Go to: https://dashboard.stripe.com/webhooks
2. Click "Add endpoint"
3. URL: `${SERVICE_URL}/billing/stripe-webhook`
4. Events to send:
   - `invoice.paid`
   - `invoice.payment_failed`
5. Copy **Signing secret** to Secret Manager:
   ```bash
   echo -n "whsec_..." | gcloud secrets versions add stripe-webhook-secret --data-file=-
   ```

---

## Step 7: Test Deployment

### Health Check
```bash
curl ${SERVICE_URL}/health
# Expected: {"status":"healthy","timestamp":"..."}
```

### Create Test Tenant
```bash
curl -X POST ${SERVICE_URL}/tenants \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Agency",
    "plan": "starter",
    "email": "test@agency.com"
  }'
# Expected: {"status":"created","tenantId":"t_..."}
```

### Test Provider Call (Clay)
```bash
export TENANT_ID="t_..."
curl -X POST ${SERVICE_URL}/providers/${TENANT_ID}/clay/enrich \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "example.com"
  }'
# Expected: {"status":"ok","provider":"clay","data":{...}}
```

---

## Step 8: Monitoring Setup

### Create Log-Based Metrics
```bash
# Error rate metric
gcloud logging metrics create error_rate \
  --description="Error rate for Cloud Run" \
  --log-filter='resource.type="cloud_run_revision" AND severity>=ERROR'

# Latency metric
gcloud logging metrics create api_latency \
  --description="API latency" \
  --log-filter='resource.type="cloud_run_revision" AND httpRequest.latency>0'
```

### Create Alerts
```bash
# Error rate alert (>5%)
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="PipelinePilot Error Rate Alert" \
  --condition-display-name="Error rate > 5%" \
  --condition-threshold-value=0.05 \
  --condition-threshold-duration=300s
```

---

## Step 9: Update Agent Configurations

### Update PLACEHOLDER-TOOLS-URL in agents/
```bash
# In agents/orchestrator.yaml, replace:
# openapi:
#   url: https://PLACEHOLDER-TOOLS-URL/providers/{tenant}/clay/enrich

# With actual Cloud Run URL:
sed -i "s|PLACEHOLDER-TOOLS-URL|${SERVICE_URL}|g" agents/orchestrator.yaml

# Commit and redeploy
git add agents/orchestrator.yaml
git commit -m "fix: update agent tool URLs with production Cloud Run URL"
git push
```

---

## Maintenance & Operations

### View Logs
```bash
# Cloud Run logs
gcloud run services logs read pipelinepilot-tools --region=us-central1

# Firestore operations
gcloud logging read "resource.type=firestore.googleapis.com" --limit=50

# Vertex AI agent logs
gcloud logging read "resource.type=aiplatform.googleapis.com" --limit=50
```

### Scale Cloud Run
```bash
# Increase max instances
gcloud run services update pipelinepilot-tools \
  --region=us-central1 \
  --max-instances=200

# Set min instances (always-on, higher cost)
gcloud run services update pipelinepilot-tools \
  --region=us-central1 \
  --min-instances=1
```

### Update Environment Variables
```bash
gcloud run services update pipelinepilot-tools \
  --region=us-central1 \
  --set-env-vars="LOG_LEVEL=debug"
```

### Rollback Deployment
```bash
# List revisions
gcloud run revisions list --service=pipelinepilot-tools --region=us-central1

# Rollback to previous revision
gcloud run services update-traffic pipelinepilot-tools \
  --region=us-central1 \
  --to-revisions=pipelinepilot-tools-00002-xyz=100
```

---

## Cost Management

### Daily Budget Alert
```bash
# Set budget in GCP Console: Billing > Budgets & alerts
# Recommended: $100/day alert, $500/day hard stop (contact support)
```

### Monitor Costs
```bash
# View current month costs
gcloud billing accounts list
gcloud billing budgets list --billing-account=BILLING_ACCOUNT_ID
```

---

## Troubleshooting

### Cloud Run fails to start
```bash
# Check build logs
gcloud builds list --limit=5

# Check deployment logs
gcloud run services logs read pipelinepilot-tools --region=us-central1 --limit=100
```

### Firestore permission errors
```bash
# Verify service account roles
gcloud projects get-iam-policy $PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.members:pipelinepilot-runtime@${PROJECT_ID}.iam.gserviceaccount.com"
```

### Vertex AI agent deployment fails
```bash
# Check ADK version
adk --version

# Verbose deployment
adk deploy agent_engine --verbose \
  --project=$PROJECT_ID \
  --region=us-central1 \
  --staging_bucket=$BUCKET_NAME \
  agents/orchestrator.yaml
```

---

## Appendix

- **Architecture:** [002-AT-ARCH-system-architecture.md](./002-AT-ARCH-system-architecture.md)
- **API Reference:** [003-DR-APIM-api-reference.md](./003-DR-APIM-api-reference.md)
- **Leasing Model:** [007-PP-LEAS-leasing-model.md](./007-PP-LEAS-leasing-model.md)

---

**Document Status:** Draft
**Next Review:** 2025-11-07
