"""Crunchbase API integration for company data."""

import httpx
from typing import Any
import logging
from .secrets import get_secret
import os

logger = logging.getLogger(__name__)

PROJECT_ID = os.getenv("PROJECT_ID", "pipelinepilot-prod")


async def crunchbase_company(query: str) -> dict[str, Any]:
    """Look up company information on Crunchbase.

    Args:
        query: Company name or domain

    Returns:
        Dictionary with company funding and size data
    """
    try:
        api_key = get_secret(PROJECT_ID, "CRUNCHBASE_API_KEY")

        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://api.crunchbase.com/api/v4/searches/organizations",
                headers={"X-cb-user-key": api_key},
                params={"query": query},
                timeout=30.0,
            )
            response.raise_for_status()
            data = response.json()

            entities = data.get("entities", [])
            if entities:
                company = entities[0]
                return {
                    "ok": True,
                    "company": company,
                    "funding": company.get("funding_total", {}).get("value", 0),
                    "employees": company.get("num_employees_enum", "Unknown"),
                }

            return {"ok": False, "company": {}, "error": "No results found"}

    except Exception as e:
        logger.error(f"Crunchbase lookup failed for {query}: {e}")
        return {"ok": False, "company": {}, "error": str(e)}
