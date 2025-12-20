/**
 * Tenant Secret Audit Job
 *
 * Scheduled and on-demand functions to audit and ensure all tenants
 * have their required secrets configured in Secret Manager.
 *
 * Two functions:
 * 1. auditTenantSecretsScheduled - Runs on a schedule (daily)
 * 2. auditTenantSecretsOnDemand - HTTP endpoint for manual triggers
 *
 * Both functions:
 * - List all active tenants from Firestore
 * - Ensure each tenant has required secrets
 * - Write secret health to Firestore
 * - Write audit report to /tenant_audit/
 */
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest } from "firebase-functions/v2/https";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { ensureTenantSecrets, writeSecretHealthToFirestore, } from "../secrets/tenantSecrets.js";
/**
 * Scheduled Tenant Secret Audit
 *
 * Runs daily at 2 AM UTC to ensure all tenants have required secrets.
 * Creates missing secrets, adds IAM bindings, and updates Firestore health.
 */
export const auditTenantSecretsScheduled = onSchedule({
    schedule: "0 2 * * *", // Daily at 2 AM UTC
    timeZone: "UTC",
    memory: "512MiB",
}, async (event) => {
    console.log("[TENANT-SECRET-AUDIT] Starting scheduled audit");
    try {
        const report = await runTenantSecretAudit();
        console.log("[TENANT-SECRET-AUDIT] Scheduled audit complete:", {
            tenantsChecked: report.tenantsChecked,
            healthy: report.tenantsHealthy,
            missing: report.tenantsMissingSecrets,
            placeholders: report.tenantsWithPlaceholders,
            errors: report.tenantsWithErrors,
        });
    }
    catch (error) {
        console.error("[TENANT-SECRET-AUDIT] Scheduled audit failed:", error);
        throw error;
    }
});
/**
 * On-Demand Tenant Secret Audit
 *
 * HTTP endpoint to manually trigger audit of all tenant secrets.
 * Useful for:
 * - Initial setup verification
 * - Post-deployment checks
 * - Debugging secret issues
 */
export const auditTenantSecretsOnDemand = onRequest({
    memory: "512MiB",
}, async (req, res) => {
    console.log("[TENANT-SECRET-AUDIT] Starting on-demand audit");
    try {
        const report = await runTenantSecretAudit();
        console.log("[TENANT-SECRET-AUDIT] On-demand audit complete");
        res.json({
            ok: true,
            message: "Tenant secret audit complete",
            report,
        });
    }
    catch (error) {
        console.error("[TENANT-SECRET-AUDIT] On-demand audit failed:", error);
        res.status(500).json({
            ok: false,
            error: error.message,
            stack: error.stack,
        });
    }
});
/**
 * Run tenant secret audit
 *
 * Core audit logic used by both scheduled and on-demand functions.
 *
 * @returns Audit report with status of all tenants
 */
async function runTenantSecretAudit() {
    const db = getFirestore();
    // Get all active tenants
    const tenantsSnapshot = await db
        .collection("tenants")
        .where("status", "==", "active")
        .get();
    console.log(`[TENANT-SECRET-AUDIT] Found ${tenantsSnapshot.size} active tenants`);
    const report = {
        timestamp: Timestamp.now(),
        tenantsChecked: tenantsSnapshot.size,
        tenantsHealthy: 0,
        tenantsMissingSecrets: 0,
        tenantsWithPlaceholders: 0,
        tenantsWithErrors: 0,
        details: [],
    };
    // Process each tenant
    for (const tenantDoc of tenantsSnapshot.docs) {
        const tenantId = tenantDoc.id;
        console.log(`[TENANT-SECRET-AUDIT] Processing tenant: ${tenantId}`);
        try {
            // Ensure secrets exist with IAM bindings
            const result = await ensureTenantSecrets(tenantId);
            // Write health to Firestore
            await writeSecretHealthToFirestore(tenantId, result);
            // Categorize result
            let status;
            if (result.errors.length > 0) {
                status = "error";
                report.tenantsWithErrors++;
            }
            else if (result.missing.length > 0) {
                status = "missing";
                report.tenantsMissingSecrets++;
            }
            else if (result.placeholders.length > 0) {
                status = "placeholder";
                report.tenantsWithPlaceholders++;
            }
            else {
                status = "healthy";
                report.tenantsHealthy++;
            }
            // Add to report details
            report.details.push({
                tenantId,
                status,
                missing: result.missing,
                placeholders: result.placeholders,
                errors: result.errors,
            });
            console.log(`[TENANT-SECRET-AUDIT] Tenant ${tenantId} status: ${status}`);
        }
        catch (error) {
            console.error(`[TENANT-SECRET-AUDIT] Error processing tenant ${tenantId}:`, error);
            report.tenantsWithErrors++;
            report.details.push({
                tenantId,
                status: "error",
                missing: [],
                placeholders: [],
                errors: [error.message],
            });
        }
    }
    // Write audit report to Firestore
    await db.collection("tenant_audit").add({
        action: "secret_audit",
        timestamp: report.timestamp,
        source: "tenant_secret_audit_job",
        summary: {
            tenantsChecked: report.tenantsChecked,
            tenantsHealthy: report.tenantsHealthy,
            tenantsMissingSecrets: report.tenantsMissingSecrets,
            tenantsWithPlaceholders: report.tenantsWithPlaceholders,
            tenantsWithErrors: report.tenantsWithErrors,
        },
        details: report.details,
    });
    console.log("[TENANT-SECRET-AUDIT] Audit report written to tenant_audit collection");
    return report;
}
/**
 * Audit a single tenant
 *
 * HTTP endpoint to audit and fix secrets for a specific tenant.
 *
 * @param tenantId - Provided via query parameter or body
 */
export const auditSingleTenant = onRequest({
    memory: "512MiB",
}, async (req, res) => {
    const tenantId = req.query.tenantId || req.query.tenant_id || req.body?.tenantId || req.body?.tenant_id;
    if (!tenantId || typeof tenantId !== "string") {
        res.status(400).json({
            ok: false,
            error: "TENANT_ID_REQUIRED",
            message: "tenantId must be provided as query parameter or in body",
        });
        return;
    }
    console.log(`[TENANT-SECRET-AUDIT] Auditing single tenant: ${tenantId}`);
    try {
        // Ensure secrets exist
        const result = await ensureTenantSecrets(tenantId);
        // Write health to Firestore
        await writeSecretHealthToFirestore(tenantId, result);
        // Write audit entry
        const db = getFirestore();
        await db.collection("tenant_audit").add({
            tenant_id: tenantId,
            action: "secret_audit_single",
            timestamp: Timestamp.now(),
            source: "audit_single_tenant_endpoint",
            details: {
                allConfigured: result.allConfigured,
                missing: result.missing,
                placeholders: result.placeholders,
                errors: result.errors,
            },
        });
        console.log(`[TENANT-SECRET-AUDIT] Single tenant audit complete: ${tenantId}`);
        res.json({
            ok: true,
            tenantId,
            result: {
                allConfigured: result.allConfigured,
                secrets: result.secrets,
                missing: result.missing,
                placeholders: result.placeholders,
                errors: result.errors,
            },
        });
    }
    catch (error) {
        console.error(`[TENANT-SECRET-AUDIT] Error auditing tenant ${tenantId}:`, error);
        res.status(500).json({
            ok: false,
            error: error.message,
            stack: error.stack,
        });
    }
});
