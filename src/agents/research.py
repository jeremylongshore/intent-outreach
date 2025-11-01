"""Research Agent - Company and contact discovery using Clay and Apollo."""

from google.cloud.aiplatform_v1beta1.types import Tool, FunctionDeclaration, Schema, Type
import os

# Tool declarations for Research Agent
clay_company_lookup_tool = Tool(
    function_declarations=[
        FunctionDeclaration(
            name="clay_company_lookup",
            description="Look up company information by domain using Clay API",
            parameters=Schema(
                type=Type.OBJECT,
                properties={
                    "domain": Schema(type=Type.STRING, description="Company domain (e.g., 'acme.io')"),
                },
                required=["domain"],
            ),
        )
    ]
)

apollo_person_search_tool = Tool(
    function_declarations=[
        FunctionDeclaration(
            name="apollo_person_search",
            description="Search for a person using Apollo API",
            parameters=Schema(
                type=Type.OBJECT,
                properties={
                    "full_name": Schema(type=Type.STRING, description="Person's full name"),
                    "company": Schema(type=Type.STRING, description="Company name"),
                },
                required=["full_name", "company"],
            ),
        )
    ]
)

# Research Agent configuration
research_agent_config = {
    "display_name": "Research Agent",
    "model": "gemini-2.0-pro-exp",
    "system_instruction": """You are the Research Agent for PipelinePilot.

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
""",
    "tools": [clay_company_lookup_tool, apollo_person_search_tool],
    "response_mime_type": "application/json",
}


def create_research_agent():
    """Create and return the Research Agent instance."""
    from google.cloud import aiplatform

    aiplatform.init(
        project=os.getenv("PROJECT_ID", "pipelinepilot-prod"),
        location=os.getenv("LOCATION", "us-central1"),
    )

    return research_agent_config
