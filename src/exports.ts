import express from "express";
import { getStorage } from "./utils/storage.js";
import { getFirestore } from "./utils/firestore.js";

export const exportsRouter = express.Router();

// GET /exports/:tenant/leads.csv -> stream CSV from Vertex AI Storage signed URL
exportsRouter.get("/:tenant/leads.csv", async (req, res) => {
  try {
    const storage = getStorage();
    const bucket = storage.bucket(process.env.VERTEX_STORAGE_BUCKET || "");
    const fileName = `exports/${req.params.tenant}/leads_${Date.now()}.csv`;
    const file = bucket.file(fileName);

    // Generate signed URL (valid for 1 hour)
    const [signedUrl] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 60 * 60 * 1000 // 1 hour
    });

    res.json({
      status: "ok",
      signedUrl,
      fileName,
      expiresIn: "1 hour"
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /exports/:tenant/generate -> generate export from Firestore data
exportsRouter.post("/:tenant/generate", async (req, res) => {
  try {
    const { format, collection, filters } = req.body;
    const db = getFirestore();
    const storage = getStorage();

    // Query Firestore based on filters
    let query = db.collection(collection || "enrichment");

    if (filters?.startDate) {
      query = query.where("createdAt", ">=", filters.startDate);
    }
    if (filters?.endDate) {
      query = query.where("createdAt", "<=", filters.endDate);
    }

    const snapshot = await query.limit(10000).get();
    const data = snapshot.docs.map(doc => doc.data());

    // Generate export based on format
    let content = "";
    let contentType = "";
    let fileExtension = "";

    if (format === "csv") {
      content = generateCSV(data);
      contentType = "text/csv";
      fileExtension = "csv";
    } else if (format === "json") {
      content = JSON.stringify(data, null, 2);
      contentType = "application/json";
      fileExtension = "json";
    } else {
      return res.status(400).json({ error: "Unsupported format" });
    }

    // Upload to Vertex AI Storage
    const bucket = storage.bucket(process.env.VERTEX_STORAGE_BUCKET || "");
    const fileName = `exports/${req.params.tenant}/${collection}_${Date.now()}.${fileExtension}`;
    const file = bucket.file(fileName);

    await file.save(content, {
      contentType,
      metadata: {
        tenantId: req.params.tenant,
        collection,
        recordCount: data.length.toString(),
        generatedAt: new Date().toISOString()
      }
    });

    // Generate signed URL
    const [signedUrl] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
    });

    // Record export usage
    await db.collection("usage").doc(req.params.tenant).collection("events").add({
      eventId: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      tenantId: req.params.tenant,
      ts: new Date().toISOString(),
      category: "export",
      units: data.length,
      metadata: {
        format,
        collection,
        recordCount: data.length,
        fileName
      }
    });

    res.json({
      status: "ok",
      fileName,
      recordCount: data.length,
      signedUrl,
      expiresIn: "24 hours"
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Helper: Generate CSV from data
function generateCSV(data: any[]): string {
  if (data.length === 0) {
    return "";
  }

  // Get all unique keys (stable order)
  const keys = Array.from(new Set(data.flatMap(obj => Object.keys(obj)))).sort();

  // CSV header
  const header = keys.join(",");

  // CSV rows
  const rows = data.map(obj => {
    return keys.map(key => {
      const value = obj[key];
      if (value === null || value === undefined) {
        return "";
      }
      // Escape quotes and commas
      const stringValue = typeof value === "object" ? JSON.stringify(value) : String(value);
      return `"${stringValue.replace(/"/g, '""')}"`;
    }).join(",");
  });

  return [header, ...rows].join("\n");
}
