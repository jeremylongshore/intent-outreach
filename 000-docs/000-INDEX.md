# 000-INDEX - PipelinePilot Documentation Master Index

**Last Updated:** 2025-11-01 19:30 UTC
**Purpose:** Single comprehensive reference for all PipelinePilot documentation

---

## ADK Migration Documents (Primary Reference)

### 001 - Migration Audit | `001-RA-AUDT-adk-migration-audit.md`
✅ Compliance verification: Zero YAML, LangChain, LlamaIndex, Genkit, OpenAI  
📊 7/7 audit checks passed

### 003 - Architecture Decision | `003-AT-ADEC-adopt-vertex-adk.md`  
🏗️ Why Python ADK over alternatives

### 004 - Secrets Management | `004-DR-SECU-secrets-management.md`  
🔐 Secret Manager guide (CLAY_API_KEY, APOLLO_API_KEY, etc.)

### 005 - Cloudpickle Lessons | `005-TQ-LESS-cloudpickle-lessons-learned.md`  
🐛 3 critical deployment failures + solutions (inline pattern, cloudpickle==3.1.1)

### 006 - Deployment Runbook | `006-OD-RUNB-deployment-runbook.md`  
📖 Step-by-step deployment procedures

### 007 - Migration AAR | `007-AA-RETRO-adk-migration-aar.md`  
📝 After Action Report (Timeline, metrics, lessons learned)

### 008 - Agent Engine Limitations | `008-TQ-KNOW-agent-engine-limitations.md`  
⚠️ Multi-tool restriction (Research/Enrich agents blocked)

### 015 - Decision Diagnosis | `015-AA-DIAG-autonomous-decision-diagnosis.md`  
🔍 All autonomous decisions with rationale and accountability

---

## Quick Start

**New Developers:**  
1. Read 001 (audit), 003 (architecture), 006 (runbook)

**Deploy Agents:**  
Follow 006 - Deployment Runbook

**Troubleshoot:**  
Check 005 (lessons), 007 (AAR), 015 (decisions)

---

## Critical Information

**Deployed Resource IDs (Original - Deprecated):**
- Research: `projects/.../6346543843243982848` (⚠️ STUB)
- Enrich: `projects/.../4967738669826834432` (⚠️ STUB)
- Outreach: `projects/.../6153311271732117504` (✅ Works)
- Orchestrator: `projects/.../6509095642294386688` (⚠️ STUB)

**New Architecture (fix/orchestrator-in-engine):**
- Single Orchestrator with all 4 tools (Clay, Apollo, Clearbit, Crunchbase)
- Dashboard calls ONE agent instead of 4

**Known Issues:**
1. 🔴 Multi-tool limitation (see 008-TQ-KNOW)
2. 🔴 Orchestrator stub (see 015-AA-DIAG)

---

**All docs in:** `000-docs/`  
**External:** https://cloud.google.com/vertex-ai/docs/agent-engine
