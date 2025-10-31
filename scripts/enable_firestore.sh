#!/bin/bash
# Enable Firestore and required GCP services

set -e

GCP_PROJECT="${GCP_PROJECT:-pipelinepilot-prod}"
GCP_REGION="${GCP_REGION:-us-central1}"
FIRESTORE_LOCATION="${FIRESTORE_LOCATION:-us-central}"

echo "🔧 Enabling GCP services for project: $GCP_PROJECT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Enable required APIs
echo "Enabling APIs..."
gcloud services enable \
  firestore.googleapis.com \
  aiplatform.googleapis.com \
  secretmanager.googleapis.com \
  storage-api.googleapis.com \
  --project="$GCP_PROJECT"

# Create Firestore database
echo "Creating Firestore database in $FIRESTORE_LOCATION..."
gcloud firestore databases create \
  --location="$FIRESTORE_LOCATION" \
  --project="$GCP_PROJECT" \
  || echo "Firestore database already exists (OK)"

# Create Vertex AI staging bucket
BUCKET_NAME="vertex-${GCP_PROJECT}-staging"
echo "Creating Vertex AI staging bucket: gs://$BUCKET_NAME"
gsutil mb -l "$GCP_REGION" "gs://$BUCKET_NAME/" \
  || echo "Bucket already exists (OK)"

echo ""
echo "✅ Setup complete!"
echo ""
echo "Firestore location: $FIRESTORE_LOCATION"
echo "Staging bucket: gs://$BUCKET_NAME"
echo ""
echo "Next step: ./scripts/deploy_agents.sh"
