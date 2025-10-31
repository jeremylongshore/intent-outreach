# PipelinePilot Documentation Index

**Last Updated:** 2025-10-31
**Phase:** 1 - Foundation
**Status:** Complete ✅

---

## Core Documentation

### Phase 1 Documents

1. **[034-AA-REPT-phase-1-after-action-report.md](./034-AA-REPT-phase-1-after-action-report.md)**
   - Complete Phase 1 summary
   - Deliverables shipped
   - ARV validation results
   - Next-phase checklist

### Legacy Documents (From Previous Iteration)

2. **[001-PP-PROD-pipelinepilot-prd.md](./001-PP-PROD-pipelinepilot-prd.md)**
   - Original PRD (superseded by Phase 1 approach)

3. **[001-PP-PROJ-project-overview.md](./001-PP-PROJ-project-overview.md)**
   - Early project overview

4. **[002-AT-ARCH-system-architecture.md](./002-AT-ARCH-system-architecture.md)**
   - Original multi-tenant architecture (superseded)

5. **[006-OD-CICD-deployment-guide.md](./006-OD-CICD-deployment-guide.md)**
   - Cloud Run deployment guide (superseded)

6. **[007-PP-LEAS-leasing-model.md](./007-PP-LEAS-leasing-model.md)**
   - Leaseable SaaS pricing model (future)

---

## Quick Links

### Phase 1 (Current)
- **Start Here:** [README.md](../README.md)
- **After-Action Report:** [034-AA-REPT-phase-1-after-action-report.md](./034-AA-REPT-phase-1-after-action-report.md)
- **ARV Validation:** `npm run validate`
- **Deploy Agents:** `./scripts/deploy_agents.sh`

### Agent YAMLs
- [agent_0_orchestrator.yaml](../agents/agent_0_orchestrator.yaml)
- [agent_1_research.yaml](../agents/agent_1_research.yaml)
- [agent_2_enrich.yaml](../agents/agent_2_enrich.yaml)
- [agent_3_outreach.yaml](../agents/agent_3_outreach.yaml)

### Connectors
- [clay.tool.ts](../connectors/clay.tool.ts)
- [apollo.tool.ts](../connectors/apollo.tool.ts)
- [clearbit.tool.ts](../connectors/clearbit.tool.ts)
- [crunchbase.tool.ts](../connectors/crunchbase.tool.ts)
- [zoominfo.tool.ts](../connectors/zoominfo.tool.ts) (placeholder)
- [salesnav.tool.ts](../connectors/salesnav.tool.ts) (placeholder)

### NewsFeed Demo
- [news_story.schema.json](../newsfeed-demo/news_story.schema.json)
- [why_picked.ts](../newsfeed-demo/why_picked.ts)
- [exports.ts](../newsfeed-demo/exports.ts)
- [demo_runner.ts](../newsfeed-demo/demo_runner.ts)

---

## Document Naming Convention

Phase 1 uses **Document Filing System v2.0**:

**Format:** `NNN-CC-ABCD-description.md`
- **NNN** = Sequential number (001-999)
- **CC** = Category code (PP, AT, AA, etc.)
- **ABCD** = Document type (4-letter abbreviation)
- **description** = 1-4 words, kebab-case

### Category Codes
- **PP** = Product & Planning
- **AT** = Architecture & Technical
- **AA** = After Action & Review
- **OD** = Operations & Deployment
- **DR** = Documentation & Reference

---

## File Structure

```
pipelinepilot/
├── 000-docs/
│   ├── 000-INDEX.md (this file)
│   ├── 034-AA-REPT-phase-1-after-action-report.md
│   └── [legacy docs...]
│
├── agents/
│   ├── _schemas/AgentConfig.schema.json
│   ├── agent_0_orchestrator.yaml
│   ├── agent_1_research.yaml
│   ├── agent_2_enrich.yaml
│   └── agent_3_outreach.yaml
│
├── connectors/
│   ├── clay.tool.ts
│   ├── apollo.tool.ts
│   ├── clearbit.tool.ts
│   ├── crunchbase.tool.ts
│   ├── zoominfo.tool.ts
│   └── salesnav.tool.ts
│
├── newsfeed-demo/
│   ├── news_story.schema.json
│   ├── why_picked.ts
│   ├── exports.ts
│   └── demo_runner.ts
│
└── scripts/
    ├── enable_firestore.sh
    ├── deploy_agents.sh
    └── validate_arv.mjs
```

---

## Version History

### v1.0.0-phase1 (2025-10-31)
- ✅ 4 ADK-compliant agents
- ✅ 6 connector stubs
- ✅ NewsFeed demo
- ✅ ARV validation
- ✅ GCP deployment scripts
- ✅ Comprehensive documentation

---

**Next Update:** Phase 2 connector implementation
