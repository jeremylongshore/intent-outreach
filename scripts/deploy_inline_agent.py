#!/usr/bin/env python3
"""Deploy agent with inline class definition - no module dependencies."""

import os
from google.cloud import aiplatform
from vertexai.preview import reasoning_engines
from vertexai.reasoning_engines._reasoning_engines import Queryable
from typing import Any, Dict

# Configuration
PROJECT_ID = os.environ.get("PROJECT_ID", "pipelinepilot-prod")
LOCATION = os.environ.get("LOCATION", "us-central1")
STAGING_BUCKET = f"gs://{PROJECT_ID}-staging"

print(f"============================================================")
print(f"Inline Agent Deployment Test")
print(f"Project: {PROJECT_ID}")
print(f"Location: {LOCATION}")
print(f"============================================================")

# Define agent class inline
class InlineTestAgent(Queryable):
    """Test agent with no external dependencies."""

    def __init__(self):
        """Initialize agent."""
        self.counter = 0

    def query(self, **kwargs) -> Dict[str, Any]:
        """Execute query."""
        self.counter += 1
        message = kwargs.get("message", "No message")
        return {
            "status": "success",
            "message": message,
            "counter": self.counter,
            "echo": f"Received: {message}"
        }

# Initialize AI Platform
aiplatform.init(
    project=PROJECT_ID,
    location=LOCATION,
    staging_bucket=STAGING_BUCKET
)

# Create agent instance
print("Creating inline agent...")
agent = InlineTestAgent()

# Test locally
print("Testing locally...")
result = agent.query(message="Hello inline")
print(f"Local test result: {result}")

# Deploy
print("\nDeploying to Vertex AI Agent Engine...")
reasoning_engine = reasoning_engines.ReasoningEngine.create(
    agent,
    requirements=[
        "google-cloud-aiplatform>=1.121.0",
        "cloudpickle==3.1.1",  # Pin to match local version
    ],
    display_name="Inline Test Agent",
    description="Agent with inline class definition",
)

print(f"\n✅ SUCCESS!")
print(f"Resource name: {reasoning_engine.resource_name}")
