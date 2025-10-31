import express from "express";
import { getFirestore } from "./utils/firestore.js";
import { getSecret } from "./utils/gsm.js";
import axios from "axios";

export const providersRouter = express.Router();

// POST /providers/:tenant/clay/enrich
providersRouter.post("/:tenant/clay/enrich", async (req, res) => {
  try {
    const { domain, email, companyName } = req.body;
    const db = getFirestore();

    // Get Clay API key (tenant-scoped or default)
    let apiKey = await getTenantProviderKey(db, req.params.tenant, "clay");
    if (!apiKey) {
      apiKey = process.env.CLAY_API_KEY;
    }

    if (!apiKey) {
      return res.status(400).json({ error: "Clay API key not configured" });
    }

    // Call Clay API (example endpoint - adjust based on actual Clay API)
    const response = await axios.post(
      "https://api.clay.com/v1/enrichment",
      { domain, email, companyName },
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );

    // Store result to Firestore
    await db.collection("enrichment").add({
      tenantId: req.params.tenant,
      provider: "clay",
      input: { domain, email, companyName },
      output: response.data,
      createdAt: new Date().toISOString()
    });

    // Record usage
    await recordProviderUsage(db, req.params.tenant, "clay", 1);

    res.json({
      status: "ok",
      provider: "clay",
      data: response.data
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /providers/:tenant/apollo/search
providersRouter.post("/:tenant/apollo/search", async (req, res) => {
  try {
    const { query, personTitles, companyDomain } = req.body;
    const db = getFirestore();

    let apiKey = await getTenantProviderKey(db, req.params.tenant, "apollo");
    if (!apiKey) {
      apiKey = process.env.APOLLO_API_KEY;
    }

    if (!apiKey) {
      return res.status(400).json({ error: "Apollo API key not configured" });
    }

    // Call Apollo API
    const response = await axios.post(
      "https://api.apollo.io/v1/mixed_people/search",
      { q_keywords: query, person_titles: personTitles, organization_domains: [companyDomain] },
      { headers: { "Api-Key": apiKey } }
    );

    await recordProviderUsage(db, req.params.tenant, "apollo", response.data.people?.length || 1);

    res.json({
      status: "ok",
      provider: "apollo",
      data: response.data
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /providers/:tenant/clearbit/enrich
providersRouter.post("/:tenant/clearbit/enrich", async (req, res) => {
  try {
    const { domain, email } = req.body;
    const db = getFirestore();

    let apiKey = await getTenantProviderKey(db, req.params.tenant, "clearbit");
    if (!apiKey) {
      apiKey = process.env.CLEARBIT_API_KEY;
    }

    if (!apiKey) {
      return res.status(400).json({ error: "Clearbit API key not configured" });
    }

    // Call Clearbit API
    const response = await axios.get(
      `https://company.clearbit.com/v2/companies/find?domain=${domain}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );

    await recordProviderUsage(db, req.params.tenant, "clearbit", 1);

    res.json({
      status: "ok",
      provider: "clearbit",
      data: response.data
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /providers/:tenant/hubspot/upsert
providersRouter.post("/:tenant/hubspot/upsert", async (req, res) => {
  try {
    const { contacts } = req.body;
    const db = getFirestore();

    let apiKey = await getTenantProviderKey(db, req.params.tenant, "hubspot");
    if (!apiKey) {
      apiKey = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
    }

    if (!apiKey) {
      return res.status(400).json({ error: "HubSpot API key not configured" });
    }

    // Call HubSpot API to create/update contacts
    const response = await axios.post(
      "https://api.hubapi.com/crm/v3/objects/contacts/batch/create",
      { inputs: contacts },
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );

    await recordProviderUsage(db, req.params.tenant, "hubspot", contacts.length);

    res.json({
      status: "ok",
      provider: "hubspot",
      data: response.data
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /providers/:tenant/hunter/verify
providersRouter.post("/:tenant/hunter/verify", async (req, res) => {
  try {
    const { email } = req.body;
    const db = getFirestore();

    let apiKey = await getTenantProviderKey(db, req.params.tenant, "hunter");
    if (!apiKey) {
      apiKey = process.env.HUNTER_API_KEY;
    }

    if (!apiKey) {
      return res.status(400).json({ error: "Hunter API key not configured" });
    }

    // Call Hunter API
    const response = await axios.get(
      `https://api.hunter.io/v2/email-verifier?email=${email}&api_key=${apiKey}`
    );

    await recordProviderUsage(db, req.params.tenant, "hunter", 1);

    res.json({
      status: "ok",
      provider: "hunter",
      data: response.data
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Helper: Get tenant provider key from GSM
async function getTenantProviderKey(
  db: FirebaseFirestore.Firestore,
  tenantId: string,
  provider: string
): Promise<string | null> {
  try {
    const doc = await db.collection("tenants").doc(tenantId)
      .collection("providerKeys").doc(provider).get();

    if (!doc.exists) {
      return null;
    }

    const gsmSecretRef = doc.data()?.gsmSecretRef;
    if (!gsmSecretRef) {
      return null;
    }

    // Fetch from Google Secret Manager
    return await getSecret(gsmSecretRef);
  } catch (error) {
    console.error(`Error fetching provider key for ${tenantId}/${provider}:`, error);
    return null;
  }
}

// Helper: Record provider usage
async function recordProviderUsage(
  db: FirebaseFirestore.Firestore,
  tenantId: string,
  provider: string,
  units: number
): Promise<void> {
  const eventId = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  await db.collection("usage").doc(tenantId).collection("events").doc(eventId).set({
    eventId,
    tenantId,
    ts: new Date().toISOString(),
    category: "provider_call",
    provider,
    units,
    metadata: {}
  });
}
