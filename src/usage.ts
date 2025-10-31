import express from "express";
import { getFirestore } from "./utils/firestore.js";
import { z } from "zod";

export const usageRouter = express.Router();

// Validation schema for usage events
const UsageEventSchema = z.object({
  tenantId: z.string().regex(/^t_/),
  category: z.enum(["provider_call", "agent_task", "export"]),
  provider: z.enum(["clay", "apollo", "clearbit", "hubspot", "hunter"]).nullable().optional(),
  agent: z.string().optional(),
  units: z.number().min(0),
  metadata: z.record(z.any()).optional()
});

// POST /usage -> record usage events (per agent action / API call)
usageRouter.post("/", async (req, res) => {
  try {
    const data = UsageEventSchema.parse(req.body);
    const db = getFirestore();

    // Generate event ID
    const eventId = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const usageEvent = {
      eventId,
      tenantId: data.tenantId,
      ts: new Date().toISOString(),
      category: data.category,
      provider: data.provider || null,
      agent: data.agent || null,
      units: data.units,
      metadata: data.metadata || {}
    };

    // Write to Firestore: usage/{tenantId}/events/{eventId}
    await db.collection("usage").doc(data.tenantId)
      .collection("events").doc(eventId).set(usageEvent);

    res.status(202).json({
      accepted: true,
      eventId,
      tenantId: data.tenantId
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation error", details: error.errors });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// GET /usage/:tenantId -> get usage summary for tenant
usageRouter.get("/:tenantId", async (req, res) => {
  try {
    const db = getFirestore();
    const { startDate, endDate } = req.query;

    let query = db.collection("usage").doc(req.params.tenantId)
      .collection("events").orderBy("ts", "desc");

    if (startDate) {
      query = query.where("ts", ">=", startDate);
    }
    if (endDate) {
      query = query.where("ts", "<=", endDate);
    }

    const snapshot = await query.limit(1000).get();
    const events = snapshot.docs.map(doc => doc.data());

    // Calculate aggregates
    const summary = {
      tenantId: req.params.tenantId,
      totalEvents: events.length,
      byCategory: {} as Record<string, number>,
      byProvider: {} as Record<string, number>,
      totalUnits: 0
    };

    events.forEach(event => {
      summary.totalUnits += event.units || 0;
      summary.byCategory[event.category] = (summary.byCategory[event.category] || 0) + 1;
      if (event.provider) {
        summary.byProvider[event.provider] = (summary.byProvider[event.provider] || 0) + 1;
      }
    });

    res.json(summary);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /usage/:tenantId/meeting -> record qualified meeting (for commission)
usageRouter.post("/:tenantId/meeting", async (req, res) => {
  try {
    const { meetingId, qualified, attendees, notes } = req.body;
    const db = getFirestore();

    const eventId = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const usageEvent = {
      eventId,
      tenantId: req.params.tenantId,
      ts: new Date().toISOString(),
      category: "agent_task",
      agent: "outreach_assist",
      units: 1,
      metadata: {
        meetingId,
        qualified: qualified || false,
        attendees: attendees || [],
        notes: notes || ""
      }
    };

    await db.collection("usage").doc(req.params.tenantId)
      .collection("events").doc(eventId).set(usageEvent);

    res.status(202).json({ accepted: true, eventId, meetingId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /usage/:tenantId/sourced-mrr -> record sourced MRR (for commission)
usageRouter.post("/:tenantId/sourced-mrr", async (req, res) => {
  try {
    const { dealId, dealAmountUSD, stage, closeDate } = req.body;
    const db = getFirestore();

    const eventId = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const usageEvent = {
      eventId,
      tenantId: req.params.tenantId,
      ts: new Date().toISOString(),
      category: "agent_task",
      agent: "outreach_assist",
      units: 1,
      metadata: {
        dealId,
        dealAmountUSD,
        stage,
        closeDate: closeDate || new Date().toISOString()
      }
    };

    await db.collection("usage").doc(req.params.tenantId)
      .collection("events").doc(eventId).set(usageEvent);

    res.status(202).json({ accepted: true, eventId, dealId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
