#!/usr/bin/env python3
"""Test deployment of minimal agent to verify pattern works."""

import os
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from google.cloud import aiplatform
from vertexai.preview import reasoning_engines
from agents.minimal_test import create_minimal_agent

# Configuration
PROJECT_ID = os.environ.get("PROJECT_ID", "pipelinepilot-prod")
LOCATION = os.environ.get("LOCATION", "us-central1")
STAGING_BUCKET = f"gs://{PROJECT_ID}-staging"

print(f"============================================================")
print(f"Minimal Agent Deployment Test")
print(f"Project: {PROJECT_ID}")
print(f"Location: {LOCATION}")
print(f"============================================================")

# Initialize AI Platform
aiplatform.init(
    project=PROJECT_ID,
    location=LOCATION,
    staging_bucket=STAGING_BUCKET
)

# Create minimal agent
print("Creating minimal agent...")
agent = create_minimal_agent()

# Test locally first
print("Testing locally...")
result = agent.query(message="Hello from test")
print(f"Local test result: {result}")

# Deploy to Agent Engine
print("\nDeploying to Vertex AI Agent Engine...")

# Include src directory as extra package so 'agents' module is available
src_dir = Path(__file__).parent.parent / "src"

reasoning_engine = reasoning_engines.ReasoningEngine.create(
    agent,
    requirements=[
        "google-cloud-aiplatform>=1.121.0",
    ],
    extra_packages=[str(src_dir)],
    display_name="Minimal Test Agent",
    description="Minimal agent to verify deployment pattern",
)

print(f"\n✅ SUCCESS!")
print(f"Resource name: {reasoning_engine.resource_name}")
print(f"\nTest query:")
print(f'  python3 scripts/query_agent.py "{reasoning_engine.resource_name}" \'{{"message": "test"}}\'')
