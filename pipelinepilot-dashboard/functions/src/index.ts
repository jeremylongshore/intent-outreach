import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import corsLib from 'cors';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

initializeApp();
const db = getFirestore();
const cors = corsLib({ origin: [/pipelinepilot-prod\.web\.app$/, /localhost:\d+/], credentials: true });
const secrets = new SecretManagerServiceClient();
const PROJECT = process.env.GCLOUD_PROJECT || 'pipelinepilot-prod';
const REGION = 'us-central1';

const ALLOWED = new Set([
  'CLAY_API_KEY','APOLLO_API_KEY','CLEARBIT_API_KEY','CRUNCHBASE_API_KEY',
  'SALESNAV_COOKIE','SALESNAV_TOKEN','ZOOMINFO_API_KEY'
]);

export const api = onRequest({ region: REGION }, async (req, res) => {
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
        await db.collection('campaigns').doc(id).set({ status:'RUNNING', startedAt: FieldValue.serverTimestamp() }, { merge:true });
        // enqueue processing (function below will pick it up)
        await db.collection('queues').doc(id).set({ campaignId:id, createdAt: FieldValue.serverTimestamp() });
        return res.json({ ok:true });
      }

      return res.status(404).json({ ok:false, error:'not_found' });
    } catch (e:any) {
      console.error(e);
      return res.status(500).json({ ok:false, error:'server_error' });
    }
  });
});

// Queue processor: stub wires to Agent Engine when available
export const runQueuedCampaign = onDocumentCreated({ region: REGION, document: 'queues/{id}' }, async (event) => {
  const id = event.params.id;
  const campRef = db.collection('campaigns').doc(id);
  const campSnap = await campRef.get();
  if (!campSnap.exists) return;
  const camp = campSnap.data() as any;

  try {
    // TODO: Replace stub with Agent Engine call sequence.
    // 1) Research → write to campaigns/{id}/leads
    // 2) Enrich → write to campaigns/{id}/enriched_leads
    // 3) Outreach → write to campaigns/{id}/messages
    // For now, simulate results so the UI is fully testable.

    const leads = camp.domains?.slice(0, 3)?.map((d: string, i: number) => ({ domain: d, contact: `user${i}@${d}`, score: 0.7 + i*0.05 })) || [];
    const batch = db.batch();
    for (const l of leads) {
      const ref = campRef.collection('leads').doc();
      batch.set(ref, { ...l, createdAt: FieldValue.serverTimestamp() });
    }
    await batch.commit();

    // Enriched
    const eBatch = db.batch();
    for (const l of leads) {
      const ref = campRef.collection('enriched_leads').doc();
      eBatch.set(ref, { ...l, employees: 200, tech: ['GCP','Firebase'], createdAt: FieldValue.serverTimestamp() });
    }
    await eBatch.commit();

    // Messages
    const mBatch = db.batch();
    for (const l of leads) {
      const ref = campRef.collection('messages').doc();
      mBatch.set(ref, { to: l.contact, subject: `Quick idea for ${l.domain}`, body: `Hi, noticed ${l.domain} uses GCP. We can enrich SDR data and draft outreach in minutes.`, createdAt: FieldValue.serverTimestamp() });
    }
    await mBatch.commit();

    await campRef.set({ status:'DONE', finishedAt: FieldValue.serverTimestamp() }, { merge:true });
  } catch (e) {
    console.error(e);
    await campRef.set({ status:'ERROR' }, { merge:true });
  }
});
