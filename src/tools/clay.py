"""Clay API integration for company lookup."""

import httpx
from typing import Any
import logging
from .secrets import get_secret
import os

logger = logging.getLogger(__name__)

PROJECT_ID = os.getenv("PROJECT_ID", "pipelinepilot-prod")


async def clay_company_lookup(domain: str) -> dict[str, Any]:
    """Look up company information by domain using Clay API.

    Args:
        domain: Company domain (e.g., "acme.io")

    Returns:
        Dictionary with company information or error
    """
    try:
        api_key = get_secret(PROJECT_ID, "CLAY_API_KEY")

        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.clay.com/v1/companies/lookup",
                headers={"Authorization": f"Bearer {api_key}"},
                json={"domain": domain},
                timeout=30.0,
            )
            response.raise_for_status()
            data = response.json()

            return {
                "ok": True,
                "company": data.get("company", {}),
                "error": None,
            }

    except Exception as e:
        logger.error(f"Clay lookup failed for {domain}: {e}")
        return {"ok": False, "company": {}, "error": str(e)}
