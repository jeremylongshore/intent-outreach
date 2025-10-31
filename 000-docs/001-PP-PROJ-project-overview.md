# PipelinePilot - Project Overview

**Created:** 2025-10-31
**Status:** Initial Setup
**Tier:** 3 (Implementation)

---

## Purpose

PipelinePilot - [Project purpose to be defined]

**Location:** `/home/jeremy/000-projects/iams/pipelinepilot/`
**Type:** Agent System Implementation (Tier 3)

---

## Context in IAMS Architecture

### Tier Structure
- **Tier 1:** `iams/` - Master directory (general agent patterns)
- **Tier 2:** `iam[domain]/` - Domain-specific templates
- **Tier 3:** **`pipelinepilot/`** ← YOU ARE HERE (specific implementation)

### Related Projects
- Parent: `iams/` - Intent Agent Manager & Engine System
- Sibling: `iamnews/brightstream/` - Positive news platform
- Sibling: `iamnews/` - News agent template

---

## Project Structure

```
pipelinepilot/
├── 000-docs/                    # Project documentation (you are here)
│   └── 001-PP-PROJ-project-overview.md
├── CLAUDE.md                    # Claude Code guidance (to be created)
├── README.md                    # Project README (to be created)
└── ... (project files to be added)
```

---

## Technology Stack

### Infrastructure (Tentative)
- **Cloud Platform:** Google Cloud Platform (GCP)
- **IaC:** Terraform
- **Containerization:** Docker
- **CI/CD:** GitHub Actions

### Agent Framework (Tentative)
- **Primary:** Google ADK (Agent Development Kit)
- **Hosting:** Vertex AI Agent Engine
- **Alternative:** Genkit (full-stack AI framework)

### AI Models (Tentative)
- **Primary LLM:** Gemini 2.5 Flash
- **Complex Reasoning:** Gemini 1.5 Pro

### Languages (Tentative)
- **Agent Code:** Python 3.12+
- **Backend:** TypeScript/JavaScript (if using Genkit)
- **IaC:** HCL (Terraform)
- **Configs:** YAML

---

## Documentation Standards

Follows **Document Filing System v2.0**:

**Format:** `NNN-CC-ABCD-description.ext`
- **NNN** = Sequential number (001-999)
- **CC** = Category code
- **ABCD** = Document type (4-letter abbreviation)
- **description** = 1-4 words, kebab-case

### Category Codes
- **PP** = Product & Planning (requirements, roadmaps)
- **AT** = Architecture & Technical (decisions, design)
- **TQ** = Testing & Quality (tests, bugs, security)
- **OD** = Operations & Deployment (deploy guides, infrastructure)
- **LS** = Logs & Status (work logs, progress)
- **RA** = Reports & Analysis (reports, metrics)
- **DR** = Documentation & Reference (guides, manuals)
- **MC** = Meetings & Communication (notes, memos)
- **PM** = Project Management (tasks, risks, sprints)

**Example:** `002-AT-ARCH-system-architecture.md`

---

## Next Steps

1. **Define Project Scope**
   - [ ] Determine PipelinePilot's specific purpose
   - [ ] Identify target domain (pipeline management? data pipelines? CI/CD?)
   - [ ] Define success criteria

2. **Create Core Documentation**
   - [ ] Create `CLAUDE.md` (Claude Code guidance)
   - [ ] Create `README.md` (project overview)
   - [ ] Create `002-AT-ARCH-system-architecture.md` (architecture doc)

3. **Identify Template Tier**
   - [ ] Determine if this belongs to existing template (iamnews, etc.)
   - [ ] Or if this requires new Tier 2 template (e.g., `iampipeline/`)

4. **Setup Development Environment**
   - [ ] Initialize git repository
   - [ ] Setup GCP project
   - [ ] Configure Terraform
   - [ ] Setup CI/CD pipeline

5. **Implement Agent System**
   - [ ] Define agent capabilities
   - [ ] Implement agent tools
   - [ ] Configure agent orchestration
   - [ ] Setup deployment pipeline

---

## Questions to Answer

1. **What does PipelinePilot do?**
   - Data pipeline management?
   - CI/CD pipeline automation?
   - Agent orchestration pipeline?
   - Other?

2. **What domain does it belong to?**
   - Should it have its own Tier 2 template (`iampipeline/`)?
   - Or does it fit under existing template (news, SDR, etc.)?

3. **What agents does it orchestrate?**
   - Single agent or multi-agent system?
   - What tools/capabilities do agents need?

4. **What's the deployment target?**
   - Vertex AI Agent Engine?
   - Cloud Run?
   - Other?

---

## Support & Resources

**Project Location:** `/home/jeremy/000-projects/iams/pipelinepilot/`

**IAMS Documentation:**
- Master guidance: `/home/jeremy/000-projects/iams/CLAUDE.md`
- News template: `/home/jeremy/000-projects/iams/iamnews/CLAUDE.md`
- BrightStream example: `/home/jeremy/000-projects/iams/iamnews/brightstream/CLAUDE.md`

**External Resources:**
- Google ADK: https://github.com/google/adk-python
- Vertex AI: https://cloud.google.com/vertex-ai/docs
- Terraform: https://www.terraform.io/docs

---

**Last Updated:** 2025-10-31
**Status:** Initial project setup
**Next Action:** Define project scope and purpose
