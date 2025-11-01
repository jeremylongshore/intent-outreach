"""
PipelinePilot Tool Functions

Direct API integration tools for Clay, Apollo, Clearbit, and Crunchbase.
These are Python async functions that the orchestrator agent calls directly.
"""

import os
import httpx
from google.cloud import secretmanager


def _get_secret(secret_name: str) -> str:
    """Retrieve secret from Google Cloud Secret Manager."""
    client = secretmanager.SecretManagerServiceClient()
    project_id = os.environ.get("PROJECT_ID", "pipelinepilot-prod")
    name = client.secret_version_path(project_id, secret_name, "latest")
    response = client.access_secret_version(request={"name": name})
    return response.payload.data.decode("utf-8")


async def clay_lookup(domain: str) -> dict:
    """
    Look up company information from Clay API.

    Args:
        domain: Company domain (e.g., "example.com")

    Returns:
        Company data including name, industry, size, etc.
    """
    api_key = _get_secret("CLAY_API_KEY")

    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(
            "https://api.clay.run/v1/company",
            params={"domain": domain},
            headers={"Authorization": f"Bearer {api_key}"}
        )
        response.raise_for_status()
        return response.json()


async def apollo_people(query: str) -> dict:
    """
    Search for people using Apollo.io API.

    Args:
        query: Search query (company name, job title, etc.)

    Returns:
        List of contacts with email, LinkedIn, job title, etc.
    """
    api_key = _get_secret("APOLLO_API_KEY")

    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(
            "https://api.apollo.io/v1/people/search",
            params={"q": query, "page": 1},
            headers={"Authorization": f"Bearer {api_key}"}
        )
        response.raise_for_status()
        return response.json()


async def clearbit_enrich(email: str) -> dict:
    """
    Enrich contact data using Clearbit Person API.

    Args:
        email: Contact email address

    Returns:
        Person data including name, location, social profiles, etc.
    """
    api_key = _get_secret("CLEARBIT_API_KEY")

    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(
            "https://person.clearbit.com/v2/people/find",
            params={"email": email},
            headers={"Authorization": f"Bearer {api_key}"}
        )
        response.raise_for_status()
        return response.json()


async def crunchbase_company(name: str) -> dict:
    """
    Look up company funding and investment data from Crunchbase.

    Args:
        name: Company name

    Returns:
        Company data including funding rounds, investors, valuation, etc.
    """
    api_key = _get_secret("CRUNCHBASE_API_KEY")

    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(
            "https://api.crunchbase.com/api/v4/entities/organizations",
            params={"query": name, "user_key": api_key}
        )
        response.raise_for_status()
        return response.json()
