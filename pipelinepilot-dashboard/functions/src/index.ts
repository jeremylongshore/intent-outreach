import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import corsLib from 'cors';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { GoogleAuth } from 'google-auth-library';
import fetch from 'node-fetch';

admin.initializeApp();
const db = admin.firestore();
const cors = corsLib({ origin: [/pipelinepilot-prod\.web\.app$/, /localhost:\d+/], credentials: true });
const secrets = new SecretManagerServiceClient();
const PROJECT = process.env.GCLOUD_PROJECT || 'pipelinepilot-prod';
const REGION = 'us-central1';
const ORCHESTRATOR_ID = functions.config().agents?.orchestrator_id || '';

const ALLOWED = new Set([
  'CLAY_API_KEY','APOLLO_API_KEY','CLEARBIT_API_KEY','CRUNCHBASE_API_KEY',
  'SALESNAV_COOKIE','SALESNAV_TOKEN','ZOOMINFO_API_KEY'
]);

export const api = functions.https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method === 'POST' && req.path === '/keys/set') {
        const { name, value } = req.body || {};
        if (!ALLOWED.has(name)) return res.status(400).json({ ok:false, error:'invalid_name' });
        if (typeof value !== 'string' || !value.length) return res.status(400).json({ ok:false, error:'empty' });
        const parent = `projects/${PROJECT}/secrets/${name}`;
        // ensure secret exists
        try { await secrets.getSecret({ name: parent }); }
        catch { await secrets.createSecret({ parent: `projects/${PROJECT}`, secretId: name, secret: { replication: { automatic: {} } } }); }
        // add version
        await secrets.addSecretVersion({ parent, payload: { data: Buffer.from(value, 'utf8') } });
        return res.json({ ok:true });
      }

      if (req.method === 'GET' && req.path === '/keys/test') {
        const name = String(req.query.name || '');
        if (!ALLOWED.has(name)) return res.status(400).json({ ok:false, error:'invalid_name' });
        const version = `projects/${PROJECT}/secrets/${name}/versions/latest`;
        try {
          const [acc] = await secrets.accessSecretVersion({ name: version });
          const buf = acc.payload?.data; const has = !!buf && buf.length > 0;
          return res.json({ ok: has });
        } catch { return res.json({ ok:false }); }
      }

      if (req.method === 'POST' && req.path === '/campaigns/start') {
        const { id } = req.body || {};
        if (!id) return res.status(400).json({ ok:false, error:'missing_id' });
        await db.collection('campaigns').doc(id).set({ status:'RUNNING', startedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge:true });
        // enqueue processing (function below will pick it up)
        await db.collection('queues').doc(id).set({ campaignId:id, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        return res.json({ ok:true });
      }

      return res.status(404).json({ ok:false, error:'not_found' });
    } catch (e:any) {
      console.error(e);
      return res.status(500).json({ ok:false, error:'server_error' });
    }
  });
});

// Queue processor: Call orchestrator agent in Vertex AI Agent Engine
export const runQueuedCampaign = functions.firestore.document('queues/{id}').onCreate(async (snapshot, context) => {
  const id = context.params.id;
  const campRef = db.collection('campaigns').doc(id);
  const campSnap = await campRef.get();
  if (!campSnap.exists) return;
  const camp = campSnap.data() as any;

  try {
    if (!ORCHESTRATOR_ID) {
      throw new Error('ORCHESTRATOR_ID not configured. Run: firebase functions:config:set agents.orchestrator_id="..."');
    }

    // Call orchestrator agent
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    const url = `https://${REGION}-aiplatform.googleapis.com/v1/${ORCHESTRATOR_ID}:query`;
    const payload = {
      class_method: 'query',
      input: {
        user_id: 'dashboard',
        message: `Run campaign.\nICP: ${camp.icp || ''}\nDomains: ${camp.domains?.join(',') || ''}\nPrimary Email: ${camp.email || ''}`
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Agent Engine query failed: ${response.statusText}`);
    }

    const result = await response.json() as any;

    // Parse results and write to Firestore
    const leads = result.leads || [];
    const contacts = result.contacts || [];
    const outreach = result.outreach || {};

    // Write leads
    const leadsBatch = db.batch();
    for (const lead of leads) {
      const ref = campRef.collection('leads').doc();
      leadsBatch.set(ref, { ...lead, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    }
    await leadsBatch.commit();

    // Write contacts
    const contactsBatch = db.batch();
    for (const contact of contacts) {
      const ref = campRef.collection('enriched_leads').doc();
      contactsBatch.set(ref, { ...contact, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    }
    await contactsBatch.commit();

    // Write outreach message
    if (outreach.subject && outreach.body) {
      const messageRef = campRef.collection('messages').doc();
      await messageRef.set({
        subject: outreach.subject,
        body: outreach.body,
        next_steps: outreach.next_steps || [],
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    await campRef.set({
      status: 'DONE',
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
      agentResult: result
    }, { merge: true });

  } catch (e) {
    console.error('Campaign execution error:', e);
    await campRef.set({
      status: 'ERROR',
      error: e instanceof Error ? e.message : 'Unknown error'
    }, { merge: true });
  }
});
