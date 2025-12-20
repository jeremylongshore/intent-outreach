/**
 * Phase 5: Create Tenant for User
 *
 * Cloud Function that creates a new tenant workspace when a user signs up.
 *
 * Steps:
 * 1. Validate authenticated user
 * 2. Check if user already has a tenant
 * 3. Create tenant document in /tenants/{tenantId}
 * 4. Create Phase 3 placeholder secrets in Secret Manager
 * 5. Set custom claims on user (tenant_id)
 * 6. Return tenantId
 */

import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'pipelinepilot-prod';
const secretClient = new SecretManagerServiceClient();

/**
 * Create Tenant for User
 *
 * POST /createTenantForUser
 * Headers: Authorization: Bearer {idToken}
 * Body: { uid: string, email: string }
 *
 * Returns: { ok: true, tenantId: string }
 */
export const createTenantForUser = onRequest(async (req, res) => {
  console.log('[CREATE-TENANT] Request received');

  // Only allow POST
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    // 1. Verify Firebase ID token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ ok: false, error: 'Missing or invalid authorization header' });
      return;
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    console.log('[CREATE-TENANT] Authenticated user:', uid);

    // 2. Get request body
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ ok: false, error: 'Missing email in request body' });
      return;
    }

    // 3. Check if user already has a tenant
    const existingClaims = decodedToken.tenant_id;
    if (existingClaims) {
      console.log('[CREATE-TENANT] User already has tenant:', existingClaims);
      res.status(200).json({
        ok: true,
        tenantId: existingClaims,
        message: 'Tenant already exists',
      });
      return;
    }

    // 4. Generate tenant ID (using uid for simplicity)
    const tenantId = `tenant_${uid}`;

    console.log('[CREATE-TENANT] Creating tenant:', tenantId);

    // 5. Create tenant document in Firestore
    const db = getFirestore();
    const tenantDoc = {
      tenant_id: tenantId,
      status: 'active',
      betaTier: 'internal', // Default to internal beta
      stripe_customer_id: '', // Will be set when Stripe connects
      email,
      owner_uid: uid,
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    };

    await db.collection('tenants').doc(tenantId).set(tenantDoc);

    console.log('[CREATE-TENANT] Tenant document created');

    // 6. Create Phase 3 placeholder secrets in Secret Manager
    await createPlaceholderSecrets(tenantId);

    console.log('[CREATE-TENANT] Placeholder secrets created');

    // 7. Create secret health document
    const secretHealthDoc = {
      CLAY: {
        status: 'placeholder',
        lastChecked: Timestamp.now().toDate().toISOString(),
      },
      APOLLO: {
        status: 'placeholder',
        lastChecked: Timestamp.now().toDate().toISOString(),
      },
      CLEARBIT: {
        status: 'placeholder',
        lastChecked: Timestamp.now().toDate().toISOString(),
      },
      CRUNCHBASE: {
        status: 'placeholder',
        lastChecked: Timestamp.now().toDate().toISOString(),
      },
      lastAudit: Timestamp.now(),
    };

    await db
      .collection('tenants')
      .doc(tenantId)
      .collection('config')
      .doc('secrets')
      .set(secretHealthDoc);

    console.log('[CREATE-TENANT] Secret health document created');

    // 8. Set custom claims on user
    await getAuth().setCustomUserClaims(uid, {
      tenant_id: tenantId,
    });

    console.log('[CREATE-TENANT] Custom claims set');

    // 9. Return success
    res.status(200).json({
      ok: true,
      tenantId,
      message: 'Tenant created successfully',
    });
  } catch (error) {
    console.error('[CREATE-TENANT] Error:', error);
    res.status(500).json({
      ok: false,
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
  }
});

/**
 * Create placeholder secrets for a tenant
 *
 * Creates 4 secrets in Secret Manager with placeholder values:
 * - TENANT_{tenantId}_CLAY_API_KEY
 * - TENANT_{tenantId}_APOLLO_API_KEY
 * - TENANT_{tenantId}_CLEARBIT_API_KEY
 * - TENANT_{tenantId}_CRUNCHBASE_API_KEY
 */
async function createPlaceholderSecrets(tenantId: string): Promise<void> {
  const providers = ['CLAY', 'APOLLO', 'CLEARBIT', 'CRUNCHBASE'];
  const placeholderValue = 'PLACEHOLDER_REPLACE_WITH_REAL_KEY';

  for (const provider of providers) {
    const secretName = `TENANT_${tenantId}_${provider}_API_KEY`;

    try {
      // Create secret
      const parent = `projects/${PROJECT_ID}`;
      const [secret] = await secretClient.createSecret({
        parent,
        secretId: secretName,
        secret: {
          replication: {
            automatic: {},
          },
        },
      });

      console.log(`[CREATE-TENANT] Created secret: ${secret.name}`);

      // Add placeholder version
      const [version] = await secretClient.addSecretVersion({
        parent: secret.name,
        payload: {
          data: Buffer.from(placeholderValue, 'utf8'),
        },
      });

      console.log(`[CREATE-TENANT] Added version: ${version.name}`);
    } catch (error: any) {
      // Secret might already exist (e.g., re-running for same user)
      if (error.code === 6) {
        // ALREADY_EXISTS
        console.log(`[CREATE-TENANT] Secret already exists: ${secretName}`);
      } else {
        throw error;
      }
    }
  }
}
