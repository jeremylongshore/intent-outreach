#!/usr/bin/env python3
"""
Deploy PipelinePilot agents to Vertex AI Agent Engine.

All agents defined inline to avoid module import issues with cloudpickle.
"""

import logging
import os
from typing import Any, Dict
import vertexai
from google.cloud import aiplatform
from vertexai.preview import reasoning_engines
from vertexai.reasoning_engines._reasoning_engines import Queryable
from vertexai.generative_models import GenerativeModel, Tool, FunctionDeclaration

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
PROJECT_ID = os.environ.get("PROJECT_ID", "pipelinepilot-prod")
LOCATION = os.environ.get("LOCATION", "us-central1")
SERVICE_ACCOUNT = f"pipelinepilot-core@{PROJECT_ID}.iam.gserviceaccount.com"
STAGING_BUCKET = f"gs://{PROJECT_ID}-staging"

# Initialize Vertex AI
aiplatform.init(
    project=PROJECT_ID,
    location=LOCATION,
    staging_bucket=STAGING_BUCKET
)

logger.info("=" * 60)
logger.info("PipelinePilot ADK Deployment (Inline Pattern)")
logger.info(f"Project: {PROJECT_ID}")
logger.info(f"Location: {LOCATION}")
logger.info(f"Service Account: {SERVICE_ACCOUNT}")
logger.info("=" * 60)

# ==============================================================================
# AGENT DEFINITIONS (Inline - No Module Imports)
# ==============================================================================

class ResearchAgent(Queryable):
    """Research Agent - Company and contact discovery."""

    def __init__(self, project_id: str = None, location: str = "us-central1"):
        """Initialize Research Agent."""
        self.project_id = project_id or PROJECT_ID
        self.location = location

        # Note: vertexai.init() is called globally above, so we don't need it here
        # This prevents the initialization error in Agent Engine runtime

        # Define Clay tool
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

        # Define Apollo tool
        self.apollo_tool = Tool(
            function_declarations=[
                FunctionDeclaration(
                    name="apollo_person_search",
                    description="Search for a person using Apollo API",
                    parameters={
                        "type": "object",
                        "properties": {
                            "full_name": {"type": "string", "description": "Person's full name"},
                            "company": {"type": "string", "description": "Company name"}
                        },
                        "required": ["full_name", "company"]
                    }
                )
            ]
        )

        # Create model with tools
        self.model = GenerativeModel(
            "gemini-2.0-flash-exp",
            tools=[self.clay_tool, self.apollo_tool],
            system_instruction="""You are the Research Agent for PipelinePilot.
Input: ICP description and/or list of company domains.
Goal: Produce up to 25 candidate leads.
Tools: clay_company_lookup, apollo_person_search.
Output format (JSON): {"leads": [{"company": "...", "website": "...", "fit_score": 0-100, "notes": "..."}]}"""
        )

    def query(self, **kwargs) -> Dict[str, Any]:
        """Execute research query."""
        icp = kwargs.get("icp", "")
        domains = kwargs.get("domains", [])

        prompt_parts = ["Research leads for the following ICP:"]
        if icp:
            prompt_parts.append(f"\nICP: {icp}")
        if domains:
            prompt_parts.append(f"\nDomains: {', '.join(domains)}")

        prompt = "\n".join(prompt_parts)
        response = self.model.generate_content(prompt)

        return {"result": response.text}


class EnrichAgent(Queryable):
    """Enrich Agent - Firmographic enrichment."""

    def __init__(self, project_id: str = None, location: str = "us-central1"):
        """Initialize Enrich Agent."""
        self.project_id = project_id or PROJECT_ID
        self.location = location

        # Define Clearbit tool
        self.clearbit_tool = Tool(
            function_declarations=[
                FunctionDeclaration(
                    name="clearbit_company_enrichment",
                    description="Enrich company data using Clearbit API",
                    parameters={
                        "type": "object",
                        "properties": {
                            "domain": {"type": "string", "description": "Company domain"}
                        },
                        "required": ["domain"]
                    }
                )
            ]
        )

        # Define Crunchbase tool
        self.crunchbase_tool = Tool(
            function_declarations=[
                FunctionDeclaration(
                    name="crunchbase_funding_lookup",
                    description="Get funding information from Crunchbase",
                    parameters={
                        "type": "object",
                        "properties": {
                            "company_name": {"type": "string", "description": "Company name"}
                        },
                        "required": ["company_name"]
                    }
                )
            ]
        )

        self.model = GenerativeModel(
            "gemini-2.0-flash-exp",
            tools=[self.clearbit_tool, self.crunchbase_tool],
            system_instruction="""You are the Enrich Agent for PipelinePilot.
Input: List of leads.
Goal: Add firmographic and technographic data.
Tools: clearbit_company_enrichment, crunchbase_funding_lookup.
Output format (JSON): {"enriched_leads": [{"company": "...", "employees": "...", "funding": "...", ...}]}"""
        )

    def query(self, **kwargs) -> Dict[str, Any]:
        """Execute enrichment query."""
        leads = kwargs.get("leads", [])
        prompt = f"Enrich the following leads with firmographic data:\n{leads}"
        response = self.model.generate_content(prompt)
        return {"result": response.text}


class OutreachAgent(Queryable):
    """Outreach Agent - Personalized message generation."""

    def __init__(self, project_id: str = None, location: str = "us-central1"):
        """Initialize Outreach Agent."""
        self.project_id = project_id or PROJECT_ID
        self.location = location

        self.model = GenerativeModel(
            "gemini-2.0-flash-exp",
            system_instruction="""You are the Outreach Agent for PipelinePilot.
Input: Enriched leads.
Goal: Generate personalized outreach messages.
Output format (JSON): {"messages": [{"lead_id": "...", "subject": "...", "body": "...", ...}]}"""
        )

    def query(self, **kwargs) -> Dict[str, Any]:
        """Execute outreach query."""
        enriched_leads = kwargs.get("enriched_leads", [])
        prompt = f"Generate personalized outreach messages for:\n{enriched_leads}"
        response = self.model.generate_content(prompt)
        return {"result": response.text}


class OrchestratorAgent(Queryable):
    """Orchestrator Agent - Coordinates workflow."""

    def __init__(self, project_id: str = None, location: str = "us-central1"):
        """Initialize Orchestrator Agent."""
        self.project_id = project_id or PROJECT_ID
        self.location = location
        self.research_engine_id = os.getenv("RESEARCH_ENGINE_ID")
        self.enrich_engine_id = os.getenv("ENRICH_ENGINE_ID")
        self.outreach_engine_id = os.getenv("OUTREACH_ENGINE_ID")

    def query(self, **kwargs) -> Dict[str, Any]:
        """Execute orchestrated workflow."""
        campaign_id = kwargs.get("campaign_id", "unknown")
        return {
            "campaign_id": campaign_id,
            "status": "STUB",
            "message": "Orchestrator deployed. Firebase Functions will coordinate agent calls.",
            "workflow": {
                "step_1": "Research Agent (call via RESEARCH_ENGINE_ID endpoint)",
                "step_2": "Enrich Agent (call via ENRICH_ENGINE_ID endpoint)",
                "step_3": "Outreach Agent (call via OUTREACH_ENGINE_ID endpoint)"
            }
        }


# ==============================================================================
# DEPLOYMENT FUNCTIONS
# ==============================================================================

def deploy_research() -> str:
    """Deploy Research Agent."""
    logger.info("Deploying Research Agent")

    agent = ResearchAgent(project_id=PROJECT_ID, location=LOCATION)

    reasoning_engine = reasoning_engines.ReasoningEngine.create(
        agent,
        requirements=[
            "google-cloud-aiplatform>=1.121.0",
            "google-genai>=1.45.0",
            "cloudpickle==3.1.1",
        ],
        display_name="PipelinePilot Research Agent",
        description="Company and contact discovery using Clay and Apollo",
    )

    resource_name = reasoning_engine.resource_name
    logger.info(f"✅ Research Agent deployed: {resource_name}")
    return resource_name


def deploy_enrich() -> str:
    """Deploy Enrich Agent."""
    logger.info("Deploying Enrich Agent")

    agent = EnrichAgent(project_id=PROJECT_ID, location=LOCATION)

    reasoning_engine = reasoning_engines.ReasoningEngine.create(
        agent,
        requirements=[
            "google-cloud-aiplatform>=1.121.0",
            "google-genai>=1.45.0",
            "cloudpickle==3.1.1",
        ],
        display_name="PipelinePilot Enrich Agent",
        description="Firmographic enrichment using Clearbit and Crunchbase",
    )

    resource_name = reasoning_engine.resource_name
    logger.info(f"✅ Enrich Agent deployed: {resource_name}")
    return resource_name


def deploy_outreach() -> str:
    """Deploy Outreach Agent."""
    logger.info("Deploying Outreach Agent")

    agent = OutreachAgent(project_id=PROJECT_ID, location=LOCATION)

    reasoning_engine = reasoning_engines.ReasoningEngine.create(
        agent,
        requirements=[
            "google-cloud-aiplatform>=1.121.0",
            "google-genai>=1.45.0",
            "cloudpickle==3.1.1",
        ],
        display_name="PipelinePilot Outreach Agent",
        description="Personalized message generation",
    )

    resource_name = reasoning_engine.resource_name
    logger.info(f"✅ Outreach Agent deployed: {resource_name}")
    return resource_name


def deploy_orchestrator() -> str:
    """Deploy Orchestrator Agent."""
    logger.info("Deploying Orchestrator Agent")

    agent = OrchestratorAgent(project_id=PROJECT_ID, location=LOCATION)

    reasoning_engine = reasoning_engines.ReasoningEngine.create(
        agent,
        requirements=[
            "google-cloud-aiplatform>=1.121.0",
            "cloudpickle==3.1.1",
        ],
        display_name="PipelinePilot Orchestrator Agent",
        description="Workflow coordinator for Research → Enrich → Outreach",
    )

    resource_name = reasoning_engine.resource_name
    logger.info(f"✅ Orchestrator Agent deployed: {resource_name}")
    return resource_name


def deploy_all():
    """Deploy all agents."""
    results = {}

    try:
        # Deploy agents
        results["research"] = deploy_research()
        results["enrich"] = deploy_enrich()
        results["outreach"] = deploy_outreach()
        results["orchestrator"] = deploy_orchestrator()

        # Print summary
        logger.info("\n" + "=" * 60)
        logger.info("✅ ALL AGENTS DEPLOYED SUCCESSFULLY")
        logger.info("=" * 60)
        for name, resource_name in results.items():
            logger.info(f"{name.upper()}: {resource_name}")

        logger.info("\n📝 Next steps:")
        logger.info("1. Export engine IDs to environment:")
        for name in results:
            var_name = f"{name.upper()}_ENGINE_ID"
            logger.info(f"   export {var_name}=\"{results[name]}\"")

        logger.info("\n2. Update Firebase Functions with these IDs")
        logger.info("3. Run smoke test: scripts/smoke-test.sh")

    except Exception as e:
        logger.error(f"❌ Deployment failed: {e}")
        raise


if __name__ == "__main__":
    deploy_all()
