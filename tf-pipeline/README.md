# PipelinePilot Terraform Infrastructure

This directory contains Terraform templates for deploying PipelinePilot infrastructure on Google Cloud Platform.

## Architecture

PipelinePilot uses a **hybrid architecture**:

```
Firebase Hosting (Dashboard)
       ↓
Firebase Functions Gen2 (Gateway - Node 20 ESM)
       ↓
Vertex AI Agent Engine (Orchestrator - Python ADK)
       ↓
External APIs (Clay, Apollo, Clearbit, Crunchbase)
       ↓
Firestore (Logs & Campaign Data)
```

## Infrastructure Components

### Created by Terraform

- **Google Cloud APIs** - Enables required services
- **Service Account** - `pp-dev@PROJECT_ID.iam.gserviceaccount.com`
- **IAM Roles** - Vertex AI, Secret Manager, Firestore access
- **GCS Bucket** - Agent staging bucket for Reasoning Engine
- **Firestore Database** - Native mode database
- **Secret Manager** - Secrets for orchestrator ID and external APIs

### NOT Managed by Terraform

- **Firebase Hosting** - Managed via `firebase deploy --only hosting`
- **Firebase Functions** - Managed via `firebase deploy --only functions`
- **Vertex AI Reasoning Engine** - Deployed via Python SDK (`src/deploy_with_wrapper.py`)

## Prerequisites

1. **GCP Project** with billing enabled
2. **gcloud CLI** authenticated:
   ```bash
   gcloud auth application-default login
   gcloud config set project PROJECT_ID
   ```
3. **Terraform** >= 1.5.0 installed
4. **Firebase CLI** installed and authenticated
5. **Owner or Editor role** on GCP project

## Quick Start

### 1. Configure Variables

```bash
cd /home/jeremy/000-projects/pipelinepilot/tf-pipeline

# Copy example config
cp terraform.tfvars.example terraform.tfvars

# Edit with your values
nano terraform.tfvars
```

**Required changes in `terraform.tfvars`:**
- `project_id` - Your GCP project ID
- `staging_bucket_name` - Must be globally unique!

### 2. Initialize Terraform

```bash
terraform init
```

### 3. Plan Infrastructure

```bash
terraform plan
```

Review the plan carefully. This will create:
- 1 service account
- 5+ IAM bindings
- 1 GCS bucket
- 1 Firestore database
- 5 Secret Manager secrets
- Enable 8 GCP APIs

### 4. Apply Infrastructure

```bash
terraform apply
```

Type `yes` when prompted.

### 5. Populate Secrets

After Terraform completes, populate the API secrets:

```bash
# Orchestrator ID (get from Reasoning Engine deployment)
echo -n "projects/PROJECT_ID/locations/REGION/reasoningEngines/ENGINE_ID" | \
  gcloud secrets versions add ORCHESTRATOR_DEV_ID --data-file=-

# External API Keys
echo -n "YOUR_CLAY_API_KEY" | \
  gcloud secrets versions add CLAY_API_KEY --data-file=-

echo -n "YOUR_APOLLO_API_KEY" | \
  gcloud secrets versions add APOLLO_API_KEY --data-file=-

# Repeat for CLEARBIT_API_KEY and CRUNCHBASE_API_KEY
```

### 6. Deploy Application Components

```bash
# Deploy Orchestrator to Vertex AI
cd /home/jeremy/000-projects/pipelinepilot
source venv-deploy/bin/activate
python3 src/deploy_with_wrapper.py

# Deploy Firebase (when Cloud Build is fixed)
cd pipelinepilot-dashboard
firebase deploy --only hosting
firebase deploy --only functions
```

## Outputs

After `terraform apply`, you'll see:

```bash
terraform output
```

Outputs include:
- Service account email
- Staging bucket name
- Secret IDs
- Deployment commands (copy-paste ready)

## File Structure

```
tf-pipeline/
├── main.tf                    # Main infrastructure resources
├── variables.tf               # Input variables
├── outputs.tf                 # Output values
├── terraform.tfvars.example   # Example configuration
├── terraform.tfvars           # Your configuration (gitignored)
└── README.md                  # This file
```

## Customization

### Adding More Secrets

Edit `terraform.tfvars`:

```hcl
external_api_secrets = [
  "CLAY_API_KEY",
  "APOLLO_API_KEY",
  "CLEARBIT_API_KEY",
  "CRUNCHBASE_API_KEY",
  "NEW_SECRET_NAME"
]
```

Then run `terraform apply`.

### Changing Regions

Edit `terraform.tfvars`:

```hcl
region             = "us-west1"
firestore_location = "us-west2"
```

**Note:** Moving Firestore requires deleting and recreating the database (data loss!).

### Multiple Environments

Create separate tfvars files:

```bash
# Development
terraform apply -var-file="terraform.dev.tfvars"

# Production
terraform apply -var-file="terraform.prod.tfvars"
```

## State Management

### Local State (Default)

Terraform state is stored locally in `terraform.tfstate`.

**⚠️ IMPORTANT:**
- Add `terraform.tfstate*` to `.gitignore`
- Never commit state files (may contain secrets)

### Remote State (Recommended for Teams)

Uncomment the backend block in `main.tf`:

```hcl
terraform {
  backend "gcs" {
    bucket = "pipelinepilot-terraform-state"
    prefix = "terraform/state"
  }
}
```

Create the state bucket:

```bash
gsutil mb gs://pipelinepilot-terraform-state
gsutil versioning set on gs://pipelinepilot-terraform-state
```

Re-initialize:

```bash
terraform init -migrate-state
```

## Troubleshooting

### "Bucket name already exists"

GCS bucket names are globally unique. Change `staging_bucket_name` in `terraform.tfvars`:

```hcl
staging_bucket_name = "pipelinepilot-agent-staging-YOUR_UNIQUE_SUFFIX"
```

### "API not enabled"

Wait 1-2 minutes after `terraform apply` for APIs to fully enable, then retry.

### "Permission denied"

Ensure you have Owner or Editor role:

```bash
gcloud projects get-iam-policy PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.members:user:YOUR_EMAIL"
```

### Destroy Infrastructure

To tear down all resources:

```bash
terraform destroy
```

**⚠️ WARNING:** This deletes:
- Service account
- GCS bucket (and all data)
- Firestore database (and all data)
- All secrets

## Next Steps

After infrastructure is deployed:

1. **Deploy Orchestrator** - `python3 src/deploy_with_wrapper.py`
2. **Deploy Functions** - `firebase deploy --only functions` (when Cloud Build fixed)
3. **Deploy Dashboard** - `firebase deploy --only hosting`
4. **Test End-to-End** - `python3 scripts/smoke_orchestrator.py`

## References

- **6767 SOP** - `../000-docs/6767-PP-SOP-Functions-ESM-Orchestrator-Query.md`
- **Project Structure** - `../README.md`
- **Terraform Docs** - https://www.terraform.io/docs
- **GCP Provider** - https://registry.terraform.io/providers/hashicorp/google/latest/docs

---

**Last Updated:** 2025-11-01
**Terraform Version:** >= 1.5.0
**GCP Provider Version:** ~> 5.0
