"""Orchestrator Agent - Coordinates Research → Enrich → Outreach workflow."""

import os
import json
from typing import Any, Dict, List
import vertexai
from vertexai.generative_models import GenerativeModel
from vertexai.reasoning_engines._reasoning_engines import Queryable


class OrchestratorAgent(Queryable):
    """Queryable Orchestrator Agent that coordinates sub-agents."""

    def __init__(self, project_id: str = None, location: str = "us-central1"):
        """Initialize Orchestrator Agent.

        Args:
            project_id: GCP project ID (defaults to env var PROJECT_ID)
            location: GCP location (defaults to us-central1)
        """
        self.project_id = project_id or os.getenv("PROJECT_ID", "pipelinepilot-prod")
        self.location = location or os.getenv("LOCATION", "us-central1")

        # Initialize Vertex AI
        vertexai.init(project=self.project_id, location=self.location)

        # Create generative model for orchestration logic
        self.model = GenerativeModel(
            "gemini-2.0-flash-exp",
            system_instruction="""You are the Orchestrator Agent for PipelinePilot.

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
"""
        )

        # Note: Sub-agents will be called via their deployed endpoints
        # This is the correct pattern for Agent Engine - each agent deploys independently
        self.research_engine_id = os.getenv("RESEARCH_ENGINE_ID")
        self.enrich_engine_id = os.getenv("ENRICH_ENGINE_ID")
        self.outreach_engine_id = os.getenv("OUTREACH_ENGINE_ID")

    def query(self, **kwargs) -> Dict[str, Any]:
        """Execute orchestrated workflow by calling deployed sub-agents.

        Args:
            **kwargs: Query parameters including:
                - campaign_id: Campaign identifier
                - icp: ICP description
                - domains: List of company domains

        Returns:
            Dict with complete campaign results
        """
        campaign_id = kwargs.get("campaign_id", "unknown")
        icp = kwargs.get("icp", "")
        domains = kwargs.get("domains", [])

        # For MVP: Return stub workflow structure
        # Firebase Functions will call individual agents via their endpoints
        # and aggregate results there (better separation of concerns)

        return {
            "campaign_id": campaign_id,
            "status": "STUB",
            "message": "Orchestrator deployed successfully. Firebase Functions will coordinate agent calls.",
            "workflow": {
                "step_1": "Research Agent (call via RESEARCH_ENGINE_ID endpoint)",
                "step_2": "Enrich Agent (call via ENRICH_ENGINE_ID endpoint)",
                "step_3": "Outreach Agent (call via OUTREACH_ENGINE_ID endpoint)"
            },
            "note": "Each agent deployed independently. Use Firebase Functions to orchestrate."
        }


def create_orchestrator_agent(project_id: str = None, location: str = "us-central1") -> OrchestratorAgent:
    """Factory function to create Orchestrator Agent instance."""
    return OrchestratorAgent(project_id=project_id, location=location)
