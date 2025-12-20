#!/bin/bash
set -e

PROJECT_ID="pipelinepilot-prod"
RE_SA="service-365258353703@gcp-sa-aiplatform-re.iam.gserviceaccount.com"

# Tenants to grant access for
tenants=(
  "beta_internal_01"
  "beta_internal_02"
  "beta_internal_03"
  "beta_customer_acme"
)

# Providers
providers=("CLAY" "APOLLO" "CLEARBIT" "CRUNCHBASE")

echo "Granting Reasoning Engine SA access to tenant secrets..."
echo "SA: $RE_SA"
echo ""

for tenant in "${tenants[@]}"; do
  echo "Tenant: $tenant"
  for provider in "${providers[@]}"; do
    secret_name="TENANT_${tenant}_${provider}_API_KEY"

    gcloud secrets add-iam-policy-binding "$secret_name" \
      --member="serviceAccount:$RE_SA" \
      --role="roles/secretmanager.secretAccessor" \
      --project="$PROJECT_ID" >/dev/null 2>&1

    echo "  ✓ $secret_name"
  done
done

echo ""
echo "✅ All IAM bindings updated!"
