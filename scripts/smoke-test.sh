#!/bin/bash
#
# Smoke Test Script for PipelinePilot Agent Engine Deployment
#
# Tests all 4 deployed agents to verify they're running and responsive.
#
# Usage:
#   export RESEARCH_ENGINE_ID="projects/.../reasoningEngines/xxx"
#   export ENRICH_ENGINE_ID="projects/.../reasoningEngines/yyy"
#   export OUTREACH_ENGINE_ID="projects/.../reasoningEngines/zzz"
#   export ORCHESTRATOR_ENGINE_ID="projects/.../reasoningEngines/www"
#   ./scripts/smoke-test.sh

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-pipelinepilot-prod}"
LOCATION="${LOCATION:-us-central1}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "============================================================"
echo "PipelinePilot Agent Engine Smoke Test"
echo "Project: $PROJECT_ID"
echo "Location: $LOCATION"
echo "============================================================"
echo ""

# Check required environment variables
REQUIRED_VARS=("RESEARCH_ENGINE_ID" "ENRICH_ENGINE_ID" "OUTREACH_ENGINE_ID" "ORCHESTRATOR_ENGINE_ID")
MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
    if [[ -z "${!var:-}" ]]; then
        MISSING_VARS+=("$var")
    fi
done

if [[ ${#MISSING_VARS[@]} -gt 0 ]]; then
    echo -e "${RED}❌ ERROR: Missing required environment variables:${NC}"
    for var in "${MISSING_VARS[@]}"; do
        echo "  - $var"
    done
    echo ""
    echo "Please set them like:"
    echo "  export RESEARCH_ENGINE_ID=\"projects/.../reasoningEngines/xxx\""
    exit 1
fi

# Test function
test_agent() {
    local name=$1
    local engine_id=$2
    local test_input=$3

    echo "Testing $name..."

    # Create Python test script
    python3 << EOF
import vertexai
from vertexai.preview import reasoning_engines
import json

vertexai.init(project="$PROJECT_ID", location="$LOCATION")

try:
    agent = reasoning_engines.ReasoningEngine("$engine_id")
    result = agent.query($test_input)
    print(f"✅ $name: SUCCESS")
    print(f"   Response: {json.dumps(result, indent=2)[:200]}...")
except Exception as e:
    print(f"❌ $name: FAILED")
    print(f"   Error: {str(e)}")
    exit(1)
EOF

    if [[ $? -eq 0 ]]; then
        echo -e "${GREEN}✅ $name passed${NC}"
    else
        echo -e "${RED}❌ $name failed${NC}"
        return 1
    fi
    echo ""
}

# Run tests
echo "Running agent smoke tests..."
echo ""

test_agent "Research Agent" "$RESEARCH_ENGINE_ID" '{"icp": "B2B SaaS", "domains": ["example.com"]}'
test_agent "Enrich Agent" "$ENRICH_ENGINE_ID" '{"leads": [{"company": "Example Inc", "website": "example.com"}]}'
test_agent "Outreach Agent" "$OUTREACH_ENGINE_ID" '{"enriched_leads": [{"company": "Example Inc", "contact": "John Doe"}]}'
test_agent "Orchestrator Agent" "$ORCHESTRATOR_ENGINE_ID" '{"campaign_id": "test-001", "icp": "B2B SaaS"}'

echo "============================================================"
echo -e "${GREEN}✅ All smoke tests passed!${NC}"
echo "============================================================"
echo ""
echo "Next steps:"
echo "1. Update Firebase Functions with these engine IDs"
echo "2. Deploy Firebase Functions: cd pipelinepilot-dashboard && firebase deploy --only functions"
echo "3. Test end-to-end workflow via dashboard"
echo ""
echo "Engine IDs:"
echo "  RESEARCH: $RESEARCH_ENGINE_ID"
echo "  ENRICH: $ENRICH_ENGINE_ID"
echo "  OUTREACH: $OUTREACH_ENGINE_ID"
echo "  ORCHESTRATOR: $ORCHESTRATOR_ENGINE_ID"
