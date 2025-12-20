/**
 * Vertex AI Tenant-Aware Service Wrapper
 *
 * Wraps Vertex AI Reasoning Engine calls to ensure tenant_id is always passed
 * in the request context. This enables the agent layer to:
 * - Pull tenant-specific secrets from Secret Manager
 * - Write data to tenant-scoped Firestore collections
 * - Enforce tenant isolation at the AI layer
 */

import { GoogleAuth } from "google-auth-library";
import { defineSecret } from "firebase-functions/params";
import { validateTenantSecrets } from "../secrets/tenantSecrets.js";

// Secrets
const ORCHESTRATOR_DEV_ID = defineSecret("ORCHESTRATOR_DEV_ID");

// Constants
const PROJECT_ID = process.env.GCLOUD_PROJECT || "pipelinepilot-prod";
const REGION = "us-central1";

/**
 * Input payload for Vertex AI Reasoning Engine
 */
export interface VertexInput {
  message?: string;
  input?: Record<string, any>;
  user_id?: string;
  [key: string]: any;
}

/**
 * Response from Vertex AI Reasoning Engine
 */
export interface VertexResponse {
  output?: any;
  error?: string;
  [key: string]: any;
}

/**
 * Call Vertex AI Reasoning Engine with tenant context
 *
 * This function ensures tenant_id is always passed to the agent layer,
 * enabling tenant-scoped secret retrieval and data isolation.
 *
 * @param tenantId - Tenant ID for isolation
 * @param input - Input payload for the reasoning engine
 * @returns Vertex AI response
 */
export async function callVertexForTenant(
  tenantId: string,
  input: VertexInput
): Promise<VertexResponse> {
  console.log("[VERTEX-TENANT] Calling Reasoning Engine for tenant:", tenantId);

  // Validate tenant has required secrets configured
  console.log("[VERTEX-TENANT] Validating tenant secrets...");
  const { valid, missing, placeholders } = await validateTenantSecrets(tenantId, [
    "CLAY",
    "APOLLO",
    "CLEARBIT",
    "CRUNCHBASE",
  ]);

  if (!valid) {
    console.error("[VERTEX-TENANT] Tenant secrets incomplete:", {
      tenantId,
      missing,
      placeholders,
    });

    // Return 422 error with details
    return {
      error: "TENANT_SECRETS_INCOMPLETE",
      tenantId,
      missing,
      placeholders,
      message:
        `Tenant ${tenantId} is missing required API keys. ` +
        `Missing: ${missing.join(", ")}. ` +
        `Placeholders: ${placeholders.join(", ")}. ` +
        `Please configure these secrets in Secret Manager.`,
    } as VertexResponse;
  }

  console.log("[VERTEX-TENANT] Tenant secrets validated successfully");

  // Get engine ID from secret
  const engineId = ORCHESTRATOR_DEV_ID.value();

  if (!engineId) {
    throw new Error("ORCHESTRATOR_DEV_ID not configured");
  }

  console.log("[VERTEX-TENANT] Engine ID:", engineId);

  // Get auth token
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();

  if (!token) {
    throw new Error("Failed to obtain auth token");
  }

  console.log("[VERTEX-TENANT] Auth token acquired");

  // Construct Reasoning Engine URL
  const url = `https://${REGION}-aiplatform.googleapis.com/v1/${engineId}:query`;

  // Build tenant-aware payload
  // CRITICAL: tenant_id must be in multiple places for agent to see it
  const payload = {
    class_method: "query",
    input: {
      ...input,
      // Ensure tenant_id is at root level of input
      tenant_id: tenantId,
      // Also add to context for clarity
      context: {
        tenant_id: tenantId,
        ...(input.context || {}),
      },
      // Preserve original message if present
      message: input.message || input.input?.message || "",
      // Preserve user_id if present
      user_id: input.user_id || input.input?.user_id || "dashboard",
    },
  };

  console.log("[VERTEX-TENANT] Calling URL:", url);
  console.log("[VERTEX-TENANT] Payload:", JSON.stringify(payload, null, 2));

  try {
    // Call Reasoning Engine
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    console.log("[VERTEX-TENANT] Response status:", response.status, response.statusText);

    const result = await response.json();

    console.log("[VERTEX-TENANT] Response body:", JSON.stringify(result, null, 2));

    if (!response.ok) {
      console.error("[VERTEX-TENANT] Reasoning Engine error:", result);
      throw new Error(
        `Reasoning Engine error: ${result.error?.message || result.message || "Unknown error"}`
      );
    }

    console.log("[VERTEX-TENANT] Success for tenant:", tenantId);

    return result as VertexResponse;
  } catch (error) {
    console.error("[VERTEX-TENANT] Error calling Reasoning Engine:", error);
    throw error;
  }
}

