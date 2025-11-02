"""
Deploy PipelinePilot Orchestrator to Vertex AI Agent Engine

Uses the ADK-compliant OrchestratorWrapper with pinned cloudpickle==3.1.1.
This script creates a Reasoning Engine that exposes the query(**kwargs) method.
"""

import os
import logging
from google.cloud import aiplatform
from vertexai.preview import reasoning_engines

from src.orchestrator_wrapper import OrchestratorWrapper

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def deploy_orchestrator():
    """Deploy Orchestrator wrapper to Vertex AI Reasoning Engine."""

    # Get configuration from environment
    project_id = os.environ.get("PROJECT_ID", "pipelinepilot-prod")
    location = os.environ.get("LOCATION", "us-central1")
    service_account = os.environ.get("SERVICE_ACCOUNT", f"pp-dev@{project_id}.iam.gserviceaccount.com")
    staging_bucket = os.environ.get("STAGING_BUCKET", f"gs://pipelinepilot-agent-staging")

    logger.info("🚀 Deploying PipelinePilot Orchestrator (ADK-compliant wrapper)")
    logger.info(f"Project: {project_id}")
    logger.info(f"Location: {location}")
    logger.info(f"Service Account: {service_account}")
    logger.info(f"Staging Bucket: {staging_bucket}")

    # Initialize Vertex AI
    aiplatform.init(
        project=project_id,
        location=location,
        staging_bucket=staging_bucket
    )

    # Create wrapper instance
    logger.info("Creating OrchestratorWrapper instance...")
    wrapper = OrchestratorWrapper()

    # Deploy to Reasoning Engine with pinned cloudpickle
    logger.info("Deploying to Vertex AI Reasoning Engine...")
    logger.info("⚠️  CRITICAL: Using cloudpickle==3.1.1 (pinned for Reasoning Engine compatibility)")

    engine = reasoning_engines.ReasoningEngine.create(
        wrapper,
        requirements=[
            "google-cloud-aiplatform>=1.121.0",
            "cloudpickle==3.1.1",  # PINNED - Required for Reasoning Engine
            "httpx>=0.27.0",  # For tool HTTP requests
            "google-cloud-secret-manager>=2.0.0",  # For secrets
        ],
        display_name="pipelinepilot-orchestrator-wrapper",
        description="PipelinePilot Orchestrator with ADK-compliant query method",
        service_account=service_account,
        labels={
            "component": "orchestrator",
            "tier": "dev",
            "version": "v2",
            "adk_compliant": "true"
        }
    )

    logger.info("✅ Deployment successful!")
    logger.info(f"Engine Resource Name: {engine.resource_name}")
    logger.info(f"Engine ID: {engine.name}")

    # Print query endpoint for testing
    logger.info("\n📡 Query Endpoint:")
    logger.info(f"https://{location}-aiplatform.googleapis.com/v1/{engine.resource_name}:query")

    logger.info("\n🧪 Test with:")
    logger.info(f'curl -X POST \\')
    logger.info(f'  -H "Authorization: Bearer $(gcloud auth print-access-token)" \\')
    logger.info(f'  -H "Content-Type: application/json" \\')
    logger.info(f'  -d \'{{"class_method": "query", "input": {{"action": "ping"}}}}\' \\')
    logger.info(f'  "https://{location}-aiplatform.googleapis.com/v1/{engine.resource_name}:query"')

    return engine.resource_name


if __name__ == "__main__":
    try:
        engine_id = deploy_orchestrator()
        logger.info(f"\n✅ Orchestrator deployed successfully: {engine_id}")
    except Exception as e:
        logger.error(f"\n❌ Deployment failed: {str(e)}", exc_info=True)
        raise
