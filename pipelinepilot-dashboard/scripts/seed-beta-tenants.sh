#!/bin/bash
set -e

PROJECT_ID="pipelinepilot-prod"

# Function to create tenant in Firestore
create_tenant() {
  local tenant_id=$1
  local beta_tier=$2
  local email=$3

  echo "Creating tenant: $tenant_id (betaTier: $beta_tier)"

  # Create tenant document using gcloud firestore
  cat <<EOF > /tmp/tenant_${tenant_id}.json
{
  "tenant_id": "$tenant_id",
  "status": "active",
  "betaTier": "$beta_tier",
  "stripe_customer_id": "",
  "email": "$email",
  "owner_uid": "seed_script",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "updated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

  gcloud firestore import gs://pipelinepilot-prod-seed/tenants/$tenant_id.json --project=$PROJECT_ID || {
    echo "Creating tenant via API..."
    # Alternative: use Firebase Admin SDK via Node.js script
  }
}

# Function to create secrets
create_secrets() {
  local tenant_id=$1
  local placeholder=$2

  local providers=("CLAY" "APOLLO" "CLEARBIT" "CRUNCHBASE")

  for provider in "${providers[@]}"; do
    local secret_name="TENANT_${tenant_id}_${provider}_API_KEY"

    echo "Creating secret: $secret_name"

    # Create secret if it doesn't exist
    if gcloud secrets describe $secret_name --project=$PROJECT_ID &>/dev/null; then
      echo "  Secret $secret_name already exists, skipping..."
    else
      echo -n "$placeholder" | gcloud secrets create $secret_name \
        --data-file=- \
        --project=$PROJECT_ID \
        --replication-policy="automatic"

      echo "  ✓ Created $secret_name"
    fi
  done
}

# Create internal beta tenants
echo "=== Creating Internal Beta Tenants ==="
for i in 01 02 03; do
  tenant_id="beta_internal_${i}"
  create_secrets "$tenant_id" "PLACEHOLDER_REPLACE_WITH_REAL_KEY"
done

# Create customer beta tenant
echo ""
echo "=== Creating Customer Beta Tenant ==="
tenant_id="beta_customer_acme"
create_secrets "$tenant_id" "sample_api_key_customer_acme_replace_with_real"

echo ""
echo "✓ All secrets created!"
echo ""
echo "Note: Tenant documents should be created manually in Firestore Console or via Firebase Admin SDK"
echo "Go to: https://console.firebase.google.com/project/pipelinepilot-prod/firestore/data/tenants"
