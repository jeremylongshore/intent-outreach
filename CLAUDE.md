# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

**PipelinePilot** - [Project purpose to be defined]

**Location:** `/home/jeremy/000-projects/iams/pipelinepilot/`
**Status:** Initial Setup
**Type:** Agent System Implementation (Tier 3)

---

## Context in IAMS Architecture

PipelinePilot is a **Tier 3** implementation within the IAMS (Intent Agent Manager & Engine System) hierarchy.

### Three-Tier Architecture

**Tier 1: iams/** (Master)
- General agent system patterns
- Cross-domain research and templates
- Location: `/home/jeremy/000-projects/iams/`

**Tier 2: [Domain Template]** (e.g., iamnews/, iamsdr/)
- Domain-specific reusable templates
- Generic configurations for that domain
- Location: `/home/jeremy/000-projects/iams/iam[domain]/`

**Tier 3: pipelinepilot/** ← YOU ARE HERE
- Specific implementation
- Product-specific configurations
- Location: `/home/jeremy/000-projects/iams/pipelinepilot/`

### Navigation Map

```
iams/ (Tier 1 - Master)
├── 000-docs/                    # General agent patterns
├── CLAUDE.md                    # Master guidance
│
├── [domain]/                    # Tier 2 - Template
│   ├── CLAUDE.md               # Template guidance
│   ├── README.md               # How to use template
│   ├── 000-docs/               # Generic domain docs
│   └── templates/              # Reusable configs
│
└── pipelinepilot/              # Tier 3 - Implementation (YOU ARE HERE)
    ├── CLAUDE.md               # This file
    ├── README.md               # Project overview
    ├── 000-docs/               # Product docs
    └── ... (implementation files)
```

---

## Documentation Structure

### Where Documentation Lives

**General Patterns** → `iams/000-docs/`
- Reasoning techniques
- Agent communication patterns
- Cross-domain research

**Domain-Specific Patterns** → `iam[domain]/000-docs/`
- Template architectures
- Domain-specific tools
- Reusable configurations

**PipelinePilot-Specific** → `pipelinepilot/000-docs/` ← YOU ARE HERE
- Product documentation
- Deployment guides
- Configuration details
- Implementation notes

### Quick Decision Guide

**"Where does this documentation go?"**

Ask:
1. "Does this apply to ALL agent systems?" → `iams/000-docs/`
2. "Does this apply to all [DOMAIN] systems?" → `iam[domain]/000-docs/`
3. "Does this apply to PipelinePilot only?" → `pipelinepilot/000-docs/`

---

## File Organization

### Directory Structure

```
pipelinepilot/
├── 000-docs/                    # Documentation (filing system v2.0)
│   ├── 001-PP-PROJ-project-overview.md
│   └── ... (other docs as needed)
│
├── CLAUDE.md                    # This file
├── README.md                    # Project README
│
├── src/                         # Source code
│   ├── agents/                 # Agent implementations
│   ├── tools/                  # Agent tools
│   ├── configs/                # Configuration files
│   └── utils/                  # Utility functions
│
├── terraform/                   # Infrastructure as Code
│   ├── main.tf
│   ├── variables.tf
│   └── terraform.tfvars
│
├── tests/                       # Test files
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── .github/                     # GitHub Actions
│   └── workflows/
│
└── docker/                      # Docker configurations
    ├── Dockerfile
    └── docker-compose.yml
```

---

## Documentation Standards

All documents follow **Document Filing System v2.0**:

**Format:** `NNN-CC-ABCD-description.ext`

**Components:**
- **NNN** = Sequential number (001-999)
- **CC** = Category code (2 letters)
- **ABCD** = Document type (4 letters)
- **description** = 1-4 words, kebab-case

### Category Codes
- **PP** = Product & Planning
- **AT** = Architecture & Technical
- **TQ** = Testing & Quality
- **OD** = Operations & Deployment
- **LS** = Logs & Status
- **RA** = Reports & Analysis
- **DR** = Documentation & Reference
- **MC** = Meetings & Communication
- **PM** = Project Management

### Examples
- `001-PP-PROJ-project-overview.md` (Project overview)
- `002-AT-ARCH-system-architecture.md` (System architecture)
- `003-TQ-TEST-test-strategy.md` (Test strategy)
- `004-OD-DEPL-deployment-guide.md` (Deployment guide)

---

## Technology Stack

### Infrastructure (Tentative)
- **Cloud:** Google Cloud Platform
- **IaC:** Terraform
- **Containers:** Docker
- **CI/CD:** GitHub Actions

### Agent Framework (Tentative)
- **Primary:** Google ADK (Agent Development Kit)
- **Hosting:** Vertex AI Agent Engine
- **Alternative:** Genkit

### AI Models (Tentative)
- **Primary:** Gemini 2.5 Flash
- **Complex:** Gemini 1.5 Pro

### Languages (Tentative)
- **Agents:** Python 3.12+
- **Backend:** TypeScript/JavaScript (Genkit)
- **IaC:** HCL (Terraform)
- **Configs:** YAML

---

## Development Workflow

### Common Commands

```bash
# Navigate to project
cd /home/jeremy/000-projects/iams/pipelinepilot/

# Development (to be defined)
# python -m src.main
# npm run dev

# Testing (to be defined)
# pytest
# npm test

# Deployment (to be defined)
# terraform apply
# gcloud run deploy
```

### Before Committing

1. Run tests (when defined)
2. Run linting (when defined)
3. Update documentation
4. Check for secrets/credentials

---

## Design Principles

### 1. Separation of Concerns
- Keep general patterns in Tier 1 (iams/)
- Use domain templates from Tier 2
- Only customize what's specific to PipelinePilot

### 2. Reusability
- Follow template patterns
- Extract reusable components
- Document for future implementations

### 3. Clear Documentation
- Document at appropriate tier
- Use filing system v2.0
- Keep README up to date

### 4. Security First
- Never commit secrets
- Use environment variables
- Follow GCP security best practices

---

## Getting Started

### For New Developers

1. **Read Master Guidance**
   ```bash
   cat /home/jeremy/000-projects/iams/CLAUDE.md
   ```

2. **Read Project Overview**
   ```bash
   cat 000-docs/001-PP-PROJ-project-overview.md
   ```

3. **Understand Tier Structure**
   - Tier 1 (iams/): General patterns
   - Tier 2 ([domain]/): Domain templates
   - Tier 3 (pipelinepilot/): This project

4. **Setup Environment** (to be defined)
   - Install dependencies
   - Configure GCP access
   - Setup local development

---

## Support & Resources

### Internal Documentation
- **Master Guidance:** `/home/jeremy/000-projects/iams/CLAUDE.md`
- **Project Overview:** `000-docs/001-PP-PROJ-project-overview.md`
- **README:** `README.md` (to be created)

### Related Projects
- **iamNews Template:** `/home/jeremy/000-projects/iams/iamnews/`
- **BrightStream:** `/home/jeremy/000-projects/iams/iamnews/brightstream/`

### External Resources
- Google ADK: https://github.com/google/adk-python
- Vertex AI: https://cloud.google.com/vertex-ai/docs
- Terraform: https://www.terraform.io/docs
- GCP Best Practices: https://cloud.google.com/docs/enterprise/best-practices-for-enterprise-organizations

---

## Current Status

**Phase:** Initial Setup

### Completed ✅
- Created 000-docs/ directory
- Created project overview document
- Created CLAUDE.md guidance file

### Next Steps 🔴
1. Define project scope and purpose
2. Create README.md
3. Determine Tier 2 template (or create new one)
4. Setup development environment
5. Implement initial agent system

---

## Questions to Resolve

1. **What does PipelinePilot do?**
   - Define specific purpose
   - Identify target use case

2. **Which domain template?**
   - Existing template (iamnews, iamsdr)?
   - New template needed?

3. **What agents are involved?**
   - Single or multi-agent?
   - What capabilities needed?

4. **Deployment target?**
   - Vertex AI Agent Engine?
   - Cloud Run?
   - Other?

---

**Last Updated:** 2025-10-31
**Status:** Initial project setup
**Next Action:** Define project scope and create README.md
