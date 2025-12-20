/**
 * Tenant Authentication Middleware for PipelinePilot
 *
 * Enforces strict tenant isolation by requiring tenant_id on all requests.
 * Extracts tenant_id from (in order of precedence):
 * 1. x-tenant-id header
 * 2. req.body.tenant_id or req.body.tenantId
 * 3. req.auth.token.tenant_id (for authenticated requests)
 *
 * Rejects requests without tenant_id with 400 Bad Request.
 */
import { getFirestore } from "firebase-admin/firestore";
/**
 * Tenant authentication middleware
 *
 * Extracts and validates tenant_id, then attaches it to req.tenantId
 *
 * @param req - HTTP request
 * @param res - HTTP response
 * @param next - Next function to call if validation succeeds
 */
export async function requireTenant(req, res, next) {
    console.log("[TENANT-AUTH] Starting tenant validation");
    // Extract tenant_id from multiple sources (in order of precedence)
    const headerTenant = req.header("x-tenant-id");
    const bodyTenant = (req.body && req.body.tenant_id) || (req.body && req.body.tenantId);
    const tokenTenant = req.auth?.token?.tenant_id;
    const tenantId = headerTenant || bodyTenant || tokenTenant;
    console.log("[TENANT-AUTH] Tenant extraction:", {
        headerTenant,
        bodyTenant,
        tokenTenant,
        resolved: tenantId,
    });
    // Reject if no tenant_id found
    if (!tenantId) {
        console.error("[TENANT-AUTH] No tenant_id found in request");
        res.status(400).json({
            ok: false,
            error: "TENANT_ID_REQUIRED",
            message: "tenant_id must be provided via x-tenant-id header, request body, or auth token",
        });
        return;
    }
    // Verify tenant exists in Firestore
    const db = getFirestore();
    const tenantRef = db.collection("tenants").doc(tenantId);
    try {
        const tenantDoc = await tenantRef.get();
        if (!tenantDoc.exists) {
            console.error(`[TENANT-AUTH] Tenant not found: ${tenantId}`);
            res.status(404).json({
                ok: false,
                error: "TENANT_NOT_FOUND",
                message: `Tenant '${tenantId}' does not exist`,
                tenantId,
            });
            return;
        }
        // Check tenant status
        const tenantData = tenantDoc.data();
        if (tenantData?.status !== "active") {
            console.warn(`[TENANT-AUTH] Tenant is not active: ${tenantId}, status: ${tenantData?.status}`);
            res.status(403).json({
                ok: false,
                error: "TENANT_INACTIVE",
                message: `Tenant '${tenantId}' is not active (status: ${tenantData?.status})`,
                tenantId,
                status: tenantData?.status,
            });
            return;
        }
        console.log(`[TENANT-AUTH] Tenant validated: ${tenantId}`);
        // Attach tenant_id to request object for downstream use
        req.tenantId = tenantId;
        // Call next handler
        await next();
    }
    catch (error) {
        console.error("[TENANT-AUTH] Error validating tenant:", error);
        res.status(500).json({
            ok: false,
            error: "TENANT_VALIDATION_FAILED",
            message: error.message,
        });
    }
}
/**
 * Utility function to verify tenant has active subscription
 *
 * @param tenantId - Tenant ID to check
 * @returns true if tenant has active paid subscription
 */
export async function isTenantPaid(tenantId) {
    const db = getFirestore();
    const tenantRef = db.collection("tenants").doc(tenantId);
    const tenantDoc = await tenantRef.get();
    if (!tenantDoc.exists) {
        return false;
    }
    const tenantData = tenantDoc.data();
    return (tenantData?.status === "active" &&
        tenantData?.tier === "paid" &&
        tenantData?.stripe_subscription_status === "active");
}
