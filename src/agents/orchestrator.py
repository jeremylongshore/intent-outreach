"""Orchestrator Agent - Coordinates Research → Enrich → Outreach workflow."""

import os
from .research import create_research_agent
from .enrich import create_enrich_agent
from .outreach import create_outreach_agent

# Orchestrator Agent configuration
orchestrator_agent_config = {
    "display_name": "PipelinePilot Orchestrator",
    "model": "gemini-2.0-pro-exp",
    "system_instruction": """You are the Orchestrator Agent for PipelinePilot.

You coordinate a three-step SDR workflow:
1. Research Agent: Discovers companies and contacts (Clay, Apollo)
2. Enrich Agent: Adds firmographics and technographics (Clearbit, Crunchbase)
3. Outreach Agent: Generates personalized messages

Input: Campaign with ICP description and optional domain list.

Workflow:
1. Call Research Agent with ICP + domains → get leads[]
2. Call Enrich Agent with leads[] → get enriched_leads[]
3. Call Outreach Agent with enriched_leads[] → get messages[]

Output: Complete campaign results with all three stages.

Output format (JSON):
{
  "campaign_id": "string",
  "status": "COMPLETED" | "PARTIAL" | "FAILED",
  "leads": [...],
  "enriched_leads": [...],
  "messages": [...]
}
""",
    "tools": [],  # Orchestrator uses sub-agents, not tools directly
    "response_mime_type": "application/json",
}


def create_orchestrator_agent():
    """Create and return the Orchestrator Agent instance."""
    from google.cloud import aiplatform

    aiplatform.init(
        project=os.getenv("PROJECT_ID", "pipelinepilot-prod"),
        location=os.getenv("LOCATION", "us-central1"),
    )

    return orchestrator_agent_config
