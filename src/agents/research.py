"""Research Agent - Company and contact discovery using Clay and Apollo."""

import os
from typing import Any, Dict, List
import vertexai
from vertexai.generative_models import GenerativeModel, Tool, FunctionDeclaration, Part
from vertexai.reasoning_engines._reasoning_engines import Queryable


class ResearchAgent(Queryable):
    """Queryable Research Agent for lead discovery."""

    def __init__(self, project_id: str = None, location: str = "us-central1"):
        """Initialize Research Agent.

        Args:
            project_id: GCP project ID (defaults to env var PROJECT_ID)
            location: GCP location (defaults to us-central1)
        """
        self.project_id = project_id or os.getenv("PROJECT_ID", "pipelinepilot-prod")
        self.location = location or os.getenv("LOCATION", "us-central1")

        # Initialize Vertex AI
        vertexai.init(project=self.project_id, location=self.location)

        # Define tools
        self.clay_tool = Tool(
            function_declarations=[
                FunctionDeclaration(
                    name="clay_company_lookup",
                    description="Look up company information by domain using Clay API",
                    parameters={
                        "type": "object",
                        "properties": {
                            "domain": {
                                "type": "string",
                                "description": "Company domain (e.g., 'acme.io')"
                            }
                        },
                        "required": ["domain"]
                    }
                )
            ]
        )

        self.apollo_tool = Tool(
            function_declarations=[
                FunctionDeclaration(
                    name="apollo_person_search",
                    description="Search for a person using Apollo API",
                    parameters={
                        "type": "object",
                        "properties": {
                            "full_name": {
                                "type": "string",
                                "description": "Person's full name"
                            },
                            "company": {
                                "type": "string",
                                "description": "Company name"
                            }
                        },
                        "required": ["full_name", "company"]
                    }
                )
            ]
        )

        # Create generative model with tools
        self.model = GenerativeModel(
            "gemini-2.0-flash-exp",
            tools=[self.clay_tool, self.apollo_tool],
            system_instruction="""You are the Research Agent for PipelinePilot.

Input: ICP description and/or a list of company domains.
Goal: Produce up to 25 candidate leads with website, fit_score, and short notes.

Tools available: clay_company_lookup, apollo_person_search.

Rules:
- Use Clay for company canonicalization by domain.
- Use Apollo to find 1-2 likely SDR targets per company when requested.
- Do not invent unavailable data. Omit optional fields rather than guess.
- Keep notes <= 500 chars per lead.

Output format (JSON):
{
  "leads": [
    {
      "company": "string (2-120 chars)",
      "website": "string (valid URI)",
      "fit_score": "integer (0-100)",
      "notes": "string (0-500 chars)"
    }
  ]
}
"""
        )

    def query(self, **kwargs) -> Dict[str, Any]:
        """Execute research query.

        Args:
            **kwargs: Query parameters including:
                - icp: ICP description
                - domains: List of company domains

        Returns:
            Dict with discovered leads
        """
        icp = kwargs.get("icp", "")
        domains = kwargs.get("domains", [])

        # Build prompt
        prompt_parts = ["Research leads for the following ICP:"]
        if icp:
            prompt_parts.append(f"\nICP: {icp}")
        if domains:
            prompt_parts.append(f"\nDomains to research: {', '.join(domains)}")

        prompt = "\n".join(prompt_parts)

        # Generate response
        response = self.model.generate_content(prompt)

        # Return response text (should be JSON formatted by the model)
        return {"result": response.text}


def create_research_agent(project_id: str = None, location: str = "us-central1") -> ResearchAgent:
    """Factory function to create Research Agent instance."""
    return ResearchAgent(project_id=project_id, location=location)
