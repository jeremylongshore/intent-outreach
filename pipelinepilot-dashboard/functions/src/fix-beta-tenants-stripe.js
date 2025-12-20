#!/usr/bin/env node

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin
initializeApp({ credential: applicationDefault() });
const db = getFirestore();

async function fixTenants() {
  console.log('Fixing stripe_customer_id for beta tenants...\n');

  const tenants = [
    'beta_internal_01',
    'beta_internal_02',
    'beta_internal_03',
  ];

  for (const tenantId of tenants) {
    console.log(`Updating ${tenantId}...`);

    await db.collection('tenants').doc(tenantId).update({
      stripe_customer_id: `beta_pending_${tenantId}`,
    });

    console.log(`  ✓ Set stripe_customer_id to: beta_pending_${tenantId}\n`);
  }

  console.log('✅ All tenants updated!');
}

fixTenants()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
