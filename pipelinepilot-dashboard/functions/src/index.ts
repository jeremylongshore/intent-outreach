import { onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2/options";
import { defineSecret } from "firebase-functions/params";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { GoogleAuth } from "google-auth-library";

setGlobalOptions({ region: "us-central1", maxInstances: 10, memory: "512MiB" });
initializeApp({ credential: applicationDefault() });

const ORCHESTRATOR_DEV_ID = defineSecret("ORCHESTRATOR_DEV_ID");
const REGION = "us-central1"; // Orchestrator is still in us-central1

export const startCampaign = onRequest({ secrets: [ORCHESTRATOR_DEV_ID] }, async (req, res) => {
  try {
    const { campaignId = "dev", icp = "", domains = [], email = "" } = (req.body || {});
    const ENGINE_ID = ORCHESTRATOR_DEV_ID.value();
    if (!ENGINE_ID) {
      res.status(500).json({ error: "Missing ORCHESTRATOR_DEV_ID" });
      return;
    }

    const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
    const client = await auth.getClient();
    const { token } = await client.getAccessToken();

    const url = `https://${REGION}-aiplatform.googleapis.com/v1/${ENGINE_ID}:query`;
    const payload = { class_method: "query", input: { message: `Run\nICP:${icp}\nDomains:${domains.join(",")}\nPrimary:${email}`, user_id: "dashboard" } };

    const r = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const out = await r.json();

    const db = getFirestore();
    await db.collection("campaigns").doc(String(campaignId)).collection("logs").add({ ts: Date.now(), out });
    res.json({ ok: true, engine: ENGINE_ID, result: out });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});
