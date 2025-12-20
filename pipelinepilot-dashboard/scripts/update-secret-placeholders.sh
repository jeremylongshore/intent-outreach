#!/bin/bash
set -e

PROJECT_ID="pipelinepilot-prod"

# Tenants to update
tenants=(
  "beta_internal_01"
  "beta_internal_02"
  "beta_internal_03"
  "beta_customer_acme"
)

# Providers
providers=("CLAY" "APOLLO" "CLEARBIT" "CRUNCHBASE")

echo "Updating secret placeholder values to PENDING_CONFIG..."
echo "Project: $PROJECT_ID"
echo ""

for tenant in "${tenants[@]}"; do
  echo "Tenant: $tenant"
  for provider in "${providers[@]}"; do
    secret_name="TENANT_${tenant}_${provider}_API_KEY"

    # Add new version with correct placeholder
    echo -n "PENDING_CONFIG" | gcloud secrets versions add "$secret_name" \
      --data-file=- \
      --project="$PROJECT_ID" >/dev/null 2>&1

    echo "  ✓ $secret_name updated to PENDING_CONFIG"
  done
done

echo ""
echo "✅ All secret placeholders updated!"
echo ""
echo "Next: Re-run ARV validation to verify secrets are now detected correctly"
