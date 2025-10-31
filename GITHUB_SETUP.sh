#!/bin/bash
# GitHub Repository Setup Commands
# Run these to create private repo and push Phase 1

set -e

REPO_NAME="pipelinepilot"
GHUSER="${GHUSER:-jeremylongshore}"  # Update with your GitHub username

echo "🚀 Setting up GitHub repository for PipelinePilot Phase 1"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "User: $GHUSER"
echo "Repo: $REPO_NAME"
echo ""

# Create private repository
echo "Creating private repository..."
gh repo create "$GHUSER/$REPO_NAME" \
  --private \
  --source=. \
  --disable-issues \
  --disable-wiki \
  --description="ADK-based SDR orchestration with Vertex AI Agent Engine and BYO connector keys" \
  --remote=origin

# Push to GitHub
echo ""
echo "Pushing Phase 1 to GitHub..."
git push -u origin main

echo ""
echo "✅ Repository created and pushed!"
echo ""
echo "View at: https://github.com/$GHUSER/$REPO_NAME"
echo ""
echo "Next steps:"
echo "  1. npm install"
echo "  2. npm run validate (ARV compliance check)"
echo "  3. npm run demo (NewsFeed demo)"
echo "  4. ./scripts/enable_firestore.sh (GCP setup)"
echo "  5. ./scripts/deploy_agents.sh (Vertex AI deployment)"
