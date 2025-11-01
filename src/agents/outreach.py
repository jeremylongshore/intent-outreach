"""Outreach Agent - Personalized message generation for SDR outreach."""

import os
from typing import Any, Dict, List
import vertexai
from vertexai.generative_models import GenerativeModel
from vertexai.reasoning_engines._reasoning_engines import Queryable


class OutreachAgent(Queryable):
    """Queryable Outreach Agent for message generation."""

    def __init__(self, project_id: str = None, location: str = "us-central1"):
        """Initialize Outreach Agent.

        Args:
            project_id: GCP project ID (defaults to env var PROJECT_ID)
            location: GCP location (defaults to us-central1)
        """
        self.project_id = project_id or os.getenv("PROJECT_ID", "pipelinepilot-prod")
        self.location = location or os.getenv("LOCATION", "us-central1")

        # Initialize Vertex AI
        vertexai.init(project=self.project_id, location=self.location)

        # Create generative model (no tools needed)
        self.model = GenerativeModel(
            "gemini-2.0-flash-exp",
            system_instruction="""You are the Outreach Agent for PipelinePilot.

Input: enriched_leads[] from Enrich Agent.
Goal: Generate personalized outreach messages.

Output: messages[] with to_hint, subject, body.
- Subject: 3-120 chars
- Body: 40-1200 chars

Personalize using the strongest 1-2 signals only. Avoid unsupported claims. Keep clear CTA.

Examples:
- If company uses Salesforce + Outreach: "Noticed Acme runs Salesforce with Outreach. We automate list build and brief generation so reps start with context, not CSVs..."
- If company uses HubSpot + Gong: "Seeing HubSpot and Gong at Contoso. Our workflow pre-enriches accounts and drafts talk tracks..."

Output format (JSON):
{
  "messages": [
    {
      "to_hint": "string (max 120 chars, e.g. 'RevOps Director at Acme Inc')",
      "subject": "string (3-120 chars)",
      "body": "string (40-1200 chars)"
    }
  ]
}

Max 25 messages.
"""
        )

    def query(self, **kwargs) -> Dict[str, Any]:
        """Execute outreach message generation.

        Args:
            **kwargs: Query parameters including:
                - enriched_leads: List of enriched leads

        Returns:
            Dict with generated messages
        """
        enriched_leads = kwargs.get("enriched_leads", [])

        # Build prompt
        prompt = f"Generate personalized outreach messages for these {len(enriched_leads)} enriched leads:\n\n{enriched_leads}"

        # Generate response
        response = self.model.generate_content(prompt)

        # Return response text (should be JSON formatted by the model)
        return {"result": response.text}


def create_outreach_agent(project_id: str = None, location: str = "us-central1") -> OutreachAgent:
    """Factory function to create Outreach Agent instance."""
    return OutreachAgent(project_id=project_id, location=location)
