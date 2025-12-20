/**
 * Tenant Secret Manager Automation
 *
 * Manages per-tenant secrets in Google Cloud Secret Manager.
 * Each tenant gets 4 secrets with predictable names:
 * - TENANT_{tenantId}_CLAY_API_KEY
 * - TENANT_{tenantId}_APOLLO_API_KEY
 * - TENANT_{tenantId}_CLEARBIT_API_KEY
 * - TENANT_{tenantId}_CRUNCHBASE_API_KEY
 *
 * All secrets are created with IAM bindings for:
 * - Cloud Functions SA (for Firebase Functions)
 * - Vertex AI Reasoning Engine SA (for agent access)
 */
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
// Constants
const PROJECT_ID = process.env.GCLOUD_PROJECT || "pipelinepilot-prod";
const PROJECT_NUMBER = "365258353703";
// Service Accounts that need access to tenant secrets
const CLOUD_FUNCTIONS_SA = `${PROJECT_NUMBER}-compute@developer.gserviceaccount.com`;
const VERTEX_AI_RE_SA = `service-${PROJECT_NUMBER}@gcp-sa-aiplatform-re.iam.gserviceaccount.com`;
// Providers that each tenant needs
const PROVIDERS = ["CLAY", "APOLLO", "CLEARBIT", "CRUNCHBASE"];
// Placeholder value for secrets awaiting configuration
const PLACEHOLDER_VALUE = "PENDING_CONFIG";
/**
 * Initialize Secret Manager client
 */
const secretManager = new SecretManagerServiceClient();
/**
 * Ensure all required secrets exist for a tenant
 *
 * Creates secrets if missing, adds placeholder versions, and grants IAM permissions.
 *
 * @param tenantId - Tenant ID (e.g., "tenant_abc12345")
 * @returns Secret check result with status of each secret
 */
export async function ensureTenantSecrets(tenantId) {
    console.log(`[TENANT-SECRETS] Ensuring secrets for tenant: ${tenantId}`);
    const result = {
        tenantId,
        secrets: {},
        allConfigured: false,
        missing: [],
        placeholders: [],
        errors: [],
    };
    // Process each provider
    for (const provider of PROVIDERS) {
        const secretName = `TENANT_${tenantId}_${provider}_API_KEY`;
        try {
            // Ensure secret exists
            const status = await ensureSecret(secretName, PLACEHOLDER_VALUE);
            // Ensure IAM bindings
            await ensureIamBinding(secretName, CLOUD_FUNCTIONS_SA, "roles/secretmanager.secretAccessor");
            await ensureIamBinding(secretName, VERTEX_AI_RE_SA, "roles/secretmanager.secretAccessor");
            result.secrets[provider] = status;
            if (status === "missing") {
                result.missing.push(provider);
            }
            else if (status === "placeholder") {
                result.placeholders.push(provider);
            }
        }
        catch (error) {
            console.error(`[TENANT-SECRETS] Error processing ${secretName}:`, error);
            result.secrets[provider] = "error";
            result.errors.push(`${provider}: ${error.message}`);
        }
    }
    // Check if all configured
    result.allConfigured =
        result.missing.length === 0 &&
            result.placeholders.length === 0 &&
            result.errors.length === 0;
    console.log(`[TENANT-SECRETS] Result for ${tenantId}:`, {
        allConfigured: result.allConfigured,
        missing: result.missing,
        placeholders: result.placeholders,
        errors: result.errors.length,
    });
    return result;
}
/**
 * Ensure a secret exists with at least one version
 *
 * @param secretName - Full secret name (e.g., "TENANT_tenant_abc123_CLAY_API_KEY")
 * @param placeholderValue - Value to use if creating new secret
 * @returns Status of the secret after ensuring it exists
 */
async function ensureSecret(secretName, placeholderValue = PLACEHOLDER_VALUE) {
    const parent = `projects/${PROJECT_ID}`;
    const secretPath = `${parent}/secrets/${secretName}`;
    try {
        // Check if secret exists
        const [secret] = await secretManager.getSecret({ name: secretPath });
        console.log(`[TENANT-SECRETS] Secret exists: ${secretName}`);
        // Check if it has any versions
        const [versions] = await secretManager.listSecretVersions({
            parent: secretPath,
            filter: "state:ENABLED",
        });
        if (!versions || versions.length === 0) {
            console.log(`[TENANT-SECRETS] Secret has no versions, adding placeholder: ${secretName}`);
            await addSecretVersion(secretName, placeholderValue);
            return "placeholder";
        }
        // Check if latest version is placeholder
        const latestVersion = versions[0];
        if (latestVersion && latestVersion.name) {
            const [versionData] = await secretManager.accessSecretVersion({
                name: latestVersion.name,
            });
            const value = versionData.payload?.data?.toString() || "";
            if (value === PLACEHOLDER_VALUE || value === "PLACEHOLDER_AWAITING_CUSTOMER_INPUT") {
                console.log(`[TENANT-SECRETS] Secret has placeholder value: ${secretName}`);
                return "placeholder";
            }
            console.log(`[TENANT-SECRETS] Secret is configured: ${secretName}`);
            return "ok";
        }
        return "placeholder";
    }
    catch (error) {
        if (error.code === 5) {
            // NOT_FOUND - secret doesn't exist, create it
            console.log(`[TENANT-SECRETS] Creating secret: ${secretName}`);
            await secretManager.createSecret({
                parent,
                secretId: secretName,
                secret: {
                    replication: {
                        automatic: {},
                    },
                },
            });
            // Add placeholder version
            await addSecretVersion(secretName, placeholderValue);
            console.log(`[TENANT-SECRETS] Secret created with placeholder: ${secretName}`);
            return "placeholder";
        }
        // Other error
        console.error(`[TENANT-SECRETS] Error checking secret ${secretName}:`, error);
        throw error;
    }
}
/**
 * Add a new version to an existing secret
 *
 * @param secretName - Secret name
 * @param value - Value for the new version
 */
async function addSecretVersion(secretName, value) {
    const parent = `projects/${PROJECT_ID}/secrets/${secretName}`;
    await secretManager.addSecretVersion({
        parent,
        payload: {
            data: Buffer.from(value, "utf8"),
        },
    });
    console.log(`[TENANT-SECRETS] Added version to secret: ${secretName}`);
}
/**
 * Ensure IAM binding exists on a secret
 *
 * Grants a service account access to read the secret.
 *
 * @param secretName - Secret name
 * @param member - Service account email (e.g., "serviceAccount:xxx@xxx.iam.gserviceaccount.com")
 * @param role - IAM role (e.g., "roles/secretmanager.secretAccessor")
 */
export async function ensureIamBinding(secretName, member, role) {
    const resource = `projects/${PROJECT_ID}/secrets/${secretName}`;
    const memberWithPrefix = member.includes("serviceAccount:")
        ? member
        : `serviceAccount:${member}`;
    try {
        // Get current IAM policy
        const [policy] = await secretManager.getIamPolicy({ resource });
        // Check if binding already exists
        let bindingExists = false;
        if (policy.bindings) {
            for (const binding of policy.bindings) {
                if (binding.role === role && binding.members?.includes(memberWithPrefix)) {
                    bindingExists = true;
                    break;
                }
            }
        }
        if (bindingExists) {
            console.log(`[TENANT-SECRETS] IAM binding already exists: ${secretName} → ${member}`);
            return;
        }
        // Add binding
        const bindings = policy.bindings || [];
        // Find existing role binding or create new one
        let roleBinding = bindings.find((b) => b.role === role);
        if (roleBinding) {
            // Add member to existing role binding
            if (!roleBinding.members) {
                roleBinding.members = [];
            }
            if (!roleBinding.members.includes(memberWithPrefix)) {
                roleBinding.members.push(memberWithPrefix);
            }
        }
        else {
            // Create new role binding
            bindings.push({
                role,
                members: [memberWithPrefix],
            });
        }
        // Set updated policy
        await secretManager.setIamPolicy({
            resource,
            policy: { bindings },
        });
        console.log(`[TENANT-SECRETS] IAM binding added: ${secretName} → ${member}`);
    }
    catch (error) {
        console.error(`[TENANT-SECRETS] Error setting IAM policy for ${secretName}:`, error);
        throw error;
    }
}
/**
 * Validate that a tenant has all required secrets configured
 *
 * Checks that all required provider secrets exist and are not placeholders.
 *
 * @param tenantId - Tenant ID
 * @param requiredProviders - Array of providers to check (defaults to all)
 * @returns Validation result with missing/placeholder secrets
 */
export async function validateTenantSecrets(tenantId, requiredProviders = [...PROVIDERS]) {
    console.log(`[TENANT-SECRETS] Validating secrets for tenant: ${tenantId}`);
    const missing = [];
    const placeholders = [];
    for (const provider of requiredProviders) {
        const secretName = `TENANT_${tenantId}_${provider}_API_KEY`;
        const parent = `projects/${PROJECT_ID}`;
        const secretPath = `${parent}/secrets/${secretName}`;
        try {
            // Check if secret exists
            await secretManager.getSecret({ name: secretPath });
            // Check latest version
            const [versions] = await secretManager.listSecretVersions({
                parent: secretPath,
                filter: "state:ENABLED",
            });
            if (!versions || versions.length === 0) {
                placeholders.push(provider);
                continue;
            }
            // Check if latest version is placeholder
            const latestVersion = versions[0];
            if (latestVersion && latestVersion.name) {
                const [versionData] = await secretManager.accessSecretVersion({
                    name: latestVersion.name,
                });
                const value = versionData.payload?.data?.toString() || "";
                if (value === PLACEHOLDER_VALUE || value === "PLACEHOLDER_AWAITING_CUSTOMER_INPUT") {
                    placeholders.push(provider);
                }
            }
        }
        catch (error) {
            if (error.code === 5) {
                // NOT_FOUND
                missing.push(provider);
            }
            else {
                console.warn(`[TENANT-SECRETS] Error checking ${secretName}:`, error);
                missing.push(provider);
            }
        }
    }
    const valid = missing.length === 0 && placeholders.length === 0;
    console.log(`[TENANT-SECRETS] Validation result for ${tenantId}:`, {
        valid,
        missing,
        placeholders,
    });
    return { valid, missing, placeholders };
}
/**
 * Write secret health to Firestore
 *
 * Updates /tenants/{tenantId}/config/secrets with current status.
 *
 * @param tenantId - Tenant ID
 * @param result - Secret check result
 */
export async function writeSecretHealthToFirestore(tenantId, result) {
    const db = getFirestore();
    const secretsRef = db.doc(`tenants/${tenantId}/config/secrets`);
    const healthData = {
        CLAY: result.secrets.CLAY,
        APOLLO: result.secrets.APOLLO,
        CLEARBIT: result.secrets.CLEARBIT,
        CRUNCHBASE: result.secrets.CRUNCHBASE,
        allConfigured: result.allConfigured,
        checkedAt: Timestamp.now(),
    };
    await secretsRef.set(healthData, { merge: true });
    console.log(`[TENANT-SECRETS] Health written to Firestore: tenants/${tenantId}/config/secrets`);
}
/**
 * Get tenant secret name
 *
 * @param tenantId - Tenant ID
 * @param provider - Provider (CLAY, APOLLO, etc.)
 * @returns Full secret name
 */
export function getTenantSecretName(tenantId, provider) {
    return `TENANT_${tenantId}_${provider}_API_KEY`;
}
