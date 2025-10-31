#!/usr/bin/env bash
set -euo pipefail
: "${GCP_PROJECT:=pipelinepilot-prod}"
: "${GCP_REGION:=us-central1}"
adk deploy agent_engine \
  --project="${GCP_PROJECT}" \
  --region="${GCP_REGION}" \
  --staging_bucket="vertex-${GCP_PROJECT}-staging" \
  agents/agent_0_orchestrator.yaml
