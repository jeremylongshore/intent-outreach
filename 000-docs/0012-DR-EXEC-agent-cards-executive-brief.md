# Executive Brief: Agent Cards in Google Cloud AI Ecosystem

**Document:** 012-DR-EXEC-agent-cards-executive-brief.md  
**Date:** 2025-10-31  
**Project:** PipelinePilot (SDR Automation)  
**Audience:** Engineering & Product Teams  
**Classification:** Technical Decision Brief  

---

## Executive Summary

**Agent Cards** are metadata documents that describe an AI agent's capabilities in multi-agent systems, specifically for the **Agent2Agent (A2A) Protocol**. They are **NOT** a response format for agent outputs but rather a **discovery mechanism** that enables agents to advertise their capabilities to other agents.

**TL;DR:** Agent Cards are like business cards for AI agents—they help agents find each other in multi-agent ecosystems. For PipelinePilot's SDR automation, we likely **don't need agent cards** unless we plan to integrate with external agent systems.

---

## What Are Agent Cards?

### Definition

From Google Cloud documentation:

> **"AgentCard is like a business card that other agents can use to discover what your agent can do."**

### Purpose

Agent Cards serve three primary functions:

1. **Agent Discovery**: Enable agents to find other agents with specific capabilities
2. **Capability Advertisement**: Describe what skills/tasks an agent can perform
3. **Interoperability**: Allow agents built with different frameworks to work together

### Technical Implementation

Agent Cards are **static JSON documents** typically hosted at:
```
https://your-agent-domain.com/.well-known/agent.json
```

---

## Agent Cards vs Agent Responses

### Critical Distinction

| Aspect | Agent Cards | Agent Responses |
|--------|-------------|-----------------|
| **Purpose** | Describe capabilities | Provide results |
| **When Used** | Agent discovery phase | During task execution |
| **Format** | Static JSON metadata | Dynamic JSON/text output |
| **Audience** | Other agents (A2A) | End users or calling systems |
| **Updates** | Rarely (when capabilities change) | Every request |
| **Protocol** | A2A Protocol | Standard API responses |

### Example: SDR Research Agent

**Agent Card (for discovery):**
```json
{
  "name": "SDR Research Agent",
  "description": "Finds and qualifies B2B leads",
  "skills": [
    {
      "id": "find_leads",
      "name": "Find Leads",
      "description": "Discovers potential B2B leads using Apollo.io",
      "examples": ["Find 50 SaaS companies in California"]
    }
  ],
  "endpoint": "https://pipelinepilot.com/api/research-agent"
}
```

**Agent Response (for results):**
```json
{
  "status": "success",
  "leads_found": 50,
  "results": [
    {
      "company": "TechCorp Inc",
      "industry": "SaaS",
      "employees": 250,
      "confidence": 0.92
    }
  ]
}
```

**Key Insight:** The agent card tells you "I can find leads." The response tells you "Here are the leads I found."

---

## Relationship to ADK (Agent Development Kit)

### How They Work Together

```
┌─────────────────────────────────────────────┐
│           Multi-Agent System                │
│                                             │
│  ┌──────────────┐         ┌──────────────┐ │
│  │  Agent A     │────────>│  Agent B     │ │
│  │  (ADK)       │  A2A    │  (ADK)       │ │
│  └──────────────┘         └──────────────┘ │
│         │                        │         │
│         │ Agent Card             │         │
│         │ (describes)            │         │
│         ▼                        ▼         │
│  ┌──────────────┐         ┌──────────────┐ │
│  │ "I do X,Y,Z" │         │ "I do A,B,C" │ │
│  └──────────────┘         └──────────────┘ │
└─────────────────────────────────────────────┘
```

### ADK Implementation

When building an A2A-compliant ADK agent:

1. **Create Agent Card** (describes capabilities):
```python
from vertexai.preview.reasoning_engines.templates.a2a import create_agent_card

agent_card = create_agent_card(
    agent_name='Research Agent',
    description='Finds B2B leads',
    skills=[research_skill]
)
```

2. **Create LlmAgent** (performs work):
```python
from google.adk import LlmAgent

research_agent = LlmAgent(
    system_instruction="You are an SDR research assistant...",
    tools=[apollo_search, linkedin_lookup]
)
```

3. **Wrap in A2aAgent** (makes it discoverable):
```python
from vertexai.preview.reasoning_engines import A2aAgent

a2a_agent = A2aAgent(
    agent_card=agent_card,
    agent_executor_builder=lambda: research_agent
)
```

**Result:** Your ADK agent can now be discovered and called by other A2A-compliant agents.

---

## Agent Card Structure

### Core Components

Based on the A2A Protocol specification:

```json
{
  "name": "string",              // Required: Agent name
  "description": "string",        // Required: What the agent does
  "endpoint": "url",              // Required: A2A endpoint URL
  "authentication": {             // Optional: Auth requirements
    "type": "bearer|oauth2|none",
    "required": true
  },
  "skills": [                     // Required: List of capabilities
    {
      "id": "unique_skill_id",
      "name": "Human-Readable Name",
      "description": "What this skill does",
      "tags": ["category1", "category2"],
      "examples": [
        "Example query 1",
        "Example query 2"
      ]
    }
  ],
  "version": "1.0.0",             // Optional: Card version
  "metadata": {                   // Optional: Additional info
    "framework": "ADK",
    "model": "gemini-2.5-flash"
  }
}
```

### Skill Definition

Each skill in the agent card includes:

- **id**: Unique identifier (e.g., `find_leads`, `enrich_company`)
- **name**: Human-readable label (e.g., "Find Leads")
- **description**: Functional description (e.g., "Discovers B2B leads using Apollo.io")
- **tags**: Categorical labels (e.g., `["Sales", "Research", "Lead Generation"]`)
- **examples**: Sample queries (e.g., `["Find 50 SaaS companies in CA"]`)

---

## When to Use Agent Cards

### ✅ Use Agent Cards When:

1. **Building Multi-Agent Systems** where agents need to discover each other dynamically
2. **Creating Agent Marketplaces** where users browse available agents
3. **Enabling Third-Party Integration** where external systems call your agents
4. **Planning Agent Orchestration** where one agent delegates to others
5. **Compliance with A2A Protocol** is required for your ecosystem

### ❌ Don't Use Agent Cards When:

1. **Single-Agent Systems** where only one agent exists
2. **Hardcoded Integrations** where you directly call APIs
3. **Simple Request-Response** patterns without agent discovery
4. **Internal-Only Services** with no inter-agent communication
5. **Performance-Critical Paths** where discovery overhead is unacceptable

---

## Pros and Cons for PipelinePilot

### Advantages ✅

| Benefit | PipelinePilot Impact |
|---------|---------------------|
| **Discoverability** | Other agents could find and use our SDR agents |
| **Standardization** | Follow industry-standard A2A protocol |
| **Future-Proofing** | Easy to integrate with external agent ecosystems |
| **Documentation** | Agent cards serve as API documentation |
| **Modularity** | Clear separation between agent discovery and execution |

### Disadvantages ❌

| Risk | PipelinePilot Impact |
|------|---------------------|
| **Complexity** | Adds extra layer vs direct API calls |
| **Overhead** | Discovery step before each interaction |
| **Limited Use Case** | Only valuable if other agents call us |
| **Immature Protocol** | A2A still evolving (as of Oct 2025) |
| **Vendor Lock-in** | Ties architecture to Google's A2A ecosystem |

---

## Critical Limitation: Structured Outputs

### The Problem

From Google ADK documentation:

> **"Using output_schema enables controlled generation within the LLM but disables the agent's ability to use tools or transfer control to other agents."**

### Implications

**If you use `output_schema` for structured JSON responses:**
- ✅ Get consistent, validated JSON output
- ❌ **Cannot use tools** (Apollo.io search, LinkedIn lookup, etc.)
- ❌ **Cannot transfer to other agents** (breaks multi-agent workflows)

**If you skip `output_schema` for tool use:**
- ✅ Agents can use tools freely
- ✅ Multi-agent workflows work
- ❌ Output format is less predictable

### Best Practice

From ADK documentation:

> **"When building multi-agent systems, have one agent do the complex thinking, pass raw results, and let a final agent apply the output_schema."**

**For PipelinePilot:**

```
Research Agent → Enrich Agent → Outreach Agent → Final Agent
(uses tools)     (uses tools)    (uses tools)     (applies output_schema)
```

Only the **final agent** in the chain should use `output_schema` to ensure consistent JSON output for the client.

---

## Executive Recommendation

### For PipelinePilot (SDR Automation)

**RECOMMENDATION: Do NOT implement agent cards initially**

### Rationale

1. **Single-Tenant Architecture**: Each customer gets their own isolated agent stack
2. **No Agent-to-Agent Discovery**: Our Research → Enrich → Outreach flow is hardcoded
3. **Direct API Integration**: We control all agents and can call them directly
4. **YAGNI Principle**: We don't currently need inter-agent discovery
5. **Faster Development**: Skip A2A complexity and ship core features faster

### Use Structured JSON Responses Instead

**Recommended Approach:**

```python
# Each agent returns structured JSON
research_agent = LlmAgent(
    system_instruction="Return leads as JSON array with company, industry, employees",
    tools=[apollo_search]
    # No output_schema - allows tool use
)

# Final aggregator agent applies schema
final_agent = LlmAgent(
    system_instruction="Format results for client",
    output_schema=SDRResultsSchema  # Only the last agent uses schema
)
```

### When to Reconsider

**Consider implementing agent cards if:**

1. **Agent Marketplace**: We build a marketplace where customers browse/select agents
2. **Third-Party Integrations**: External systems need to discover our agents
3. **Multi-Tenant Sharing**: Customers want to share agents with each other
4. **Enterprise Requirements**: Large customers demand A2A compliance
5. **Ecosystem Play**: We want to integrate with Google's agent ecosystem

---

## Implementation Guidance

### If You Don't Use Agent Cards (Recommended Now)

**Response Format:**
```python
# Direct JSON responses from each agent
{
    "agent": "research_agent",
    "status": "success",
    "results": [...],
    "metadata": {
        "timestamp": "2025-10-31T12:00:00Z",
        "cost": 0.05
    }
}
```

**Pros:**
- Simpler architecture
- Faster development
- Direct API control
- No A2A overhead

**Cons:**
- Not A2A-compliant
- Manual integration required
- Less discoverable

### If You Do Use Agent Cards (Future-Proofing)

**Hybrid Approach:**

1. **Primary Interface**: Direct JSON API (for speed)
2. **Secondary Interface**: A2A-compliant endpoint (for interoperability)
3. **Agent Card**: Published at `/.well-known/agent.json` (for discovery)

**Implementation:**
```python
# Expose both interfaces
app = FastAPI()

# Direct API (primary)
@app.post("/api/research")
async def research_direct(request: ResearchRequest):
    return {"results": [...]}

# A2A API (secondary)
@app.post("/a2a/task")
async def research_a2a(task: A2aTask):
    # A2A-compliant wrapper
    return a2a_response(task)

# Agent card
@app.get("/.well-known/agent.json")
async def agent_card():
    return {
        "name": "Research Agent",
        "skills": [...]
    }
```

**Pros:**
- Best of both worlds
- Future-proof architecture
- Flexibility for customers

**Cons:**
- Maintain two interfaces
- More complex deployment
- Higher maintenance burden

---

## Comparison: Agent Cards vs Alternatives

| Feature | Agent Cards (A2A) | Direct JSON API | OpenAPI Spec | LangChain Hub |
|---------|-------------------|-----------------|--------------|---------------|
| **Discovery** | ✅ Automatic | ❌ Manual | ⚠️ Manual | ✅ Automatic |
| **Standardization** | ✅ A2A Protocol | ❌ Custom | ✅ OpenAPI | ⚠️ LangChain |
| **Interoperability** | ✅ Cross-framework | ❌ Direct only | ⚠️ HTTP only | ⚠️ LangChain only |
| **Complexity** | 🔴 High | 🟢 Low | 🟡 Medium | 🟡 Medium |
| **Maturity** | 🟡 Emerging | 🟢 Mature | 🟢 Mature | 🟢 Mature |
| **Google Integration** | ✅ Native | ⚠️ Manual | ⚠️ Manual | ❌ None |
| **Tool Support** | ⚠️ Limited* | ✅ Full | ✅ Full | ✅ Full |

**Note:** Tool support limited when using `output_schema` with A2A agents.

---

## Decision Framework

### Questions to Ask

1. **Do we need multi-agent discovery?**
   - No → Skip agent cards
   - Yes → Consider agent cards

2. **Will external agents call us?**
   - No → Skip agent cards
   - Yes → Implement agent cards

3. **Do we control all agents?**
   - Yes → Direct APIs sufficient
   - No → Agent cards helpful

4. **Is A2A compliance required?**
   - No → Skip agent cards
   - Yes → Implement agent cards

5. **Can we add later if needed?**
   - Yes → Defer decision
   - No → Implement now

### For PipelinePilot SDR Automation

| Question | Answer | Implication |
|----------|--------|-------------|
| Need multi-agent discovery? | No | Direct orchestration works |
| External agents calling? | No | Single-tenant per customer |
| Control all agents? | Yes | We own the full stack |
| A2A compliance required? | No | No customer demand yet |
| Can add later? | Yes | Easily retrofit |

**Conclusion:** Start without agent cards, add later if needed.

---

## Technical Resources

### Documentation

- **A2A Protocol**: https://a2a-protocol.org/
- **A2A GitHub**: https://github.com/google-a2a/A2A
- **Vertex AI A2A Agents**: https://cloud.google.com/agent-builder/agent-engine/develop/a2a
- **ADK Documentation**: https://google.github.io/adk-docs/
- **ADK Structured Outputs**: https://google.github.io/adk-docs/agents/llm-agents/

### Code Examples

**Creating Agent Card:**
```python
from vertexai.preview.reasoning_engines.templates.a2a import create_agent_card
from a2a.types import AgentCard, AgentSkill

research_skill = AgentSkill(
    id='find_leads',
    name='Find B2B Leads',
    description='Discovers qualified B2B leads using Apollo.io',
    tags=['Sales', 'Lead Generation', 'Research'],
    examples=[
        'Find 50 SaaS companies in California with 100-500 employees',
        'Search for marketing directors at healthcare companies'
    ]
)

agent_card = create_agent_card(
    agent_name='SDR Research Agent',
    description='AI-powered B2B lead research and qualification',
    skills=[research_skill]
)
```

**Using A2A Agent:**
```python
from vertexai.preview.reasoning_engines import A2aAgent
from google.adk import LlmAgent

# Create the ADK agent (does the work)
research_agent = LlmAgent(
    system_instruction="You are an SDR research assistant...",
    tools=[apollo_search, linkedin_lookup]
)

# Wrap in A2A agent (makes it discoverable)
a2a_research_agent = A2aAgent(
    agent_card=agent_card,
    agent_executor_builder=lambda: research_agent
)

# Deploy to Vertex AI Agent Engine
a2a_research_agent.set_up()
```

---

## Glossary

| Term | Definition |
|------|------------|
| **A2A Protocol** | Agent2Agent Protocol - Open standard for inter-agent communication |
| **Agent Card** | JSON metadata document describing an agent's capabilities |
| **ADK** | Agent Development Kit - Google's framework for building AI agents |
| **Agent Skill** | Individual capability listed in an agent card |
| **A2aAgent** | ADK wrapper class that makes agents A2A-compliant |
| **output_schema** | ADK parameter for structured JSON responses (disables tools) |
| **Vertex AI Agent Engine** | Google Cloud's managed service for hosting agents |

---

## Summary & Next Steps

### Key Takeaways

1. **Agent Cards ≠ Response Format**: They're for discovery, not output
2. **A2A is for Multi-Agent**: Only valuable in agent-to-agent scenarios
3. **ADK Works Without Cards**: You can use ADK agents without A2A protocol
4. **output_schema Trade-off**: Structured output OR tools, not both
5. **Future-Proof Option**: Easy to add agent cards later if needed

### Recommended Action Plan

**Phase 1: MVP (Now)**
- ✅ Use ADK agents without agent cards
- ✅ Direct JSON API responses
- ✅ Hardcoded Research → Enrich → Outreach flow
- ✅ `output_schema` only on final agent

**Phase 2: Scale (Q1 2026)**
- ⚠️ Monitor customer requests for A2A
- ⚠️ Track industry adoption of A2A protocol
- ⚠️ Evaluate agent marketplace opportunity

**Phase 3: Ecosystem (Q2 2026)**
- 🔄 Implement agent cards if demand exists
- 🔄 Publish to A2A registry
- 🔄 Enable third-party integrations

### Decision Point

**This document recommends:**

🚦 **DO NOT implement agent cards for PipelinePilot MVP**

**Reasons:**
- No current need for agent discovery
- Simpler architecture ships faster
- Easy to add retroactively
- Focus on core SDR automation value

**Revisit when:**
- Customer requests third-party integration
- Building agent marketplace
- Enterprise requires A2A compliance
- Google's A2A ecosystem matures

---

## Appendix: SDR Automation Example

### Without Agent Cards (Recommended)

**Architecture:**
```python
# Direct orchestration
async def sdr_pipeline(company_criteria):
    # Research phase
    leads = await research_agent.run(company_criteria)
    
    # Enrich phase
    enriched = await enrich_agent.run(leads)
    
    # Outreach phase
    emails = await outreach_agent.run(enriched)
    
    # Format phase (applies output_schema)
    results = await format_agent.run(emails)
    
    return results  # Consistent JSON
```

**Benefits:**
- Simple, direct control flow
- No discovery overhead
- Clear debugging path
- Fast execution

### With Agent Cards (Future Option)

**Architecture:**
```python
# A2A orchestration
async def sdr_pipeline_a2a(company_criteria):
    # Discover agents dynamically
    research_agent = await discover_agent(capability="find_leads")
    enrich_agent = await discover_agent(capability="enrich_company")
    outreach_agent = await discover_agent(capability="generate_email")
    
    # Execute via A2A protocol
    leads = await research_agent.execute_task(company_criteria)
    enriched = await enrich_agent.execute_task(leads)
    emails = await outreach_agent.execute_task(enriched)
    
    return emails
```

**Benefits:**
- Flexible agent selection
- Third-party agents possible
- Ecosystem integration
- Dynamic capability matching

**Trade-offs:**
- More complex
- Discovery latency
- Protocol overhead
- Harder to debug

---

**Document Status:** Final  
**Recommendation:** Do NOT implement agent cards for MVP  
**Next Review:** Q1 2026 (monitor A2A adoption)  

---

**Timestamp:** 2025-10-31T22:30:00Z  
**Author:** Claude (Sonnet 4.5)  
**Project:** PipelinePilot / IAMS  
**Location:** `/home/jeremy/000-projects/pipelinepilot/000-docs/012-DR-EXEC-agent-cards-executive-brief.md`
