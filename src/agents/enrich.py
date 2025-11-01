"""Enrich Agent - Firmographic and technographic enrichment using Clearbit and Crunchbase."""

import os
from typing import Any, Dict, List
import vertexai
from vertexai.generative_models import GenerativeModel, Tool, FunctionDeclaration
from vertexai.reasoning_engines._reasoning_engines import Queryable


class EnrichAgent(Queryable):
    """Queryable Enrich Agent for lead enrichment."""

    def __init__(self, project_id: str = None, location: str = "us-central1"):
        """Initialize Enrich Agent.

        Args:
            project_id: GCP project ID (defaults to env var PROJECT_ID)
            location: GCP location (defaults to us-central1)
        """
        self.project_id = project_id or os.getenv("PROJECT_ID", "pipelinepilot-prod")
        self.location = location or os.getenv("LOCATION", "us-central1")

        # Initialize Vertex AI
        vertexai.init(project=self.project_id, location=self.location)

        # Define tools
        self.clearbit_tool = Tool(
            function_declarations=[
                FunctionDeclaration(
                    name="clearbit_enrich",
                    description="Enrich company data using Clearbit API",
                    parameters={
                        "type": "object",
                        "properties": {
                            "domain": {
                                "type": "string",
                                "description": "Company domain"
                            }
                        },
                        "required": ["domain"]
                    }
                )
            ]
        )

        self.crunchbase_tool = Tool(
            function_declarations=[
                FunctionDeclaration(
                    name="crunchbase_company",
                    description="Look up company information on Crunchbase",
                    parameters={
                        "type": "object",
                        "properties": {
                            "query": {
                                "type": "string",
                                "description": "Company name or domain"
                            }
                        },
                        "required": ["query"]
                    }
                )
            ]
        )

        # Create generative model with tools
        self.model = GenerativeModel(
            "gemini-2.0-flash-exp",
            tools=[self.clearbit_tool, self.crunchbase_tool],
            system_instruction="""You are the Enrich Agent for PipelinePilot.

Input: leads[] from Research Agent.
Goal: Enrich leads with firmographic and technographic data.

Use Clearbit for firmographics and Crunchbase for funding/size signals.

Behavior:
- If a provider is NOT_CONFIGURED, return partial results and note the missing key in internal reasoning, but do not invent values.
- Never exceed schema limits. Validate employees range (1-1000000) and tech_signals length.

Output format (JSON):
{
  "enriched_leads": [
    {
      "company": "string (max 120 chars)",
      "website": "string (valid URI)",
      "employees": "integer (1-1000000)",
      "tech_signals": ["string (max 60 chars each)"]
    }
  ]
}
"""
        )

    def query(self, **kwargs) -> Dict[str, Any]:
        """Execute enrichment query.

        Args:
            **kwargs: Query parameters including:
                - leads: List of leads to enrich

        Returns:
            Dict with enriched leads
        """
        leads = kwargs.get("leads", [])

        # Build prompt
        prompt = f"Enrich the following {len(leads)} leads:\n\n{leads}"

        # Generate response
        response = self.model.generate_content(prompt)

        # Return response text (should be JSON formatted by the model)
        return {"result": response.text}


def create_enrich_agent(project_id: str = None, location: str = "us-central1") -> EnrichAgent:
    """Factory function to create Enrich Agent instance."""
    return EnrichAgent(project_id=project_id, location=location)
