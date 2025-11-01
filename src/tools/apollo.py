"""Apollo API integration for person search."""

import httpx
from typing import Any
import logging
from .secrets import get_secret
import os

logger = logging.getLogger(__name__)

PROJECT_ID = os.getenv("PROJECT_ID", "pipelinepilot-prod")


async def apollo_person_search(full_name: str, company: str) -> dict[str, Any]:
    """Search for a person using Apollo API.

    Args:
        full_name: Person's full name
        company: Company name

    Returns:
        Dictionary with person information or error
    """
    try:
        api_key = get_secret(PROJECT_ID, "APOLLO_API_KEY")

        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.apollo.io/v1/people/search",
                headers={"X-Api-Key": api_key},
                json={"name": full_name, "organization_name": company},
                timeout=30.0,
            )
            response.raise_for_status()
            data = response.json()

            return {"ok": True, "person": data.get("person", {})}

    except Exception as e:
        logger.error(f"Apollo search failed for {full_name} at {company}: {e}")
        return {"ok": False, "person": {}, "error": str(e)}
