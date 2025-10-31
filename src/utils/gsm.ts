import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

let secretManagerClient: SecretManagerServiceClient | null = null;

function getSecretManagerClient(): SecretManagerServiceClient {
  if (!secretManagerClient) {
    secretManagerClient = new SecretManagerServiceClient({
      projectId: process.env.GCP_PROJECT_ID
    });
  }
  return secretManagerClient;
}

/**
 * Get secret value from Google Secret Manager
 * @param secretRef - Full secret reference (e.g., "projects/PROJECT_ID/secrets/SECRET_NAME/versions/latest")
 * @returns Secret value as string
 */
export async function getSecret(secretRef: string): Promise<string> {
  const client = getSecretManagerClient();

  try {
    const [version] = await client.accessSecretVersion({
      name: secretRef
    });

    const payload = version.payload?.data;
    if (!payload) {
      throw new Error(`Secret ${secretRef} has no payload`);
    }

    return payload.toString();
  } catch (error: any) {
    console.error(`Error accessing secret ${secretRef}:`, error);
    throw new Error(`Failed to access secret: ${error.message}`);
  }
}

/**
 * Create or update a secret in Google Secret Manager
 * @param secretName - Short name of the secret (e.g., "clay-api-key")
 * @param secretValue - Secret value to store
 * @param projectId - GCP project ID (defaults to env var)
 * @returns Full secret reference
 */
export async function createSecret(
  secretName: string,
  secretValue: string,
  projectId?: string
): Promise<string> {
  const client = getSecretManagerClient();
  const project = projectId || process.env.GCP_PROJECT_ID;

  if (!project) {
    throw new Error("GCP_PROJECT_ID not set");
  }

  const parent = `projects/${project}`;
  const secretId = secretName;

  try {
    // Try to create the secret
    const [secret] = await client.createSecret({
      parent,
      secretId,
      secret: {
        replication: {
          automatic: {}
        }
      }
    });

    // Add secret version with the value
    await client.addSecretVersion({
      parent: secret.name,
      payload: {
        data: Buffer.from(secretValue, "utf8")
      }
    });

    return `${secret.name}/versions/latest`;
  } catch (error: any) {
    // If secret already exists, just add a new version
    if (error.code === 6) { // ALREADY_EXISTS
      const secretPath = `${parent}/secrets/${secretId}`;
      await client.addSecretVersion({
        parent: secretPath,
        payload: {
          data: Buffer.from(secretValue, "utf8")
        }
      });
      return `${secretPath}/versions/latest`;
    }
    throw error;
  }
}
