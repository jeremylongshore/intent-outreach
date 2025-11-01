# ADR-0001: Adopt Vertex AI Agent Engine with Python ADK

**Date:** 2025-10-31
**Status:** ✅ Accepted
**Deciders:** PipelinePilot Engineering Team
**Technical Story:** Migration from YAML-based agent configurations to Python ADK

---

## Context and Problem Statement

PipelinePilot initially used YAML-based agent configurations inspired by various agent frameworks (LangChain, LlamaIndex, custom builders). This approach created several challenges:

1. **Deployment Complexity:** YAML agents cannot be directly deployed to Vertex AI Agent Engine
2. **Tool Integration:** TypeScript tool references don't work with Python-based deployment
3. **Type Safety:** YAML lacks compile-time validation and type checking
4. **Maintenance:** YAML configs require custom parsing and validation logic
5. **Framework Lock-in:** YAML structure tied us to custom agent builder patterns

The question: **How do we deploy production-ready agents to Vertex AI Agent Engine while maintaining clean architecture and type safety?**

---

## Decision Drivers

- **Production Readiness:** Need managed deployment with auto-scaling, monitoring, and logging
- **Google Cloud Native:** Leverage Vertex AI Agent Engine for hosting and orchestration
- **Type Safety:** Catch errors at development time, not runtime
- **Maintainability:** Standard Python patterns, not custom YAML schemas
- **Tool Ecosystem:** Easy integration with provider APIs (Clay, Apollo, Clearbit, Crunchbase)
- **CI/CD Integration:** Automated testing and deployment pipelines
- **Cost Efficiency:** Minimize infrastructure management overhead

---

## Considered Options

### Option 1: Genkit (TypeScript/JavaScript)
**Description:** Firebase Genkit for building AI-powered applications

**Pros:**
- Full-stack framework (UI + backend)
- TypeScript type safety
- Good for Firebase integration (our dashboard uses Firebase)
- Local development tools
- Works well with Next.js dashboard

**Cons:**
- Primarily for application development, not pure agent systems
- Less focused on multi-agent orchestration
- Would require Node.js runtime for agents (inconsistent with Python ecosystem)
- Dashboard already uses Firebase Functions (separate concern)

**Decision:** ❌ Rejected (better for full-stack apps, not agent-only systems)

---

### Option 2: LangChain/LlamaIndex
**Description:** Popular open-source agent frameworks

**Pros:**
- Large community and ecosystem
- Many pre-built integrations
- Flexible and extensible

**Cons:**
- Not Google Cloud native (requires custom deployment)
- Self-managed infrastructure (Cloud Run, Kubernetes, etc.)
- No built-in Vertex AI Agent Engine support
- Complex abstraction layers
- Frequent breaking changes in library versions

**Decision:** ❌ Rejected (prefer managed platform over self-managed)

---

### Option 3: Custom YAML + Runtime Parser
**Description:** Keep YAML configs, build custom runtime

**Pros:**
- Maintains existing YAML files
- Flexible schema design
- No framework dependency

**Cons:**
- Custom code to maintain
- No deployment story for Vertex AI
- Requires building tool resolution layer
- TypeScript/Python bridge complexity
- No type safety

**Decision:** ❌ Rejected (too much custom infrastructure)

---

### Option 4: Vertex AI Agent Engine + Python ADK ✅
**Description:** Use Google ADK (Agent Development Kit) for Python-based agents deployed to Vertex AI Agent Engine

**Pros:**
- **Managed Platform:** Vertex AI handles deployment, scaling, monitoring
- **Python Type Safety:** Static type checking with mypy
- **Google Cloud Native:** First-class integration with Secret Manager, BigQuery, Firestore
- **Standard Patterns:** Uses Python classes and functions, not custom YAML
- **Production Ready:** Built-in logging, tracing, error handling
- **Cost Efficient:** Pay per invocation, auto-scaling
- **CI/CD Friendly:** Standard Python testing and deployment
- **Tool Integration:** Direct async/await support for HTTP clients (httpx)

**Cons:**
- Migration effort to convert YAML → Python
- Learning curve for ADK API
- Vertex AI specific (but that's our target platform)

**Decision:** ✅ **ACCEPTED**

---

## Decision Outcome

**Chosen option:** **Vertex AI Agent Engine + Python ADK**

### Why This Decision?

1. **Alignment with Requirements:**
   - Need: Production-ready managed platform → Vertex AI Agent Engine provides this
   - Need: Type safety → Python with type hints + mypy
   - Need: Google Cloud native → ADK designed for Vertex AI
   - Need: Tool integration → Python async/await with httpx

2. **Long-term Maintenance:**
   - Standard Python code is easier to maintain than custom YAML parsers
   - Type checking catches errors before deployment
   - Built-in Vertex AI observability (logs, traces, metrics)

3. **Migration Path:**
   - YAML agents → Python ADK agents (straightforward mapping)
   - Keep tool logic (just move from TypeScript to Python)
   - Reuse Secret Manager integration

---

## Implementation Strategy

### Phase 1: Freeze ✅
- [x] Create `migration/adk-python` branch
- [x] Protect main branch from YAML agent additions

### Phase 2: Rewrite ✅
- [x] Create `src/agents/` directory with Python agent modules:
  - `research.py` - Company and contact discovery (Clay, Apollo)
  - `enrich.py` - Firmographic/technographic enrichment (Clearbit, Crunchbase)
  - `outreach.py` - Personalized message generation (pure LLM)
  - `orchestrator.py` - Coordinates Research → Enrich → Outreach

- [x] Create `src/tools/` directory with provider integrations:
  - `secrets.py` - Secret Manager helper
  - `clay.py` - Clay API client
  - `apollo.py` - Apollo API client
  - `clearbit.py` - Clearbit API client
  - `crunchbase.py` - Crunchbase API client

- [x] Create `src/deploy.py` for Vertex AI deployment

- [x] Add `pyproject.toml` with dependencies:
  ```toml
  [project]
  dependencies = [
    "google-cloud-aiplatform[agent_engines,adk]>=1.112.0",
    "google-genai>=0.6.0",
    "google-cloud-secret-manager>=2.20.0",
    "google-cloud-logging>=3.10.0",
    "httpx>=0.27.0",
    "pydantic>=2.8.0",
  ]
  ```

- [x] Delete old YAML agent files:
  - `agents/agent_0_orchestrator.yaml` ❌
  - `agents/agent_1_research.yaml` ❌
  - `agents/agent_2_enrich.yaml` ❌
  - `agents/agent_3_outreach.yaml` ❌

### Phase 3: Enforce ✅
- [x] Add **ADK Guard** CI (`.github/workflows/adk-guard.yml`):
  - Fails if YAML agent files detected
  - Fails if banned imports (langchain, llama_index, genkit) found
  - Verifies ADK agent structure

- [x] Add **ARV Gate** CI (`.github/workflows/arv-gate.yml`):
  - ADK import validation
  - Agent structure verification
  - Tool implementation checks
  - Code style (black)
  - Linting (ruff)
  - Placeholders for: unit tests, contract tests, golden tests, E2E sim

---

## Migration Mapping

### YAML → Python ADK

| YAML Field | Python ADK Equivalent |
|------------|----------------------|
| `id` | Agent class name |
| `name` | `display_name` in config |
| `model` | `model` in config (e.g., `gemini-2.0-pro-exp`) |
| `description` | `description` parameter |
| `instructions` | `system_instruction` in config |
| `tools` | `Tool` with `FunctionDeclaration` |
| `output_schema` | JSON schema in `system_instruction` |
| `examples` | Included in `system_instruction` as few-shot examples |
| `routing` | Handled by orchestrator agent logic |
| `policies.max_output_tokens` | Vertex AI default (can override in config) |

### Example: Research Agent

**Before (YAML):**
```yaml
id: agent.research
name: Research
model: publishers/google/models/gemini-2.0-pro-exp
tools:
  - id: clay_company_lookup
    ref: connectors/clay.tool.ts#tool
```

**After (Python ADK):**
```python
research_agent_config = {
    "display_name": "Research Agent",
    "model": "gemini-2.0-pro-exp",
    "system_instruction": "...",
    "tools": [clay_company_lookup_tool],
    "response_mime_type": "application/json",
}
```

---

## Consequences

### Positive ✅

1. **Production Deployment:** Agents deployed to Vertex AI with 1 command (`python src/deploy.py`)
2. **Type Safety:** Python type hints catch errors during development
3. **CI/CD:** Standard Python testing and linting (pytest, black, ruff)
4. **Observability:** Built-in Vertex AI logging and tracing
5. **Cost Efficiency:** Pay-per-invocation, no idle infrastructure
6. **Maintainability:** Standard Python code, not custom YAML parsers
7. **Tool Integration:** Clean async/await patterns with httpx
8. **Security:** Secret Manager integration enforced

### Negative ⚠️

1. **Migration Effort:** 8-12 hours to convert YAML → Python (one-time cost)
2. **Learning Curve:** Team needs to learn ADK API (but simpler than alternatives)
3. **Platform Lock-in:** Vertex AI specific (but that's our target anyway)

### Neutral ℹ️

1. **Language Change:** TypeScript tools → Python tools (consistent with ADK)
2. **Deployment Process:** Now uses `python src/deploy.py` instead of custom scripts
3. **Testing Strategy:** Need to create unit/integration tests for Python agents

---

## Compliance and Security

### Secret Management
- **Requirement:** All API keys in Secret Manager (no plaintext in repo)
- **Implementation:** `src/tools/secrets.py` with `get_secret()` helper
- **Enforcement:** ADK Guard CI checks for `OPENAI_API_KEY` and similar patterns

### Service Accounts
- **Requirement:** Per-workspace service accounts for agent execution
- **Implementation:** `pipelinepilot-core@pipelinepilot-prod.iam.gserviceaccount.com`
- **Permissions:** Secret Manager accessor, Firestore writer, BigQuery user

### CI/CD Gates
- **ADK Guard:** Prevents YAML agents and banned libraries
- **ARV Gate:** Validates ADK structure, tests, and code quality

---

## Related Documentation

- **Technical Report:** `000-docs/004-DR-TECH-google-agent-frameworks-comparison.md`
- **Migration Audit:** `000-docs/reports/adk_migration_audit.md`
- **Migration AAR:** `000-docs/reports/adk_migration_AAR.md`
- **Google ADK Docs:** https://cloud.google.com/vertex-ai/docs/generative-ai/agent-builder/adk
- **Vertex AI Agent Engine:** https://cloud.google.com/vertex-ai/docs/generative-ai/reasoning-engine

---

## Revision History

| Date | Version | Changes |
|------|---------|---------|
| 2025-10-31 | 1.0 | Initial ADR: Adopt Vertex AI Agent Engine + Python ADK |

---

**Status:** ✅ Accepted and Implemented
**Next Steps:** Deploy to Vertex AI, create unit tests, implement E2E validation

---

**Last Updated:** 2025-10-31T23:30:00Z
**Author:** PipelinePilot Engineering Team
**Reviewers:** To be assigned in PR

🤖 Generated with [Claude Code](https://claude.com/claude-code)
