#!/bin/bash
# Deploy all agents to Vertex AI Agent Engine

set -e

GCP_PROJECT="${GCP_PROJECT:-pipelinepilot-prod}"
GCP_REGION="${GCP_REGION:-us-central1}"
BUCKET_NAME="vertex-${GCP_PROJECT}-staging"

echo "🚀 Deploying agents to Vertex AI Agent Engine"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Project: $GCP_PROJECT"
echo "Region: $GCP_REGION"
echo "Staging: gs://$BUCKET_NAME"
echo ""

# Check if adk CLI is installed
if ! command -v adk &> /dev/null; then
  echo "❌ Error: adk CLI not found"
  echo "Install: pip install google-agent-sdk"
  exit 1
fi

# Deploy agents in order
AGENTS=(
  "agents/agent_0_orchestrator.yaml"
  "agents/agent_1_research.yaml"
  "agents/agent_2_enrich.yaml"
  "agents/agent_3_outreach.yaml"
)

for agent in "${AGENTS[@]}"; do
  echo "📦 Deploying: $agent"
  adk deploy agent_engine \
    --project="$GCP_PROJECT" \
    --region="$GCP_REGION" \
    --staging_bucket="$BUCKET_NAME" \
    "$agent"
  echo "✅ Deployed: $agent"
  echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ All agents deployed successfully!"
echo ""
echo "View agents:"
echo "  gcloud ai agents list --region=$GCP_REGION"
echo ""
echo "Invoke orchestrator:"
echo "  adk invoke agent_engine pipelinepilot-orchestrator \\"
echo "    --project=$GCP_PROJECT \\"
echo "    --region=$GCP_REGION \\"
echo "    --input='{\"task\":\"research company\",\"domain\":\"example.com\"}'"
