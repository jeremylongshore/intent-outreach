# PipelinePilot Quick Reference Card

**One-page cheatsheet for common operations**

---

## 🚀 Local Development

```bash
# Validate agents
npm run arv

# Run demo
npm run demo

# Install dependencies
npm install

# Check git status
git status
```

---

## 🌐 GitHub

**Repository:** https://github.com/jeremylongshore/pipelinepilot

```bash
# Push changes (triggers deployment)
git add -A
git commit -m "your message"
git push origin main

# Pull latest
git pull origin main

# View Actions
# https://github.com/jeremylongshore/pipelinepilot/actions
```

---

## ☁️ GCP Quick Commands

```bash
# Set project
export PROJECT_ID=pipelinepilot-prod
gcloud config set project $PROJECT_ID

# Check Firestore
gcloud firestore databases list

# Check staging bucket
gsutil ls gs://vertex-$PROJECT_ID-staging/

# List secrets
gcloud secrets list

# View deployed agents
gcloud ai models list --region=us-central1

# Check service account
gcloud iam service-accounts list | grep pipelinepilot
```

---

## 🔑 Secrets Management

```bash
# Add a secret
echo -n "your_api_key" | gcloud secrets versions add SECRET_NAME --data-file=-

# View secret metadata (not value)
gcloud secrets describe SECRET_NAME

# List secret versions
gcloud secrets versions list SECRET_NAME

# Access secret value (for testing)
gcloud secrets versions access latest --secret="SECRET_NAME"
```

**Available Secrets:**
- `CLAY_API_KEY`
- `APOLLO_API_KEY`
- `CLEARBIT_API_KEY`
- `CRUNCHBASE_API_KEY`
- `ZOOMINFO_API_KEY`
- `SALESNAV_TOKEN`
- `SALESNAV_COOKIE`

---

## 🤖 Agent Operations

```bash
# Deploy single agent
adk deploy agent_engine \
  --project=pipelinepilot-prod \
  --region=us-central1 \
  --staging_bucket=vertex-pipelinepilot-prod-staging \
  agents/agent_0_orchestrator.yaml

# List agents
gcloud ai endpoints list --region=us-central1

# Invoke agent (after deployment)
adk invoke agent_engine AGENT_NAME \
  --project=pipelinepilot-prod \
  --region=us-central1 \
  --input='{"task":"research","domain":"example.com"}'
```

---

## 📊 GitHub Actions Workflow

**Triggers:**
- Every push to `main` branch
- Manual trigger via Actions tab

**Jobs:**
1. **Validate** - Runs ARV + Demo
2. **Deploy** - Deploys 4 agents to Vertex AI

**Status:** https://github.com/jeremylongshore/pipelinepilot/actions

---

## 🔐 GitHub Secrets (Required)

| Secret | Example Value |
|--------|---------------|
| `WIF_PROVIDER` | `projects/123456/locations/global/workloadIdentityPools/github-pool/providers/github-provider` |
| `GCP_SA_EMAIL` | `pipelinepilot-core@pipelinepilot-prod.iam.gserviceaccount.com` |
| `GCP_PROJECT` | `pipelinepilot-prod` |
| `GCP_REGION` | `us-central1` |

**Add at:** https://github.com/jeremylongshore/pipelinepilot/settings/secrets/actions

---

## 📁 Project Structure

```
pipelinepilot/
├── agents/                  # ADK agent YAMLs
│   ├── agent_0_orchestrator.yaml
│   ├── agent_1_research.yaml
│   ├── agent_2_enrich.yaml
│   └── agent_3_outreach.yaml
├── connectors/              # FunctionTool wrappers
│   ├── clay.tool.ts
│   ├── apollo.tool.ts
│   └── ... (6 total)
├── newsfeed-demo/          # Demo system
├── scripts/                # Deployment scripts
├── .github/workflows/      # GitHub Actions
└── 000-docs/               # Documentation
```

---

## 🐛 Troubleshooting

### ARV validation fails
```bash
npm run arv
# Check error message
# Fix YAML syntax or schema issues
```

### Demo fails
```bash
npm run demo
# Check TypeScript errors
# Verify exports.ts and demo_runner.ts
```

### GitHub Actions fails
```bash
# Check workflow: https://github.com/jeremylongshore/pipelinepilot/actions
# Common issues:
# - Missing GitHub Secrets
# - WIF_PROVIDER incorrect
# - Service account permissions
```

### Deployment fails
```bash
# Check GCP project is set
gcloud config get-value project

# Check APIs are enabled
gcloud services list --enabled | grep aiplatform

# Check staging bucket exists
gsutil ls gs://vertex-pipelinepilot-prod-staging/
```

---

## 📈 Cost Monitoring

```bash
# View current billing
gcloud billing accounts list

# Check project billing
gcloud beta billing projects describe pipelinepilot-prod

# Set budget alerts (recommended)
# https://console.cloud.google.com/billing/budgets
```

**Estimated costs (Phase 1):** < $1/month

---

## 🔄 Common Workflows

### Make a change and deploy
```bash
# 1. Make changes
vim agents/agent_0_orchestrator.yaml

# 2. Test locally
npm run arv
npm run demo

# 3. Commit and push (triggers deployment)
git add -A
git commit -m "feat: update orchestrator"
git push origin main

# 4. Monitor deployment
# https://github.com/jeremylongshore/pipelinepilot/actions
```

### Add a new connector
```bash
# 1. Create tool file
touch connectors/hubspot.tool.ts

# 2. Update agent YAML to use it
vim agents/agent_2_enrich.yaml

# 3. Create secret in GCP
gcloud secrets create HUBSPOT_API_KEY --replication-policy=automatic
echo -n "your_key" | gcloud secrets versions add HUBSPOT_API_KEY --data-file=-

# 4. Test and deploy
npm run arv
git add -A && git commit -m "feat: add HubSpot connector" && git push
```

### Update API keys
```bash
# Update a secret
echo -n "new_api_key" | gcloud secrets versions add CLAY_API_KEY --data-file=-

# Verify
gcloud secrets versions list CLAY_API_KEY
```

---

## 📚 Documentation Links

- **README:** [README.md](README.md)
- **GCP Setup:** [GCP_SETUP.md](GCP_SETUP.md)
- **Phase 1 AAR:** [000-docs/034-AA-REPT-phase-1-after-action-report.md](000-docs/034-AA-REPT-phase-1-after-action-report.md)
- **Production AAR:** [000-docs/035-AA-REPT-production-ready-deployment.md](000-docs/035-AA-REPT-production-ready-deployment.md)

---

## 🆘 Support

### Check status
```bash
# ARV validation
npm run arv

# GitHub Actions
https://github.com/jeremylongshore/pipelinepilot/actions

# GCP deployment
gcloud ai models list --region=us-central1
```

### Get help
- Check documentation in `000-docs/`
- Review GCP logs: `gcloud logging read`
- Check GitHub Actions logs

---

## 🎯 Key Commands Summary

| Task | Command |
|------|---------|
| Validate | `npm run arv` |
| Demo | `npm run demo` |
| Deploy | `git push origin main` |
| Set project | `gcloud config set project pipelinepilot-prod` |
| Add secret | `echo -n "key" \| gcloud secrets versions add NAME --data-file=-` |
| List agents | `gcloud ai models list --region=us-central1` |

---

**Version:** 1.0.0
**Last Updated:** 2025-10-31
**Status:** Production Ready ✅
