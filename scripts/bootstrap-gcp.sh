#!/bin/bash
#
# GCP Bootstrap Script for PipelinePilot
# Enables APIs, creates service accounts, and grants IAM permissions
#

set -euo pipefail

# Configuration
PROJECT_ID="${PROJECT_ID:-pipelinepilot-prod}"
LOCATION="${LOCATION:-us-central1}"
SA_NAME="pipelinepilot-core"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "=========================================="
echo "PipelinePilot GCP Bootstrap"
echo "=========================================="
echo "Project: $PROJECT_ID"
echo "Location: $LOCATION"
echo "Service Account: $SA_EMAIL"
echo "=========================================="
echo

# Set active project
echo "Setting active project..."
gcloud config set project "$PROJECT_ID"

# Enable required APIs
echo
echo "Enabling required APIs..."
gcloud services enable \
  aiplatform.googleapis.com \
  secretmanager.googleapis.com \
  cloudfunctions.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  firestore.googleapis.com \
  firebase.googleapis.com \
  artifactregistry.googleapis.com \
  --project="$PROJECT_ID"

echo "✅ APIs enabled"

# Create service account if it doesn't exist
echo
echo "Creating service account..."
if gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID" &>/dev/null; then
  echo "ℹ️  Service account already exists: $SA_EMAIL"
else
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name="PipelinePilot Core Service Account" \
    --description="Service account for PipelinePilot agents and functions" \
    --project="$PROJECT_ID"
  echo "✅ Service account created: $SA_EMAIL"
fi

# Grant IAM roles to service account
echo
echo "Granting IAM roles to service account..."

ROLES=(
  "roles/aiplatform.user"
  "roles/secretmanager.secretAccessor"
  "roles/logging.logWriter"
  "roles/cloudtrace.agent"
  "roles/datastore.user"
)

for role in "${ROLES[@]}"; do
  echo "  Granting $role..."
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="$role" \
    --condition=None \
    --quiet
done

echo "✅ IAM roles granted"

# Create Secret Manager secrets for API keys
echo
echo "Setting up Secret Manager secrets..."

SECRETS=(
  "CLAY_API_KEY"
  "APOLLO_API_KEY"
  "CLEARBIT_API_KEY"
  "CRUNCHBASE_API_KEY"
)

for secret in "${SECRETS[@]}"; do
  if gcloud secrets describe "$secret" --project="$PROJECT_ID" &>/dev/null; then
    echo "ℹ️  Secret already exists: $secret"
  else
    echo "  Creating secret: $secret"
    echo -n "REPLACE_ME" | gcloud secrets create "$secret" \
      --data-file=- \
      --replication-policy="automatic" \
      --project="$PROJECT_ID"

    # Grant service account access to secret
    gcloud secrets add-iam-policy-binding "$secret" \
      --member="serviceAccount:$SA_EMAIL" \
      --role="roles/secretmanager.secretAccessor" \
      --project="$PROJECT_ID" \
      --quiet

    echo "  ⚠️  IMPORTANT: Update $secret with real value using:"
    echo "      echo -n 'YOUR_API_KEY' | gcloud secrets versions add $secret --data-file=- --project=$PROJECT_ID"
  fi
done

echo "✅ Secrets configured"

# Create Cloud Build service account permissions for Firebase Functions
echo
echo "Configuring Cloud Build permissions..."

BUILD_SA="${PROJECT_ID//-/}@cloudbuild.gserviceaccount.com"

BUILD_ROLES=(
  "roles/cloudbuild.builds.builder"
  "roles/iam.serviceAccountUser"
  "roles/run.admin"
  "roles/storage.admin"
  "roles/artifactregistry.writer"
)

for role in "${BUILD_ROLES[@]}"; do
  echo "  Granting $role to Cloud Build SA..."
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$BUILD_SA" \
    --role="$role" \
    --condition=None \
    --quiet 2>/dev/null || echo "    (may already exist)"
done

echo "✅ Cloud Build permissions configured"

# Summary
echo
echo "=========================================="
echo "✅ Bootstrap Complete!"
echo "=========================================="
echo
echo "Next steps:"
echo "1. Update Secret Manager secrets with real API keys:"
echo "   - CLAY_API_KEY"
echo "   - APOLLO_API_KEY"
echo "   - CLEARBIT_API_KEY"
echo "   - CRUNCHBASE_API_KEY"
echo
echo "2. Deploy agents:"
echo "   python3 src/deploy.py"
echo
echo "3. Deploy Firebase dashboard and functions:"
echo "   cd pipelinepilot-dashboard && firebase deploy"
echo
echo "=========================================="
