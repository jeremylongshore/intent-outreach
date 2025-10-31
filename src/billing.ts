import express from "express";
import { getFirestore } from "./utils/firestore.js";
import Stripe from "stripe";

export const billingRouter = express.Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-10-28.acacia"
});

// POST /billing/run-monthly -> compute invoices (flat fee + seats + commission)
billingRouter.post("/run-monthly", async (req, res) => {
  try {
    const { period } = req.body; // e.g., "2025-01"
    const billingPeriod = period || new Date().toISOString().slice(0, 7);
    const db = getFirestore();

    // Get all active tenants
    const tenantsSnapshot = await db.collection("tenants")
      .where("status", "==", "active").get();

    const results = [];

    for (const tenantDoc of tenantsSnapshot.docs) {
      const tenant = tenantDoc.data();
      const tenantId = tenantDoc.id;

      // Count active seats
      const seatsSnapshot = await db.collection("tenants").doc(tenantId)
        .collection("seats").where("status", "==", "active").get();
      const seatCount = seatsSnapshot.size;

      // Calculate commission from usage events
      const usageSnapshot = await db.collection("usage").doc(tenantId)
        .collection("events")
        .where("ts", ">=", `${billingPeriod}-01`)
        .where("ts", "<", getNextMonth(billingPeriod))
        .get();

      let commissionAmount = 0;

      if (tenant.commissionModel === "meetings") {
        // Count qualified meetings
        const qualifiedMeetings = usageSnapshot.docs.filter(doc =>
          doc.data().metadata?.qualified === true
        ).length;
        commissionAmount = qualifiedMeetings * (tenant.commissionRateBps / 100);
      } else if (tenant.commissionModel === "sourced_mrr") {
        // Sum sourced MRR
        const sourcedMRR = usageSnapshot.docs.reduce((sum, doc) => {
          const data = doc.data();
          if (data.metadata?.stage === "closed_won") {
            return sum + (data.metadata.dealAmountUSD || 0);
          }
          return sum;
        }, 0);
        // 6 months of commission
        commissionAmount = (sourcedMRR * 6 * tenant.commissionRateBps) / 10000;
      }

      // Build line items
      const lineItems = [
        {
          type: "flat",
          description: `${tenant.plan} plan - ${billingPeriod}`,
          amountUSD: tenant.flatMonthlyUSD
        },
        {
          type: "seat",
          description: `${seatCount} seats @ $${tenant.seatUSD}/seat`,
          amountUSD: seatCount * tenant.seatUSD
        },
        {
          type: "commission",
          description: `${tenant.commissionModel} commission @ ${tenant.commissionRateBps/100}%`,
          amountUSD: commissionAmount
        }
      ];

      const totalUSD = lineItems.reduce((sum, item) => sum + item.amountUSD, 0);

      // Create invoice in Firestore
      const invoice = {
        tenantId,
        period: billingPeriod,
        lineItems,
        totalUSD,
        createdAt: new Date().toISOString(),
        status: "draft",
        stripeInvoiceId: null
      };

      const invoiceRef = await db.collection("billing").doc(tenantId)
        .collection("invoices").add(invoice);

      // Create Stripe invoice (if customer exists)
      if (tenant.stripeCustomerId) {
        try {
          const stripeInvoice = await stripe.invoices.create({
            customer: tenant.stripeCustomerId,
            auto_advance: false, // Manual review
            metadata: {
              tenantId,
              period: billingPeriod
            }
          });

          // Add line items
          for (const item of lineItems) {
            await stripe.invoiceItems.create({
              customer: tenant.stripeCustomerId,
              invoice: stripeInvoice.id,
              amount: Math.round(item.amountUSD * 100), // Convert to cents
              currency: "usd",
              description: item.description
            });
          }

          // Finalize invoice
          await stripe.invoices.finalizeInvoice(stripeInvoice.id);

          // Update Firestore with Stripe invoice ID
          await invoiceRef.update({
            stripeInvoiceId: stripeInvoice.id,
            status: "finalized"
          });

          results.push({
            tenantId,
            status: "created",
            stripeInvoiceId: stripeInvoice.id,
            totalUSD
          });
        } catch (stripeError: any) {
          console.error(`Stripe error for tenant ${tenantId}:`, stripeError);
          results.push({
            tenantId,
            status: "error",
            error: stripeError.message
          });
        }
      } else {
        results.push({
          tenantId,
          status: "no_stripe_customer",
          totalUSD
        });
      }
    }

    res.json({
      status: "completed",
      cycle: billingPeriod,
      processed: results.length,
      results
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /billing/stripe-webhook -> handle Stripe events
billingRouter.post("/stripe-webhook", async (req, res) => {
  try {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !webhookSecret) {
      return res.status(400).json({ error: "Missing signature or secret" });
    }

    const event = stripe.webhooks.constructEvent(
      req.body,
      sig as string,
      webhookSecret
    );

    const db = getFirestore();

    // Handle different event types
    switch (event.type) {
      case "invoice.paid":
        const paidInvoice = event.data.object as Stripe.Invoice;
        // Update invoice status in Firestore
        const tenantId = paidInvoice.metadata?.tenantId;
        if (tenantId) {
          const invoicesRef = db.collection("billing").doc(tenantId).collection("invoices");
          const snapshot = await invoicesRef.where("stripeInvoiceId", "==", paidInvoice.id).get();
          for (const doc of snapshot.docs) {
            await doc.ref.update({
              status: "paid",
              paidAt: new Date().toISOString()
            });
          }
        }
        break;

      case "invoice.payment_failed":
        const failedInvoice = event.data.object as Stripe.Invoice;
        const failedTenantId = failedInvoice.metadata?.tenantId;
        if (failedTenantId) {
          const invoicesRef = db.collection("billing").doc(failedTenantId).collection("invoices");
          const snapshot = await invoicesRef.where("stripeInvoiceId", "==", failedInvoice.id).get();
          for (const doc of snapshot.docs) {
            await doc.ref.update({
              status: "payment_failed",
              failedAt: new Date().toISOString()
            });
          }
        }
        break;
    }

    res.json({ received: true });
  } catch (error: any) {
    console.error("Webhook error:", error);
    res.status(400).json({ error: error.message });
  }
});

// GET /billing/:tenantId/invoices -> get invoices for tenant
billingRouter.get("/:tenantId/invoices", async (req, res) => {
  try {
    const db = getFirestore();
    const snapshot = await db.collection("billing").doc(req.params.tenantId)
      .collection("invoices").orderBy("createdAt", "desc").limit(100).get();

    const invoices = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json({ tenantId: req.params.tenantId, invoices });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function to get next month
function getNextMonth(period: string): string {
  const [year, month] = period.split("-").map(Number);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
}
