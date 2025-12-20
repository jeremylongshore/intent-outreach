# CI Policy Overview

**Last Updated:** 2025-11-01
**Status:** Policy Defined
**Enforcement:** GitHub Actions

---

## Purpose

CI policies enforce BUILD CAPTAIN architectural requirements and prevent prohibited patterns from entering the codebase.

**Core Principle:** Python ADK only. No YAML agents. No stubs. No framework mixing.

---

## Policy Workflows

### 1. policy.yml - Pattern Blocking

**Purpose:** Block prohibited patterns at PR level
**Trigger:** On pull_request to main and protected branches
**Location:** `.github/workflows/policy.yml`

**Blocks:**

**Pattern: STUB Orchestrator**
```yaml
- name: Block STUB orchestrator
  run: |
    if grep -r "STUB" src/agents/orchestrator.py; then
      echo "❌ STUB orchestrator detected"
      echo "All tools must be real async functions with API integrations"
      exit 1
    fi
```

**Pattern: YAML-defined agents**
```yaml
- name: Block YAML agents
  run: |
    if find . -name "*.yaml" -o -name "*.yml" | grep -E "(agent|flow)"; then
      echo "❌ YAML agent definition detected"
      echo "Use Python ADK only: from google.adk.agents import Agent"
      exit 1
    fi
```

**Pattern: Agent-to-Agent calls**
```yaml
- name: Block agent-to-agent calls
  run: |
    if grep -r "agent\.call\|agent\.invoke\|orchestrate_agents" src/; then
      echo "❌ Agent-to-agent orchestration detected"
      echo "All orchestration must run inside one ADK Agent"
      exit 1
    fi
```

**Pattern: Built-in Search tool mixing**
```yaml
- name: Block Search tool mixing
  run: |
    if grep -r "google_search\|bing_search" src/agents/orchestrator.py; then
      echo "❌ Built-in Search tool detected"
      echo "Cannot mix function tools with built-in tools in Agent Engine"
      echo "Wrap Search via REST API if needed"
      exit 1
    fi
```

**How to Fix:**
- Remove STUB placeholder tools
- Implement real async functions with httpx
- Delete YAML agent definitions
- Consolidate orchestration into single ADK Agent
- Wrap Search via external REST call if needed

---

### 2. adk-guard.yml - Framework Enforcement

**Purpose:** Enforce Python ADK exclusively, block other frameworks
**Trigger:** On pull_request to main and protected branches
**Location:** `.github/workflows/adk-guard.yml`

**Blocks:**

**Framework: LangChain**
```yaml
- name: Block LangChain
  run: |
    if grep -r "from langchain\|import langchain" src/; then
      echo "❌ LangChain detected"
      echo "Use Python ADK only: from google.adk.agents import Agent"
      exit 1
    fi
```

**Framework: LlamaIndex**
```yaml
- name: Block LlamaIndex
  run: |
    if grep -r "from llama_index\|import llama_index" src/; then
      echo "❌ LlamaIndex detected"
      echo "Use Python ADK only: from google.adk.agents import Agent"
      exit 1
    fi
```

**Framework: Genkit**
```yaml
- name: Block Genkit
  run: |
    if grep -r "import.*genkit\|from.*genkit" src/; then
      echo "❌ Genkit detected"
      echo "Use Python ADK only: from google.adk.agents import Agent"
      exit 1
    fi
```

**Framework: OpenAI SDK**
```yaml
- name: Block OpenAI SDK
  run: |
    if grep -r "from openai\|import openai" src/; then
      echo "❌ OpenAI SDK detected"
      echo "Use Vertex AI Gemini via Python ADK"
      exit 1
    fi
```

**Allowed Imports:**
- `from google.adk.agents import Agent`
- `from google.genai import types`
- `from google.cloud import secretmanager`
- `from vertexai.preview import reasoning_engines`
- Standard Python libraries (httpx, asyncio, etc.)

**How to Fix:**
- Remove LangChain/LlamaIndex/Genkit imports
- Convert to Python ADK `Agent` class
- Use Vertex AI Gemini models via ADK
- Implement tools as async functions

---

### 3. arv-gate.yml - Agent Readiness Verification

**Purpose:** Validate agent implementation before merge
**Trigger:** On pull_request to main
**Location:** `.github/workflows/arv-gate.yml`

**Checks:**

**1. Schema Validation**
```yaml
- name: Validate agent schema
  run: |
    python scripts/validate_schema.py
```
- Verifies agent instruction format
- Checks tool signatures
- Validates JSON output schema

**2. Golden File Tests**
```yaml
- name: Run golden tests
  run: |
    pytest tests/golden/
```
- Tests known inputs → expected outputs
- Verifies tool execution
- Checks response format

**3. E2E Simulation**
```yaml
- name: E2E simulation
  run: |
    python tests/e2e/simulate_campaign.py
```
- Simulates full campaign workflow
- Tests all 4 tools (Clay, Apollo, Clearbit, Crunchbase)
- Validates end-to-end response

**4. ADK Import Check**
```yaml
- name: Verify ADK imports
  run: |
    python -c "from src.agents.orchestrator import orchestrator_agent"
    python -c "from src.agents.tools import clay_lookup, apollo_people, clearbit_enrich, crunchbase_company"
```
- Ensures clean imports
- No circular dependencies
- Valid Python syntax

**Pass Criteria:**
- All schema validations pass
- All golden tests pass
- E2E simulation completes successfully
- ADK imports load without errors

**How to Fix:**
- Update agent instruction to match schema
- Fix tool implementations to pass golden tests
- Add error handling for E2E failures
- Resolve import errors

---

## Policy Enforcement Summary

| Workflow | Purpose | Blocks | Required Fix |
|----------|---------|--------|--------------|
| **policy.yml** | Pattern blocking | STUBs, YAML, agent-to-agent, Search mixing | Implement real tools, delete YAML, consolidate orchestration |
| **adk-guard.yml** | Framework enforcement | LangChain, LlamaIndex, Genkit, OpenAI | Use Python ADK exclusively |
| **arv-gate.yml** | Readiness validation | Invalid schemas, failed tests, import errors | Fix schema, pass tests, clean imports |

---

## Bypassing Policies (Emergency Only)

**NEVER bypass policies without explicit approval.**

If emergency bypass is required:
1. Add `[skip-ci]` to commit message
2. Document reason in PR description
3. Create follow-up issue to fix properly
4. Notify team in Slack/Discord

**Example:**
```bash
git commit -m "hotfix: critical production issue [skip-ci]"
```

**Note:** `[skip-ci]` skips ALL workflows - use with extreme caution.

---

## Policy Rationale

### Why Python ADK Only?
- **Managed scaling** - Agent Engine handles auto-scaling
- **Built-in tracing** - Vertex AI tracing integrated
- **Native GCP integration** - Secret Manager, BigQuery, etc.
- **No framework lock-in** - Direct Google APIs
- **Simpler architecture** - One agent, one pattern

### Why Block YAML Agents?
- **Code over config** - Python is testable, YAML is not
- **Type safety** - Python has static type checking
- **Flexibility** - Code allows complex logic impossible in YAML
- **Maintainability** - Python is easier to refactor than YAML

### Why No Agent-to-Agent Orchestration?
- **Latency** - Network calls between agents add overhead
- **Complexity** - Debugging multi-agent flows is difficult
- **Cost** - Each agent call incurs API costs
- **Reliability** - Single agent is more reliable than distributed system

### Why No Search Tool Mixing?
- **Agent Engine limitation** - Cannot mix function tools with built-in tools
- **Workaround available** - Wrap Search via REST API
- **Documented** - See `9012-LIM-agent-engine-tooling.md`

---

## Local Testing

**Before pushing, run local checks:**

```bash
# Pattern check
./scripts/check_patterns.sh

# Framework check
./scripts/check_frameworks.sh

# Schema validation
python scripts/validate_schema.py

# Run tests
pytest tests/
```

**Install pre-commit hooks:**
```bash
pre-commit install
```

This runs all checks automatically before every commit.

---

## Resources

- **Policy definitions:** `.github/workflows/policy.yml`
- **Framework guard:** `.github/workflows/adk-guard.yml`
- **ARV gate:** `.github/workflows/arv-gate.yml`
- **Agent Engine limitations:** `9012-LIM-agent-engine-tooling.md`
- **ADK migration audit:** `9001-AUDT-adk-migration-audit.md`

---

**Last Updated:** 2025-11-01
**Status:** Policies defined, workflows pending creation
**Next Action:** Create `.github/workflows/` directory and implement all three workflows
