"""Minimal Test Agent - Verify deployment pattern works."""

from typing import Any, Dict
from vertexai.reasoning_engines._reasoning_engines import Queryable


class MinimalAgent(Queryable):
    """Minimal agent for testing deployment."""

    def __init__(self):
        """Initialize minimal agent."""
        self.counter = 0

    def query(self, **kwargs) -> Dict[str, Any]:
        """Execute query.

        Args:
            **kwargs: Query parameters

        Returns:
            Dict with simple response
        """
        self.counter += 1
        message = kwargs.get("message", "No message provided")

        return {
            "status": "success",
            "message": message,
            "counter": self.counter,
            "echo": f"Received: {message}"
        }


def create_minimal_agent() -> MinimalAgent:
    """Factory function to create minimal agent."""
    return MinimalAgent()
