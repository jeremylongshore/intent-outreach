#!/usr/bin/env node

/**
 * Seed Beta Tenants Script
 *
 * Creates 4 beta tenants with secrets:
 * - 3 internal beta (beta_internal_01, 02, 03)
 * - 1 customer beta (beta_customer_acme)
 */

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'pipelinepilot-prod';

// Initialize Firebase Admin
initializeApp({ credential: applicationDefault() });
const db = getFirestore();
const secretClient = new SecretManagerServiceClient();

// Tenant definitions
const tenants = [
  {
    tenant_id: 'beta_internal_01',
    status: 'active',
    betaTier: 'internal',
    stripe_customer_id: '',
    email: 'internal01@pipelinepilot.io',
    company_name: 'Internal Test 01',
    owner_uid: 'seed_script',
  },
  {
    tenant_id: 'beta_internal_02',
    status: 'active',
    betaTier: 'internal',
    stripe_customer_id: '',
    email: 'internal02@pipelinepilot.io',
    company_name: 'Internal Test 02',
    owner_uid: 'seed_script',
  },
  {
    tenant_id: 'beta_internal_03',
    status: 'active',
    betaTier: 'internal',
    stripe_customer_id: '',
    email: 'internal03@pipelinepilot.io',
    company_name: 'Internal Test 03',
    owner_uid: 'seed_script',
  },
  {
    tenant_id: 'beta_customer_acme',
    status: 'active',
    betaTier: 'customer',
    stripe_customer_id: 'cus_sample_acme',
    email: 'admin@acmecorp.com',
    company_name: 'Acme Corporation',
    owner_uid: 'seed_script',
  },
];

async function createTenantSecrets(tenantId, isCustomer) {
  const providers = ['CLAY', 'APOLLO', 'CLEARBIT', 'CRUNCHBASE'];
  const placeholderValue = isCustomer
    ? 'sample_api_key_customer_acme_replace_with_real'
    : 'PLACEHOLDER_REPLACE_WITH_REAL_KEY';

  for (const provider of providers) {
    const secretName = `TENANT_${tenantId}_${provider}_API_KEY`;

    try {
      // Check if secret exists
      const parent = `projects/${PROJECT_ID}`;
      const [secrets] = await secretClient.listSecrets({
        parent,
        filter: `name:${secretName}`,
      });

      if (secrets.length > 0) {
        console.log(`  ⏭️  Secret ${secretName} already exists, skipping...`);
        continue;
      }

      // Create secret
      const [secret] = await secretClient.createSecret({
        parent,
        secretId: secretName,
        secret: {
          replication: {
            automatic: {},
          },
        },
      });

      console.log(`  ✓ Created secret: ${secret.name}`);

      // Add placeholder version
      const [version] = await secretClient.addSecretVersion({
        parent: secret.name,
        payload: {
          data: Buffer.from(placeholderValue, 'utf8'),
        },
      });

      console.log(`  ✓ Added version: ${version.name}`);
    } catch (error) {
      if (error.code === 6) {
        // ALREADY_EXISTS
        console.log(`  ⏭️  Secret ${secretName} already exists`);
      } else {
        console.error(`  ❌ Error creating secret ${secretName}:`, error.message);
      }
    }
  }
}

async function createTenantSecretHealth(tenantId) {
  const secretHealthDoc = {
    CLAY: {
      status: 'placeholder',
      lastChecked: new Date().toISOString(),
    },
    APOLLO: {
      status: 'placeholder',
      lastChecked: new Date().toISOString(),
    },
    CLEARBIT: {
      status: 'placeholder',
      lastChecked: new Date().toISOString(),
    },
    CRUNCHBASE: {
      status: 'placeholder',
      lastChecked: new Date().toISOString(),
    },
    lastAudit: Timestamp.now(),
  };

  await db
    .collection('tenants')
    .doc(tenantId)
    .collection('config')
    .doc('secrets')
    .set(secretHealthDoc);

  console.log(`  ✓ Created secret health document`);
}

async function seedTenants() {
  console.log('🌱 Seeding Beta Tenants...\n');

  for (const tenantData of tenants) {
    console.log(`\n📦 Creating tenant: ${tenantData.tenant_id}`);
    console.log(`   Beta Tier: ${tenantData.betaTier}`);
    console.log(`   Email: ${tenantData.email}`);

    try {
      // Create tenant document
      const tenantDoc = {
        ...tenantData,
        created_at: Timestamp.now(),
        updated_at: Timestamp.now(),
      };

      await db.collection('tenants').doc(tenantData.tenant_id).set(tenantDoc);
      console.log(`  ✓ Created tenant document in Firestore`);

      // Create secrets
      await createTenantSecrets(
        tenantData.tenant_id,
        tenantData.betaTier === 'customer'
      );

      // Create secret health document
      await createTenantSecretHealth(tenantData.tenant_id);

      console.log(`\n✅ Tenant ${tenantData.tenant_id} created successfully!`);
    } catch (error) {
      console.error(`\n❌ Error creating tenant ${tenantData.tenant_id}:`, error.message);
    }
  }

  console.log('\n\n🎉 Seeding complete!\n');
  console.log('Summary:');
  console.log('  - 3 Internal Beta Tenants (beta_internal_01, 02, 03)');
  console.log('  - 1 Customer Beta Tenant (beta_customer_acme)');
  console.log('  - 16 secrets created (4 per tenant)');
  console.log('  - 4 secret health documents created\n');
}

// Run
seedTenants()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
