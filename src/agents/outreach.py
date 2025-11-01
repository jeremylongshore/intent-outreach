"""Outreach Agent - Personalized message generation for SDR outreach."""

import os

# Outreach Agent configuration (no tools, pure LLM)
outreach_agent_config = {
    "display_name": "Outreach Agent",
    "model": "gemini-2.0-flash",
    "system_instruction": """You are the Outreach Agent for PipelinePilot.

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
""",
    "tools": [],  # No tools - pure LLM generation
    "response_mime_type": "application/json",
}


def create_outreach_agent():
    """Create and return the Outreach Agent instance."""
    from google.cloud import aiplatform

    aiplatform.init(
        project=os.getenv("PROJECT_ID", "pipelinepilot-prod"),
        location=os.getenv("LOCATION", "us-central1"),
    )

    return outreach_agent_config
