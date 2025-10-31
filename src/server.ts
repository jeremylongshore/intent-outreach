import express from "express";
import { json } from "express";
import { tenantsRouter } from "./tenants.js";
import { usageRouter } from "./usage.js";
import { billingRouter } from "./billing.js";
import { providersRouter } from "./providers.js";
import { exportsRouter } from "./exports.js";

const app = express();
app.use(json());

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// Root endpoint
app.get("/", (_req, res) => {
  res.json({
    name: "PipelinePilot",
    version: "0.2.0",
    vertexOnly: true,
    storage: ["firestore", "vertex-ai-storage"],
    providers: ["clay", "apollo", "clearbit", "hubspot", "hunter"],
    endpoints: [
      "/health",
      "/tenants",
      "/usage",
      "/billing",
      "/providers",
      "/exports"
    ],
    documentation: "https://github.com/YOUR_ORG/pipelinepilot"
  });
});

// Mount routers
app.use("/tenants", tenantsRouter);
app.use("/usage", usageRouter);
app.use("/billing", billingRouter);
app.use("/providers", providersRouter);
app.use("/exports", exportsRouter);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Error:", err);
  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
    path: req.path,
    timestamp: new Date().toISOString()
  });
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`🚀 PipelinePilot listening on :${port}`);
  console.log(`📊 Vertex-native SDR orchestrator`);
  console.log(`🏢 Multi-tenant leasing platform`);
});
