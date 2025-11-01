# Agent Engine Known Limitations

**Project:** PipelinePilot
**Date:** 2025-11-01
**Category:** Testing & Quality (TQ-KNOW)
**Status:** ⚠️ Known Issue

---

## Critical Limitation Discovered

### Multiple Tools Restriction

**Error Message:**
```
400 Multiple tools are supported only when they are all search tools.
```

**Impact:** Agents with 2+ function calling tools cannot execute queries

**Affected Agents:**
- ✅ Research Agent: Has Clay + Apollo tools (2 tools) - **BLOCKED**
- ✅ Enrich Agent: Has Clearbit + Crunchbase tools (2 tools) - **BLOCKED**
- ✅ Outreach Agent: No tools (LLM only) - **WORKS**
- ✅ Orchestrator Agent: No tools (stub logic) - **WORKS**

---

## Root Cause

Vertex AI Agent Engine has an undocumented constraint:
- ✅ Agents can have 0 tools (pure LLM)
- ✅ Agents can have 1 tool
- ✅ Agents can have multiple search tools
- ❌ Agents CANNOT have multiple non-search function calling tools

**Why This Matters:**
Our Research Agent needs both Clay (company lookup) and Apollo (person search) tools, but Agent Engine rejects this configuration at runtime.

---

## Deployment vs Runtime Status

| Agent | Deployment | Runtime | Notes |
|-------|------------|---------|-------|
| Research | ✅ Deployed | ❌ Cannot query | Multiple tools blocked |
| Enrich | ✅ Deployed | ❌ Cannot query | Multiple tools blocked |
| Outreach | ✅ Deployed | ✅ Can query | No tools - works |
| Orchestrator | ✅ Deployed | ✅ Can query | No tools - works |

**Key Finding:** Agents deploy successfully but fail at query time if they have multiple non-search tools.

---

## Workarounds

### Option 1: Split Agents (Recommended)
Split each agent into single-tool sub-agents:
- `Clay Agent` (clay_company_lookup only)
- `Apollo Agent` (apollo_person_search only)
- `Clearbit Agent` (clearbit_company_enrichment only)
- `Crunchbase Agent` (crunchbase_funding_lookup only)

Then orchestrate tool calls in Firebase Functions.

### Option 2: Remove Tools, Call APIs Directly
Make agents tool-less and call external APIs directly in query() method:
```python
def query(self, **kwargs):
    # Call Clay API directly (no tool)
    clay_response = httpx.get("https://api.clay.com/...", headers={"Authorization": f"Bearer {CLAY_API_KEY}"})

    # Call Apollo API directly (no tool)
    apollo_response = httpx.post("https://api.apollo.io/...", headers={"X-Api-Key": APOLLO_API_KEY})

    # Combine results
    return {"leads": combine(clay_response, apollo_response)}
```

### Option 3: Use Search Tools Only
Convert function calling tools to search tools (if supported by Agent Engine).

---

## Recommended Next Steps

1. **Short-Term:** Deploy Orchestrator + Outreach (tool-less agents)
2. **Mid-Term:** Refactor Research/Enrich to use Option 2 (direct API calls)
3. **Long-Term:** Evaluate if Agent Engine adds multi-tool support

---

## Testing Evidence

**Orchestrator Test (No Tools) - ✅ WORKS:**
```python
orchestrator = reasoning_engines.ReasoningEngine("...6509095642294386688")
result = orchestrator.query(campaign_id="test-001", icp="B2B SaaS")
# Returns: {'status': 'STUB', 'workflow': {...}}
```

**Research Test (2 Tools) - ❌ FAILS:**
```python
research = reasoning_engines.ReasoningEngine("...6346543843243982848")
result = research.query(icp="B2B SaaS", domains=["example.com"])
# Error: 400 Multiple tools are supported only when they are all search tools.
```

---

## Impact Assessment

**Deployment Success:** ✅ All 4 agents deployed to Agent Engine
**Runtime Success:** ⚠️ 50% (2/4 agents can execute queries)

**Business Impact:**
- Dashboard can deploy
- Orchestrator workflow can coordinate
- But Research/Enrich agents need refactoring before production use

---

## Documentation References

- **Agent Engine Docs:** https://cloud.google.com/vertex-ai/generative-ai/docs/agent-engine
- **Troubleshooting:** https://cloud.google.com/vertex-ai/generative-ai/docs/agent-engine/troubleshooting/use
- **Search Tools:** https://cloud.google.com/vertex-ai/generative-ai/docs/agent-engine/search-tools

---

**Discovered:** 2025-11-01 18:30 UTC
**Reported By:** Migration Captain (Claude Code)
**Status:** Known limitation - requires architecture change
**Priority:** High (blocks production use of Research/Enrich agents)
