#!/usr/bin/env bash
set -euo pipefail

# Configuration
PROJECT_ID="${PROJECT_ID:-pipelinepilot-prod}"
LOCATION="${LOCATION:-us-central1}"
FUNCTION_URL="https://us-central1-${PROJECT_ID}.cloudfunctions.net/startCampaign"
OUTPUT_FILE="000-docs/0019-TQ-SMK-dev-engine.txt"
ALLOW_MISSING_KEYS="${SMOKE_ALLOW_MISSING_KEYS:-0}"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "==================================================================="
echo "PipelinePilot Orchestrator - Smoke Test (Gen2 Functions)"
echo "==================================================================="
echo ""
echo "Function URL: ${FUNCTION_URL}"
echo "Project: ${PROJECT_ID}"
echo "Location: ${LOCATION}"
echo "Mock Mode: ${ALLOW_MISSING_KEYS}"
echo ""

# Test payload
PAYLOAD=$(cat <<'EOF'
{
  "campaignId": "smoke-001",
  "icp": "B2B SaaS companies with 50-200 employees",
  "domains": ["example.com", "test.com"],
  "email": "ceo@example.com"
}
EOF
)

echo "Test payload:"
echo "${PAYLOAD}" | jq .
echo ""

echo "Calling Functions endpoint..."
echo ""

# Call Functions
RESPONSE=$(curl -sX POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -d "${PAYLOAD}")

# Check for errors
if echo "${RESPONSE}" | jq -e '.error' > /dev/null 2>&1; then
  ERROR_MSG=$(echo "${RESPONSE}" | jq -r '.error')

  # If mock mode and error is about missing keys, pass anyway
  if [ "$ALLOW_MISSING_KEYS" = "1" ] && echo "$ERROR_MSG" | grep -qi "secret\|key\|ORCHESTRATOR"; then
    echo -e "${YELLOW}MOCK PASS: Function called but secrets not configured${NC}"
    echo "${RESPONSE}" | jq . | tee -a "${OUTPUT_FILE}"
    echo ""
    echo "Mock mode enabled - test passes despite missing secrets"
    exit 0
  fi

  echo -e "${RED}ERROR: Function call failed${NC}"
  echo "${RESPONSE}" | jq . | tee -a "${OUTPUT_FILE}"
  exit 1
fi

echo -e "${GREEN}✓ Function call successful${NC}"
echo ""

# Display response
echo "==================================================================="
echo "Response"
echo "==================================================================="
echo ""
echo "${RESPONSE}" | jq . | tee -a "${OUTPUT_FILE}"
echo ""

# Verify structure
echo "==================================================================="
echo "Verification"
echo "==================================================================="
echo ""

if echo "${RESPONSE}" | jq -e '.ok' > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Response OK${NC}"
else
  echo -e "${RED}✗ Response not OK${NC}"
  exit 1
fi

if echo "${RESPONSE}" | jq -e '.engine' > /dev/null 2>&1; then
  ENGINE=$(echo "${RESPONSE}" | jq -r '.engine')
  echo -e "${GREEN}✓ Engine ID present: ${ENGINE}${NC}"
else
  echo -e "${YELLOW}⚠ Engine ID not in response${NC}"
fi

echo ""
echo "Smoke test completed at $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
echo ""

exit 0
