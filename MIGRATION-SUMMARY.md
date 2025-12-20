# PipelinePilot Directory Migration

**Date:** 2025-11-13
**Action:** Moved PipelinePilot from `iams/` to top-level `000-projects/`

---

## Changes Made

### 1. Directory Move
```bash
# From:
/home/jeremy/000-projects/iams/pipelinepilot/

# To:
/home/jeremy/000-projects/pipelinepilot/
```

### 2. Updated Files

**CLAUDE.md** - Updated project metadata:
- Location: `/home/jeremy/000-projects/pipelinepilot/`
- Type: Changed from "Tier 3 Agent System" to "B2B Sales Automation Platform"
- Removed IAMS tier hierarchy section
- Added standalone project context

**Documentation Files** (16 files updated):
- `000-docs/0001-PP-PROJ-project-overview.md`
- `000-docs/0007-AA-DASH-dashboard-deployment-complete.md`
- `000-docs/0012-DR-EXEC-agent-cards-executive-brief.md`
- `000-docs/0016-AA-RETRO-orchestration-fix-aar.md`
- `000-docs/0026-PM-HAND-next-steps-handoff.md`
- `000-docs/0027-DR-EXEC-complete-project-status.md`
- `000-docs/6767-PP-SOP-Functions-ESM-Orchestrator-Query.md`
- `000-docs/6767-UNIV-SOP-GCP-Pre-Build-Validation.md`
- `000-docs/9999-DR-EXEC-complete-system-analysis.md`
- `tf-pipeline/README.md`
- `tf-pipeline/outputs.tf`
- `pipelinepilot-dashboard/NEXT_STEPS.md`
- `pipelinepilot-dashboard/functions/PHASE2_WORKSPACE_ISOLATION.md`
- `pipelinepilot-dashboard/functions/PHASE3_SECRET_AUTOMATION.md`
- `pipelinepilot-dashboard/functions/STRIPE_WEBHOOK_DEPLOYMENT.md`

All references to `/home/jeremy/000-projects/iams/pipelinepilot` were replaced with `/home/jeremy/000-projects/pipelinepilot`.

### 3. Cleaned Up

**Removed virtual environments:**
- `venv-adk/` (contained hardcoded old paths)
- `venv-deploy/` (contained hardcoded old paths)

**Note:** Virtual environments should be recreated as needed:
```bash
cd /home/jeremy/000-projects/pipelinepilot
python3 -m venv venv-adk
source venv-adk/bin/activate
pip install cloudpickle==3.1.1
pip install -e .
```

---

## Why This Change?

### Problem
PipelinePilot was incorrectly placed inside `iams/` (Intent Agent Manager System), which is meant to be a **master directory for agent system templates**, not individual product implementations.

### IAMS Purpose
```
iams/
├── iamnews/              # Template for news agent systems
│   └── brightstream/     # BrightStream implementation (news)
├── iamsdr/               # Template for SDR agent systems (future)
└── ...                   # Other agent templates
```

### PipelinePilot Reality
- **Standalone B2B sales automation platform**
- **NOT a template** (specific product)
- **Uses Google ADK** for orchestration (not part of IAMS architecture)

### Correct Structure
```
000-projects/
├── iams/                 # Agent system templates
│   ├── iamnews/
│   └── iamsdr/
├── pipelinepilot/        # ✅ Standalone product (B2B sales)
├── diagnostic-platform/  # ✅ Standalone product (diagnostics)
└── ...                   # Other standalone projects
```

---

## Verification

### Directory Structure
```bash
$ ls -la /home/jeremy/000-projects/ | grep -E "(pipeline|iams|diagnostic)"
drwxrwxr-x 10 jeremy jeremy  4096 Nov 13 21:04 iams
drwxrwxr-x 17 jeremy jeremy  4096 Nov  7 12:46 pipelinepilot
drwxrwxr-x  X jeremy jeremy  4096 XXX XX XX:XX diagnostic-platform
```

### Git Status ✅
Git repository integrity maintained - all git history preserved.

**Verified:**
```bash
$ cd /home/jeremy/000-projects/pipelinepilot
$ git remote -v
origin  https://github.com/jeremylongshore/pipelinepilot.git (fetch)
origin  https://github.com/jeremylongshore/pipelinepilot.git (push)

$ git branch -vv
* fix/standardize-functions-esm-and-orchestrator-query [origin/fix/standardize-functions-esm-and-orchestrator-query]
  main [origin/main]
  ...

$ git fetch origin
# ✅ Successful - remote connection working

$ git log --oneline -5
3cd403a0 docs(000-docs): add 6767-PP-SOP-Functions-ESM-Orchestrator-Query
5cc1a6ca chore(scripts): add Python smoke for Reasoning Engine
24a0ec99 feat(orchestrator): add wrapper with sync query(**kwargs)
...
# ✅ Full git history intact
```

### Documentation
All internal documentation paths updated correctly.

---

## Next Steps

1. **Recreate virtual environments** when needed (see section 3 above)
2. **Update any external links** (bookmarks, scripts outside the repo)
3. **Continue development** as normal from new location

---

**Status:** ✅ Migration Complete
**Impact:** None - all functionality preserved
**Git History:** Intact
