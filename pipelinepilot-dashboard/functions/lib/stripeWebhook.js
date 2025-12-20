/**
 * Stripe Webhook Handler for PipelinePilot Tenant Management
 *
 * Handles Stripe subscription events and provisions tenant workspaces:
 * - customer.subscription.created → Create tenant + Secret Manager stubs
 * - customer.subscription.deleted → Mark tenant as canceled
 *
 * Security: Validates Stripe signature using webhook secret
 */
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import Stripe from "stripe";
// Secrets
const STRIPE_API_KEY = defineSecret("STRIPE_API_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");
// Constants
const PROJECT_ID = "pipelinepilot-prod";
const PROJECT_NUMBER = "365258353703";
const REASONING_ENGINE_SA = `service-${PROJECT_NUMBER}@gcp-sa-aiplatform-re.iam.gserviceaccount.com`;
// API Services to provision for each tenant
const API_SERVICES = ["CLAY", "APOLLO", "CLEARBIT", "CRUNCHBASE"];
/**
 * Initialize Secret Manager client
 */
const secretManager = new SecretManagerServiceClient();
/**
 * Stripe Webhook Endpoint
 *
 * Validates signature and routes events to appropriate handlers
 */
export const handleStripeWebhook = onRequest({ secrets: [STRIPE_API_KEY, STRIPE_WEBHOOK_SECRET] }, async (req, res) => {
    try {
        console.log("[STRIPE-WEBHOOK] Request received");
        // Only accept POST requests
        if (req.method !== "POST") {
            console.warn("[STRIPE-WEBHOOK] Invalid method:", req.method);
            res.status(405).json({ error: "Method not allowed" });
            return;
        }
        // Verify Stripe signature
        const signature = req.headers["stripe-signature"];
        if (!signature || typeof signature !== "string") {
            console.error("[STRIPE-WEBHOOK] Missing stripe-signature header");
            res.status(400).json({ error: "Missing stripe-signature header" });
            return;
        }
        // Get raw body for signature validation
        const rawBody = req.rawBody || JSON.stringify(req.body);
        // Initialize Stripe client
        const stripe = new Stripe(STRIPE_API_KEY.value(), {
            apiVersion: "2023-10-16",
        });
        // Construct and validate event
        let event;
        try {
            event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET.value());
            console.log("[STRIPE-WEBHOOK] Signature validated, event type:", event.type);
        }
        catch (err) {
            console.error("[STRIPE-WEBHOOK] Signature validation failed:", err);
            res.status(400).json({ error: "Invalid signature" });
            return;
        }
        // Route event to handler
        switch (event.type) {
            case "customer.subscription.created":
                await handleSubscriptionCreated(event.data.object);
                break;
            case "customer.subscription.updated":
                await handleSubscriptionUpdated(event.data.object);
                break;
            case "customer.subscription.deleted":
                await handleSubscriptionDeleted(event.data.object);
                break;
            default:
                console.log("[STRIPE-WEBHOOK] Unhandled event type:", event.type);
        }
        // Acknowledge receipt
        res.status(200).json({ received: true });
    }
    catch (error) {
        console.error("[STRIPE-WEBHOOK] Error processing webhook:", error);
        res.status(500).json({
            error: error.message,
            stack: error.stack,
        });
    }
});
/**
 * Handle customer.subscription.created event
 *
 * Creates:
 * 1. Firestore /tenants/{tenant_id} document
 * 2. Secret Manager stubs for all API keys
 * 3. IAM bindings for Reasoning Engine SA
 */
async function handleSubscriptionCreated(subscription) {
    console.log("[SUBSCRIPTION-CREATED] Processing subscription:", subscription.id);
    const customerId = subscription.customer;
    const subscriptionId = subscription.id;
    // Generate tenant_id from Stripe customer ID
    // Format: tenant_{last_8_chars_of_customer_id}
    const tenantId = `tenant_${customerId.substring(customerId.length - 8)}`;
    console.log("[SUBSCRIPTION-CREATED] Tenant ID:", tenantId);
    console.log("[SUBSCRIPTION-CREATED] Customer ID:", customerId);
    console.log("[SUBSCRIPTION-CREATED] Subscription ID:", subscriptionId);
    // Extract plan details from subscription
    const priceId = subscription.items.data[0]?.price.id || "unknown";
    const plan = mapPriceToPlan(priceId);
    const tier = subscription.items.data[0]?.price.unit_amount === 0 ? "free" : "paid";
    console.log("[SUBSCRIPTION-CREATED] Plan:", plan);
    console.log("[SUBSCRIPTION-CREATED] Tier:", tier);
    // Step 1: Create Firestore tenant document
    const db = getFirestore();
    const tenantRef = db.collection("tenants").doc(tenantId);
    const tenantData = {
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        stripe_subscription_status: subscription.status,
        plan,
        tier,
        status: "active",
        created_at: Timestamp.now(),
        updated_at: Timestamp.now(),
        subscription_start: Timestamp.fromMillis(subscription.current_period_start * 1000),
        api_keys: {
            clay: false,
            apollo: false,
            clearbit: false,
            crunchbase: false,
        },
    };
    await tenantRef.set(tenantData);
    console.log("[SUBSCRIPTION-CREATED] Firestore tenant created:", tenantId);
    // Step 2: Create Secret Manager stubs for API keys
    console.log("[SUBSCRIPTION-CREATED] Creating Secret Manager stubs...");
    for (const service of API_SERVICES) {
        const secretName = `${tenantId}_${service}_API_KEY`;
        try {
            await createSecretStub(secretName, tenantId);
            // Update Firestore to reflect secret creation
            const serviceKey = service.toLowerCase();
            await tenantRef.update({
                [`api_keys.${serviceKey}`]: true,
                updated_at: Timestamp.now(),
            });
            console.log(`[SUBSCRIPTION-CREATED] Secret created: ${secretName}`);
        }
        catch (error) {
            console.error(`[SUBSCRIPTION-CREATED] Failed to create secret ${secretName}:`, error);
            // Continue with other secrets even if one fails
        }
    }
    console.log("[SUBSCRIPTION-CREATED] Tenant provisioning complete:", tenantId);
    // Step 3: Log to audit collection
    await db.collection("tenant_audit").add({
        tenant_id: tenantId,
        action: "created",
        timestamp: Timestamp.now(),
        details: {
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            plan,
            tier,
        },
        source: "stripe_webhook",
    });
}
/**
 * Handle customer.subscription.updated event
 *
 * Updates tenant status and plan details
 */
async function handleSubscriptionUpdated(subscription) {
    console.log("[SUBSCRIPTION-UPDATED] Processing subscription:", subscription.id);
    const customerId = subscription.customer;
    const tenantId = `tenant_${customerId.substring(customerId.length - 8)}`;
    const db = getFirestore();
    const tenantRef = db.collection("tenants").doc(tenantId);
    // Check if tenant exists
    const tenantDoc = await tenantRef.get();
    if (!tenantDoc.exists) {
        console.warn("[SUBSCRIPTION-UPDATED] Tenant not found:", tenantId);
        return;
    }
    // Update subscription status
    const priceId = subscription.items.data[0]?.price.id || "unknown";
    const plan = mapPriceToPlan(priceId);
    await tenantRef.update({
        stripe_subscription_status: subscription.status,
        plan,
        status: subscription.status === "active" ? "active" : "inactive",
        updated_at: Timestamp.now(),
    });
    console.log("[SUBSCRIPTION-UPDATED] Tenant updated:", tenantId);
    // Log to audit
    await db.collection("tenant_audit").add({
        tenant_id: tenantId,
        action: "updated",
        timestamp: Timestamp.now(),
        details: {
            stripe_subscription_status: subscription.status,
            plan,
        },
        source: "stripe_webhook",
    });
}
/**
 * Handle customer.subscription.deleted event
 *
 * Marks tenant as canceled (does NOT delete data)
 */
async function handleSubscriptionDeleted(subscription) {
    console.log("[SUBSCRIPTION-DELETED] Processing subscription:", subscription.id);
    const customerId = subscription.customer;
    const tenantId = `tenant_${customerId.substring(customerId.length - 8)}`;
    const db = getFirestore();
    const tenantRef = db.collection("tenants").doc(tenantId);
    // Check if tenant exists
    const tenantDoc = await tenantRef.get();
    if (!tenantDoc.exists) {
        console.warn("[SUBSCRIPTION-DELETED] Tenant not found:", tenantId);
        return;
    }
    // Mark as canceled
    await tenantRef.update({
        stripe_subscription_status: "canceled",
        status: "canceled",
        subscription_end: Timestamp.now(),
        updated_at: Timestamp.now(),
    });
    console.log("[SUBSCRIPTION-DELETED] Tenant marked as canceled:", tenantId);
    // Log to audit
    await db.collection("tenant_audit").add({
        tenant_id: tenantId,
        action: "canceled",
        timestamp: Timestamp.now(),
        details: {
            stripe_subscription_id: subscription.id,
        },
        source: "stripe_webhook",
    });
}
/**
 * Create a Secret Manager secret with placeholder value
 *
 * @param secretName - Name of the secret (e.g., "tenant_abc123_CLAY_API_KEY")
 * @param tenantId - Tenant ID for logging
 */
async function createSecretStub(secretName, tenantId) {
    const parent = `projects/${PROJECT_ID}`;
    // Step 1: Create the secret
    try {
        await secretManager.createSecret({
            parent,
            secretId: secretName,
            secret: {
                replication: {
                    automatic: {},
                },
            },
        });
        console.log(`[SECRET-MANAGER] Secret created: ${secretName}`);
    }
    catch (error) {
        // If secret already exists, that's okay
        if (error.code === 6) {
            console.log(`[SECRET-MANAGER] Secret already exists: ${secretName}`);
        }
        else {
            throw error;
        }
    }
    // Step 2: Add placeholder version
    const placeholderValue = "PLACEHOLDER_AWAITING_CUSTOMER_INPUT";
    await secretManager.addSecretVersion({
        parent: `${parent}/secrets/${secretName}`,
        payload: {
            data: Buffer.from(placeholderValue, "utf8"),
        },
    });
    console.log(`[SECRET-MANAGER] Placeholder version added: ${secretName}`);
    // Step 3: Grant access to Reasoning Engine service account
    await secretManager.setIamPolicy({
        resource: `${parent}/secrets/${secretName}`,
        policy: {
            bindings: [
                {
                    role: "roles/secretmanager.secretAccessor",
                    members: [`serviceAccount:${REASONING_ENGINE_SA}`],
                },
            ],
        },
    });
    console.log(`[SECRET-MANAGER] IAM binding created for: ${secretName}`);
}
/**
 * Map Stripe price ID to PipelinePilot plan name
 *
 * @param priceId - Stripe price ID
 * @returns Plan name
 */
function mapPriceToPlan(priceId) {
    // TODO: Update these mappings with actual Stripe price IDs
    if (priceId.includes("starter") || priceId.includes("basic")) {
        return "starter";
    }
    if (priceId.includes("enterprise")) {
        return "enterprise";
    }
    return "pro"; // Default to pro
}
