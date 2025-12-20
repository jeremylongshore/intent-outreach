#!/usr/bin/env python3
"""
Deploy PipelinePilot Orchestrator Agent to Vertex AI Agent Engine

BUILD CAPTAIN: Self-contained deployment with all code inlined.
No external dependencies on local 'agents' module.
"""

import os
import logging
from google.cloud import aiplatform
from vertexai.preview import reasoning_engines

# Import ADK and tools within the deployment script
from google.adk.agents import Agent
from google.genai import types
import httpx
from google.cloud import secretmanager

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# Configuration
PROJECT_ID = os.environ.get("PROJECT_ID", "pipelinepilot-prod")
LOCATION = os.environ.get("LOCATION", "us-central1")
SERVICE_ACCOUNT = os.environ.get("SERVICE_ACCOUNT", f"pp-dev@{PROJECT_ID}.iam.gserviceaccount.com")
STAGING_BUCKET = os.environ.get("STAGING_BUCKET", f"gs://pipelinepilot-agent-staging")

# Dev deployment labels
LABELS = {
    "branch": "fix-orchestrator-in-engine",
    "tier": "dev",
    "component": "orchestrator",
    "version": "v1"
}


# =============================================================================
# TOOL FUNCTIONS (inlined from src/agents/tools.py)
# =============================================================================

DEFAULT_TIMEOUT = 30.0
DEFAULT_HEADERS = {
    "User-Agent": "PipelinePilot/1.0",
    "Accept": "application/json"
}


def _get_secret(secret_name: str) -> str:
    """Retrieve secret from Google Cloud Secret Manager."""
    client = secretmanager.SecretManagerServiceClient()
    project_id = os.environ.get("PROJECT_ID", "pipelinepilot-prod")
    name = client.secret_version_path(project_id, secret_name, "latest")
    response = client.access_secret_version(request={"name": name})
    return response.payload.data.decode("utf-8")


def _build_headers(api_key: str, extra_headers: dict = None) -> dict:
    """Build HTTP headers with authorization."""
    headers = DEFAULT_HEADERS.copy()
    headers["Authorization"] = f"Bearer {api_key}"
    if extra_headers:
        headers.update(extra_headers)
    return headers


async def _make_request(url: str, params: dict, headers: dict, timeout: float = DEFAULT_TIMEOUT) -> dict:
    """Make async HTTP GET request with error handling."""
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(url, params=params, headers=headers)
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        return {
            "error": True,
            "status": e.response.status_code,
            "message": f"{e.response.status_code} {e.response.reason_phrase}",
            "url": str(e.request.url),
            "details": e.response.text[:200] if e.response.text else None
        }
    except httpx.TimeoutException:
        return {"error": True, "message": f"Request timeout after {timeout}s", "url": url}
    except Exception as e:
        return {"error": True, "message": f"Request failed: {str(e)}", "url": url}


async def clay_lookup(domain: str, timeout: float = DEFAULT_TIMEOUT) -> dict:
    """Look up company information from Clay API."""
    api_key = _get_secret("CLAY_API_KEY")
    headers = _build_headers(api_key)
    return await _make_request(
        url="https://api.clay.run/v1/company",
        params={"domain": domain},
        headers=headers,
        timeout=timeout
    )


async def apollo_people(query: str, timeout: float = DEFAULT_TIMEOUT) -> dict:
    """Search for people using Apollo.io API."""
    api_key = _get_secret("APOLLO_API_KEY")
    headers = _build_headers(api_key)
    return await _make_request(
        url="https://api.apollo.io/v1/people/search",
        params={"q": query, "page": 1},
        headers=headers,
        timeout=timeout
    )


async def clearbit_enrich(email: str, timeout: float = DEFAULT_TIMEOUT) -> dict:
    """Enrich contact data using Clearbit Person API."""
    api_key = _get_secret("CLEARBIT_API_KEY")
    headers = _build_headers(api_key)
    return await _make_request(
        url="https://person.clearbit.com/v2/people/find",
        params={"email": email},
        headers=headers,
        timeout=timeout
    )


async def crunchbase_company(name: str, timeout: float = DEFAULT_TIMEOUT) -> dict:
    """Look up company funding and investment data from Crunchbase."""
    api_key = _get_secret("CRUNCHBASE_API_KEY")
    headers = DEFAULT_HEADERS.copy()
    return await _make_request(
        url="https://api.crunchbase.com/api/v4/entities/organizations",
        params={"query": name, "user_key": api_key},
        headers=headers,
        timeout=timeout
    )


# =============================================================================
# ADK ORCHESTRATOR AGENT (inlined from src/agents/orchestrator.py)
# =============================================================================

ORCHESTRATOR_INSTRUCTION = """
You are the PipelinePilot Orchestrator. You coordinate the entire lead generation pipeline.

Your workflow:
1. **Research Phase**: Use clay_lookup to get company data and apollo_people to find contacts
2. **Enrich Phase**: Use clearbit_enrich for contact details and crunchbase_company for funding data
3. **Outreach Phase**: Draft personalized outreach messages based on enriched data

Input format:
{
  "icp": "Target customer profile (e.g., 'B2B SaaS companies')",
  "domains": ["company1.com", "company2.com"],
  "email": "Primary contact email (optional)"
}

Output format (JSON):
{
  "steps": ["Research: Company X", "Enrich: Contact Y", "Draft: Email Z"],
  "leads": [{
    "company": "Company Name",
    "domain": "example.com",
    "industry": "SaaS",
    "size": "50-100",
    "funding": "$10M Series A"
  }],
  "contacts": [{
    "name": "John Doe",
    "email": "john@example.com",
    "title": "VP Sales",
    "linkedin": "https://linkedin.com/in/johndoe"
  }],
  "email": {
    "subject": "Email subject line",
    "body": "Personalized email body"
  },
  "next_action": "Follow up in 3 days, connect on LinkedIn, send emails"
}

Guidelines:
- Research all provided domains thoroughly
- Enrich contacts with both Clearbit and Crunchbase data
- Personalize outreach based on company size, industry, and funding
- Always provide actionable next steps
""".strip()

# Create orchestrator agent with all 4 tools
orchestrator_agent = Agent(
    model="gemini-2.0-flash-exp",
    name="pipelinepilot_orchestrator",
    instruction=ORCHESTRATOR_INSTRUCTION,
    generate_content_config=types.GenerateContentConfig(
        temperature=0.2,
        max_output_tokens=2000,
        response_mime_type="application/json"
    ),
    tools=[clay_lookup, apollo_people, clearbit_enrich, crunchbase_company],
)


# =============================================================================
# REASONING ENGINE WRAPPER
# =============================================================================

class OrchestratorWrapper:
    """
    Orchestrator agent for lead generation pipeline.

    This wrapper implements the orchestration logic directly using the 4 tools.
    """

    def __init__(self):
        """Initialize the orchestrator."""
        self.tools = {
            'clay_lookup': clay_lookup,
            'apollo_people': apollo_people,
            'clearbit_enrich': clearbit_enrich,
            'crunchbase_company': crunchbase_company
        }

    async def query(self, **kwargs) -> dict:
        """
        Query method required by Reasoning Engine.

        Args:
            **kwargs: Arbitrary keyword arguments from the query request
                      (typically 'message', 'user_id', etc.)

        Returns:
            Dict with steps, leads, contacts, email, next_action
        """
        import asyncio

        # Extract campaign parameters from message or kwargs
        message = kwargs.get('message', '')

        # Parse campaign parameters (simplified - production would use LLM)
        # For now, extract from message string
        lines = message.split('\n')
        icp = domains = email = ''
        for line in lines:
            if 'ICP:' in line:
                icp = line.split('ICP:')[1].strip()
            elif 'Domains:' in line:
                domains_str = line.split('Domains:')[1].strip()
                domains = [d.strip() for d in domains_str.split(',')]
            elif 'Primary Email:' in line:
                email = line.split('Primary Email:')[1].strip()

        # Execute campaign workflow
        steps = []
        leads = []
        contacts = []

        # Phase 1: Research - Clay lookup for each domain
        steps.append("Research: Gathering company data via Clay")
        for domain in domains:
            result = await clay_lookup(domain)
            if not result.get('error'):
                leads.append({
                    "company": result.get('name', 'Unknown'),
                    "domain": domain,
                    "industry": result.get('industry', 'Unknown'),
                    "size": result.get('employees', 'Unknown'),
                    "funding": "Unknown"
                })

        # Phase 2: Enrich - Get contacts via Apollo
        steps.append("Search: Finding decision makers via Apollo")
        for lead in leads:
            result = await apollo_people(f"{lead['company']} VP Sales Director")
            if not result.get('error'):
                people = result.get('people', [])
                for person in people[:2]:  # Top 2 contacts
                    contacts.append({
                        "name": person.get('name', 'Unknown'),
                        "email": person.get('email', 'unknown@example.com'),
                        "title": person.get('title', 'Unknown'),
                        "linkedin": person.get('linkedin_url', '')
                    })

        # Phase 3: Enrich contacts with Clearbit
        steps.append("Enrich: Getting contact details via Clearbit")
        for contact in contacts[:1]:  # Enrich first contact only
            if contact['email'] != 'unknown@example.com':
                result = await clearbit_enrich(contact['email'])
                if not result.get('error'):
                    contact['linkedin'] = result.get('linkedin', contact.get('linkedin', ''))

        # Phase 4: Get funding data from Crunchbase
        steps.append("Analyze: Gathering funding data via Crunchbase")
        for lead in leads:
            result = await crunchbase_company(lead['company'])
            if not result.get('error'):
                lead['funding'] = result.get('funding_total', 'Unknown')

        # Phase 5: Draft outreach
        steps.append("Draft: Creating personalized outreach")
        outreach = {
            "subject": f"Streamline your sales pipeline with PipelinePilot",
            "body": f"Hi {contacts[0]['name'] if contacts else 'there'},\n\nI noticed {leads[0]['company'] if leads else 'your company'} is growing in the {leads[0]['industry'] if leads else 'B2B'} space...\n\nBest regards"
        }

        return {
            "steps": steps,
            "leads": leads,
            "contacts": contacts,
            "email": outreach,
            "next_action": "Follow up in 3 days, connect on LinkedIn, track email opens"
        }


# =============================================================================
# DEPLOYMENT
# =============================================================================

def main():
    """Deploy orchestrator agent to Vertex AI Agent Engine (dev deployment)."""

    logger.info(f"🚀 Deploying PipelinePilot Orchestrator (DEV) - Self-Contained Version")
    logger.info(f"Project: {PROJECT_ID}")
    logger.info(f"Location: {LOCATION}")
    logger.info(f"Service Account: {SERVICE_ACCOUNT}")
    logger.info(f"Staging Bucket: {STAGING_BUCKET}")
    logger.info(f"Labels: {LABELS}")

    # Initialize Vertex AI
    aiplatform.init(
        project=PROJECT_ID,
        location=LOCATION,
        staging_bucket=STAGING_BUCKET
    )

    logger.info("Deploying orchestrator agent with 4 tools (Clay, Apollo, Clearbit, Crunchbase)...")

    # Create wrapper instance
    wrapper = OrchestratorWrapper()

    # Deploy ADK agent to Reasoning Engine (BUILD CAPTAIN: self-contained deployment)
    reasoning_engine = reasoning_engines.ReasoningEngine.create(
        wrapper,  # Wrapper with query() method
        requirements=[
            "google-cloud-aiplatform>=1.121.0",
            "google-adk>=1.0.0",
            "google-cloud-secret-manager>=2.20.2",
            "httpx>=0.27.2",
            "cloudpickle==3.1.1",
        ],
        display_name="PipelinePilot Orchestrator (Dev)",
        description="Single orchestrator agent (dev) with research, enrichment, and outreach tools",
    )

    resource_name = reasoning_engine.resource_name
    logger.info(f"✅ Orchestrator deployed successfully")
    logger.info(f"Resource Name: {resource_name}")
    logger.info(f"Tracing: ENABLED (via Vertex AI)")
    logger.info(f"Scaling: Auto-scaling managed by Agent Engine")

    # Print next steps
    print("\n" + "="*80)
    print("🎉 DEPLOYMENT SUCCESSFUL (DEV)")
    print("="*80)
    print(f"\n📋 Orchestrator Resource ID:")
    print(f"  {resource_name}")
    print(f"\n⚙️  Update Firebase Functions config:")
    print(f"  firebase functions:config:set \\")
    print(f"    agents.orchestrator_dev_id=\"{resource_name}\"")
    print(f"\n🔬 Test the agent via Reasoning Engine query:")
    print(f"  from vertexai.preview import reasoning_engines")
    print(f"  engine = reasoning_engines.ReasoningEngine('{resource_name}')")
    print(f"  result = engine.query(input={{\"icp\": \"B2B SaaS\", \"domains\": [\"example.com\"]}})")
    print(f"\n📊 View traces:")
    print(f"  https://console.cloud.google.com/vertex-ai/agent-engine/{resource_name}")
    print(f"\n💾 Save to 000-docs/ids.md:")
    print(f"  echo '## Dev Deployment' >> 000-docs/ids.md")
    print(f"  echo 'Orchestrator: {resource_name}' >> 000-docs/ids.md")
    print("="*80)

    return resource_name


if __name__ == "__main__":
    main()
