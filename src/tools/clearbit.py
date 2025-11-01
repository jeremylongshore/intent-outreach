"""Clearbit API integration for company enrichment."""

import httpx
from typing import Any
import logging
from .secrets import get_secret
import os

logger = logging.getLogger(__name__)

PROJECT_ID = os.getenv("PROJECT_ID", "pipelinepilot-prod")


async def clearbit_enrich(domain: str) -> dict[str, Any]:
    """Enrich company data using Clearbit API.

    Args:
        domain: Company domain

    Returns:
        Dictionary with enriched company data
    """
    try:
        api_key = get_secret(PROJECT_ID, "CLEARBIT_API_KEY")

        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://company.clearbit.com/v2/companies/find",
                params={"domain": domain},
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=30.0,
            )
            response.raise_for_status()
            data = response.json()

            return {
                "ok": True,
                "company": data,
                "employees": data.get("metrics", {}).get("employees", 0),
                "tech": data.get("tech", []),
            }

    except Exception as e:
        logger.error(f"Clearbit enrichment failed for {domain}: {e}")
        return {"ok": False, "company": {}, "error": str(e)}
