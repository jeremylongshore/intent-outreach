"""
PipelinePilot Orchestrator Wrapper

ADK-compliant Reasoning Engine wrapper with synchronous query(**kwargs) method.
This wrapper exposes a JSON-serializable query interface that Vertex AI Agent Engine requires.

Requirement: The class must have a `query(**kwargs)` method that returns a dict.
This is the standard ADK pattern for Reasoning Engine deployments.
"""

import asyncio
from typing import Dict, Any

# Import our async tool functions directly (bypass agents/__init__.py to avoid old orchestrator)
import importlib.util
from pathlib import Path

# Load tools module directly without triggering package __init__
tools_path = Path(__file__).parent / "agents" / "tools.py"
spec = importlib.util.spec_from_file_location("tools", tools_path)
tools = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tools)

clay_lookup = tools.clay_lookup
apollo_people = tools.apollo_people
clearbit_enrich = tools.clearbit_enrich
crunchbase_company = tools.crunchbase_company


class OrchestratorWrapper:
    """
    ADK-compliant wrapper for PipelinePilot orchestrator.

    Exposes a synchronous query(**kwargs) method that Vertex AI Agent Engine
    can call remotely via :query endpoint.
    """

    def __init__(self):
        """Initialize the orchestrator wrapper."""
        # No state needed for now - can add tool registry, config, etc. later
        pass

    def query(self, **kwargs) -> Dict[str, Any]:
        """
        Main query method called by Vertex AI Agent Engine.

        This is a SYNCHRONOUS method that wraps async tool calls using asyncio.run().

        Args:
            **kwargs: Query parameters including:
                - action (str): Which tool to call ("clay", "apollo", "clearbit", "crunchbase")
                - domain (str): Company domain for clay/crunchbase
                - query (str): Search query for apollo
                - email (str): Email address for clearbit
                - name (str): Company name for crunchbase
                - icp (str): Ideal Customer Profile description
                - domains (list): List of domains to process
                - user_id (str): User identifier for tracking

        Returns:
            dict: JSON-serializable response with:
                - ok (bool): Success status
                - message (str): Response message
                - data (dict): Tool results or echo of input
                - error (str): Error message if failed
        """
        action = kwargs.get("action", "ping")

        # Handle ping/health check
        if action == "ping":
            return {
                "ok": True,
                "message": "PipelinePilot Orchestrator online",
                "version": "1.0.0",
                "tools": ["clay", "apollo", "clearbit", "crunchbase"],
                "echo": kwargs
            }

        # Handle tool calls (wrapped in asyncio.run for sync interface)
        try:
            if action == "clay":
                domain = kwargs.get("domain")
                if not domain:
                    return {"ok": False, "error": "Missing required parameter: domain"}

                # Run async function in sync context
                result = asyncio.run(clay_lookup(domain))
                return {
                    "ok": not result.get("error", False),
                    "action": "clay",
                    "domain": domain,
                    "data": result
                }

            elif action == "apollo":
                query_str = kwargs.get("query")
                if not query_str:
                    return {"ok": False, "error": "Missing required parameter: query"}

                result = asyncio.run(apollo_people(query_str))
                return {
                    "ok": not result.get("error", False),
                    "action": "apollo",
                    "query": query_str,
                    "data": result
                }

            elif action == "clearbit":
                email = kwargs.get("email")
                if not email:
                    return {"ok": False, "error": "Missing required parameter: email"}

                result = asyncio.run(clearbit_enrich(email))
                return {
                    "ok": not result.get("error", False),
                    "action": "clearbit",
                    "email": email,
                    "data": result
                }

            elif action == "crunchbase":
                name = kwargs.get("name")
                if not name:
                    return {"ok": False, "error": "Missing required parameter: name"}

                result = asyncio.run(crunchbase_company(name))
                return {
                    "ok": not result.get("error", False),
                    "action": "crunchbase",
                    "name": name,
                    "data": result
                }

            else:
                return {
                    "ok": False,
                    "error": f"Unknown action: {action}",
                    "valid_actions": ["ping", "clay", "apollo", "clearbit", "crunchbase"],
                    "echo": kwargs
                }

        except Exception as e:
            return {
                "ok": False,
                "error": f"Orchestrator error: {str(e)}",
                "action": action,
                "echo": kwargs
            }
