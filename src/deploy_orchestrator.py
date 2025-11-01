#!/usr/bin/env python3
"""
Deploy PipelinePilot Orchestrator Agent to Vertex AI Agent Engine

Single agent with all 4 tools (Clay, Apollo, Clearbit, Crunchbase).
No multi-agent architecture - everything in one agent.
"""

import os
import logging
from google.cloud import aiplatform
from google.adk import Deployer
from agents.orchestrator import orchestrator_agent

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# Configuration
PROJECT_ID = os.environ.get("PROJECT_ID", "pipelinepilot-prod")
LOCATION = os.environ.get("LOCATION", "us-central1")
STAGING_BUCKET = f"gs://{PROJECT_ID}-staging"

def main():
    """Deploy orchestrator agent to Vertex AI Agent Engine."""

    logger.info(f"Deploying PipelinePilot Orchestrator to Vertex AI Agent Engine")
    logger.info(f"Project: {PROJECT_ID}")
    logger.info(f"Location: {LOCATION}")
    logger.info(f"Staging Bucket: {STAGING_BUCKET}")

    # Initialize Vertex AI
    aiplatform.init(
        project=PROJECT_ID,
        location=LOCATION,
        staging_bucket=STAGING_BUCKET
    )

    # Deploy orchestrator agent using ADK Deployer
    deployer = Deployer(project_id=PROJECT_ID, location=LOCATION)

    logger.info("Deploying orchestrator agent with 4 tools (Clay, Apollo, Clearbit, Crunchbase)...")

    deployed_agent = deployer.deploy(
        agent=orchestrator_agent,
        display_name="PipelinePilot Orchestrator",
        description="Single orchestrator agent that handles research, enrichment, and outreach",
        requirements=[
            "google-cloud-aiplatform>=1.121.0",
            "google-adk>=1.0.0",
            "google-cloud-secret-manager>=2.20.2",
            "httpx>=0.27.2",
            "cloudpickle==3.1.1",  # Pin cloudpickle version
        ],
    )

    resource_name = deployed_agent.resource_name
    logger.info(f"✅ Orchestrator deployed successfully")
    logger.info(f"Resource Name: {resource_name}")

    # Print next steps
    print("\n" + "="*60)
    print("DEPLOYMENT SUCCESSFUL")
    print("="*60)
    print(f"\nOrchestrator Resource ID:")
    print(f"  {resource_name}")
    print(f"\nUpdate Firebase Functions config:")
    print(f"  firebase functions:config:set \\")
    print(f"    agents.orchestrator_id=\"{resource_name}\"")
    print(f"\nTest the agent:")
    print(f"  python3 -c \"from google.cloud import aiplatform; from google.adk import Agent; agent = Agent.load('{resource_name}'); print(agent.query('icp: B2B SaaS, domains: [example.com]'))\"")
    print("="*60)

    return resource_name


if __name__ == "__main__":
    main()
