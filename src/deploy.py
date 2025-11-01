"""Deploy PipelinePilot agents to Vertex AI Agent Engine."""

import os
import logging
from google.cloud import aiplatform
from vertexai.preview import reasoning_engines

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

PROJECT_ID = os.environ.get("PROJECT_ID", "pipelinepilot-prod")
LOCATION = os.environ.get("LOCATION", "us-central1")
STAGING_BUCKET = os.environ.get("STAGING_BUCKET", f"gs://{PROJECT_ID}-staging")
SERVICE_ACCOUNT = os.environ.get(
    "SERVICE_ACCOUNT",
    f"pipelinepilot-core@{PROJECT_ID}.iam.gserviceaccount.com",
)


def deploy_orchestrator():
    """Deploy the Orchestrator Agent to Vertex AI Agent Engine."""
    from agents.orchestrator import create_orchestrator_agent

    logger.info(f"Deploying Orchestrator to {PROJECT_ID} in {LOCATION}")

    aiplatform.init(project=PROJECT_ID, location=LOCATION, staging_bucket=STAGING_BUCKET)

    # Create agent instance
    agent = create_orchestrator_agent(PROJECT_ID, LOCATION)

    # Deploy to Reasoning Engine with new API
    reasoning_engine = reasoning_engines.ReasoningEngine.create(
        agent,
        requirements=[
            "google-cloud-aiplatform>=1.121.0",
            "google-genai>=1.45.0",
            "google-cloud-secret-manager>=2.20.0",
            "httpx>=0.27.0",
        ],
        display_name="PipelinePilot Orchestrator",
        description="ADK-based orchestrator for Research → Enrich → Outreach workflow",
    )

    logger.info(f"✅ Orchestrator deployed: {reasoning_engine.resource_name}")
    return reasoning_engine.resource_name


def deploy_research():
    """Deploy the Research Agent."""
    from agents.research import create_research_agent

    logger.info("Deploying Research Agent")

    aiplatform.init(project=PROJECT_ID, location=LOCATION, staging_bucket=STAGING_BUCKET)

    # Create agent instance
    agent = create_research_agent(PROJECT_ID, LOCATION)

    # Deploy to Reasoning Engine with new API
    reasoning_engine = reasoning_engines.ReasoningEngine.create(
        agent,
        requirements=[
            "google-cloud-aiplatform>=1.121.0",
            "google-genai>=1.45.0",
            "google-cloud-secret-manager>=2.20.0",
            "httpx>=0.27.0",
        ],
        display_name="PipelinePilot Research Agent",
        description="Company and contact discovery using Clay and Apollo",
    )

    logger.info(f"✅ Research Agent deployed: {reasoning_engine.resource_name}")
    return reasoning_engine.resource_name


def deploy_enrich():
    """Deploy the Enrich Agent."""
    from agents.enrich import create_enrich_agent

    logger.info("Deploying Enrich Agent")

    aiplatform.init(project=PROJECT_ID, location=LOCATION, staging_bucket=STAGING_BUCKET)

    # Create agent instance
    agent = create_enrich_agent(PROJECT_ID, LOCATION)

    # Deploy to Reasoning Engine with new API
    reasoning_engine = reasoning_engines.ReasoningEngine.create(
        agent,
        requirements=[
            "google-cloud-aiplatform>=1.121.0",
            "google-genai>=1.45.0",
            "google-cloud-secret-manager>=2.20.0",
            "httpx>=0.27.0",
        ],
        display_name="PipelinePilot Enrich Agent",
        description="Firmographic and technographic enrichment",
    )

    logger.info(f"✅ Enrich Agent deployed: {reasoning_engine.resource_name}")
    return reasoning_engine.resource_name


def deploy_outreach():
    """Deploy the Outreach Agent."""
    from agents.outreach import create_outreach_agent

    logger.info("Deploying Outreach Agent")

    aiplatform.init(project=PROJECT_ID, location=LOCATION, staging_bucket=STAGING_BUCKET)

    # Create agent instance
    agent = create_outreach_agent(PROJECT_ID, LOCATION)

    # Deploy to Reasoning Engine with new API
    reasoning_engine = reasoning_engines.ReasoningEngine.create(
        agent,
        requirements=[
            "google-cloud-aiplatform>=1.121.0",
            "google-genai>=1.45.0",
        ],
        display_name="PipelinePilot Outreach Agent",
        description="Personalized message generation for SDR outreach",
    )

    logger.info(f"✅ Outreach Agent deployed: {reasoning_engine.resource_name}")
    return reasoning_engine.resource_name


def deploy_all():
    """Deploy all agents to Vertex AI Agent Engine."""
    logger.info("=" * 60)
    logger.info("PipelinePilot ADK Deployment")
    logger.info(f"Project: {PROJECT_ID}")
    logger.info(f"Location: {LOCATION}")
    logger.info(f"Service Account: {SERVICE_ACCOUNT}")
    logger.info("=" * 60)

    results = {}

    try:
        results["research"] = deploy_research()
        results["enrich"] = deploy_enrich()
        results["outreach"] = deploy_outreach()
        results["orchestrator"] = deploy_orchestrator()

        logger.info("\n" + "=" * 60)
        logger.info("✅ ALL AGENTS DEPLOYED SUCCESSFULLY")
        logger.info("=" * 60)
        for agent, resource_name in results.items():
            logger.info(f"{agent.upper()}: {resource_name}")
        logger.info("=" * 60)

        return results

    except Exception as e:
        logger.error(f"❌ Deployment failed: {e}")
        raise


if __name__ == "__main__":
    deploy_all()
