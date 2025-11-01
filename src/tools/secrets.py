"""Secret Manager integration for PipelinePilot.

Provides secure access to API keys and credentials stored in Google Cloud Secret Manager.
"""

from google.cloud import secretmanager
from typing import Optional
import logging

logger = logging.getLogger(__name__)


def get_secret(project_id: str, name: str, version: str = "latest") -> str:
    """Retrieve a secret from Google Cloud Secret Manager.

    Args:
        project_id: GCP project ID
        name: Secret name (e.g., "CLAY_API_KEY")
        version: Secret version (default: "latest")

    Returns:
        Secret value as string

    Raises:
        Exception: If secret doesn't exist or can't be accessed
    """
    try:
        client = secretmanager.SecretManagerServiceClient()
        name_path = client.secret_version_path(project_id, name, version)
        response = client.access_secret_version(request={"name": name_path})
        secret_value = response.payload.data.decode('UTF-8')
        logger.info(f"Successfully retrieved secret: {name}")
        return secret_value
    except Exception as e:
        logger.error(f"Failed to retrieve secret {name}: {e}")
        raise


def get_provider_keys(project_id: str) -> dict[str, Optional[str]]:
    """Retrieve all provider API keys.

    Args:
        project_id: GCP project ID

    Returns:
        Dictionary of provider names to API keys
    """
    providers = [
        "CLAY_API_KEY",
        "APOLLO_API_KEY",
        "CLEARBIT_API_KEY",
        "CRUNCHBASE_API_KEY",
        "ZOOMINFO_API_KEY",
        "SALES_NAVIGATOR_API_KEY",
        "INSTANTLY_API_KEY",
    ]

    keys = {}
    for provider in providers:
        try:
            keys[provider] = get_secret(project_id, provider)
        except Exception:
            logger.warning(f"Could not retrieve {provider}, will be None")
            keys[provider] = None

    return keys
