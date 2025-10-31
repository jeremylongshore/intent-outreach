import express from "express";
import { getFirestore } from "./utils/firestore.js";
import { z } from "zod";

export const tenantsRouter = express.Router();

// Validation schema for creating a tenant
const CreateTenantSchema = z.object({
  name: z.string().min(1).max(100),
  plan: z.enum(["starter", "growth", "scale"]),
  email: z.string().email(),
  flatMonthlyUSD: z.number().min(0).optional(),
  seatUSD: z.number().min(0).optional(),
  commissionModel: z.enum(["meetings", "sourced_mrr"]).optional(),
  commissionRateBps: z.number().min(0).max(10000).optional(),
  notes: z.string().max(500).optional()
});

// POST /tenants -> create tenant (agency)
tenantsRouter.post("/", async (req, res) => {
  try {
    const data = CreateTenantSchema.parse(req.body);
    const db = getFirestore();

    // Generate tenant ID
    const tenantId = `t_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Default pricing based on plan
    const pricingDefaults = {
      starter: { flatMonthlyUSD: 499, seatUSD: 49, commissionRateBps: 500 },
      growth: { flatMonthlyUSD: 999, seatUSD: 49, commissionRateBps: 700 },
      scale: { flatMonthlyUSD: 1999, seatUSD: 49, commissionRateBps: 1000 }
    };

    const defaults = pricingDefaults[data.plan];

    // Create lease contract
    const leaseContract = {
      tenantId,
      name: data.name,
      email: data.email,
      plan: data.plan,
      flatMonthlyUSD: data.flatMonthlyUSD ?? defaults.flatMonthlyUSD,
      seatUSD: data.seatUSD ?? defaults.seatUSD,
      commissionModel: data.commissionModel ?? "meetings",
      commissionRateBps: data.commissionRateBps ?? defaults.commissionRateBps,
      effectiveFrom: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      status: "active",
      notes: data.notes || ""
    };

    // Write to Firestore
    await db.collection("tenants").doc(tenantId).set(leaseContract);

    res.status(201).json({
      status: "created",
      tenantId,
      leaseContract
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation error", details: error.errors });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// GET /tenants/:id -> get tenant details
tenantsRouter.get("/:id", async (req, res) => {
  try {
    const db = getFirestore();
    const doc = await db.collection("tenants").doc(req.params.id).get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    res.json({ tenantId: req.params.id, ...doc.data() });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH /tenants/:id -> update tenant settings
tenantsRouter.patch("/:id", async (req, res) => {
  try {
    const db = getFirestore();
    const updates = req.body;

    // Remove fields that shouldn't be updated directly
    delete updates.tenantId;
    delete updates.createdAt;

    updates.updatedAt = new Date().toISOString();

    await db.collection("tenants").doc(req.params.id).update(updates);

    res.json({ status: "updated", tenantId: req.params.id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /tenants/:id/seats -> add seats/users
tenantsRouter.post("/:id/seats", async (req, res) => {
  try {
    const { userId, email, role } = req.body;
    const db = getFirestore();

    const seat = {
      userId: userId || `u_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      tenantId: req.params.id,
      email,
      role: role || "member",
      createdAt: new Date().toISOString(),
      status: "active"
    };

    await db.collection("tenants").doc(req.params.id)
      .collection("seats").doc(seat.userId).set(seat);

    res.status(201).json({ status: "created", ...seat });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /tenants/:id/seats -> list seats
tenantsRouter.get("/:id/seats", async (req, res) => {
  try {
    const db = getFirestore();
    const snapshot = await db.collection("tenants").doc(req.params.id)
      .collection("seats").get();

    const seats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    res.json({ tenantId: req.params.id, seats, count: seats.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /tenants/:id/provider-keys -> store GSM refs to provider credentials
tenantsRouter.post("/:id/provider-keys", async (req, res) => {
  try {
    const { provider, gsmSecretRef } = req.body;
    const db = getFirestore();

    if (!["clay", "apollo", "clearbit", "hubspot", "hunter"].includes(provider)) {
      return res.status(400).json({ error: "Invalid provider" });
    }

    const keyRef = {
      provider,
      gsmSecretRef,
      createdAt: new Date().toISOString(),
      status: "active"
    };

    await db.collection("tenants").doc(req.params.id)
      .collection("providerKeys").doc(provider).set(keyRef);

    res.status(201).json({ status: "created", provider, gsmSecretRef });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
