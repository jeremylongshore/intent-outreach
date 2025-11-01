"""Enrich Agent - Firmographic and technographic enrichment using Clearbit and Crunchbase."""

from google.cloud.aiplatform_v1beta1.types import Tool, FunctionDeclaration, Schema, Type
import os

# Tool declarations for Enrich Agent
clearbit_enrich_tool = Tool(
    function_declarations=[
        FunctionDeclaration(
            name="clearbit_enrich",
            description="Enrich company data using Clearbit API",
            parameters=Schema(
                type=Type.OBJECT,
                properties={
                    "domain": Schema(type=Type.STRING, description="Company domain"),
                },
                required=["domain"],
            ),
        )
    ]
)

crunchbase_company_tool = Tool(
    function_declarations=[
        FunctionDeclaration(
            name="crunchbase_company",
            description="Look up company information on Crunchbase",
            parameters=Schema(
                type=Type.OBJECT,
                properties={
                    "query": Schema(type=Type.STRING, description="Company name or domain"),
                },
                required=["query"],
            ),
        )
    ]
)

# Enrich Agent configuration
enrich_agent_config = {
    "display_name": "Enrich Agent",
    "model": "gemini-2.0-flash",
    "system_instruction": """You are the Enrich Agent for PipelinePilot.

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
""",
    "tools": [clearbit_enrich_tool, crunchbase_company_tool],
    "response_mime_type": "application/json",
}


def create_enrich_agent():
    """Create and return the Enrich Agent instance."""
    from google.cloud import aiplatform

    aiplatform.init(
        project=os.getenv("PROJECT_ID", "pipelinepilot-prod"),
        location=os.getenv("LOCATION", "us-central1"),
    )

    return enrich_agent_config
