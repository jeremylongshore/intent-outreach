#!/usr/bin/env node

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin
initializeApp({ credential: applicationDefault(), projectId: 'pipelinepilot-prod' });
const db = getFirestore();

async function checkArvRuns() {
  console.log('Checking Firestore for ARV runs...\n');

  try {
    const runsSnapshot = await db
      .collection('system')
      .doc('arv-runs')
      .collection('runs')
      .orderBy('timestamp', 'desc')
      .limit(5)
      .get();

    if (runsSnapshot.empty) {
      console.log('❌ No ARV runs found in Firestore');
      process.exit(1);
    }

    console.log(`✅ Found ${runsSnapshot.size} recent ARV runs:\n`);

    runsSnapshot.forEach((doc) => {
      const data = doc.data();
      console.log(`Run ID: ${doc.id}`);
      console.log(`  Timestamp: ${data.timestamp?.toDate().toISOString() || 'N/A'}`);
      console.log(`  Status: ${data.ok ? '✅ OK' : '❌ FAILED'}`);
      console.log(`  Critical: ${data.critical ? '🚨 YES' : '✅ NO'}`);
      console.log(`  Tenants Checked: ${data.tenantsChecked}`);
      console.log(`  Passed: ${data.tenantsPassed}, Failed: ${data.tenantsFailed}, Warnings: ${data.tenantsWarning}`);
      console.log(`  Duration: ${data.durationMs}ms`);
      console.log('');
    });

    console.log('✅ Firestore ARV logging is working correctly!');
  } catch (error) {
    console.error('❌ Error checking ARV runs:', error);
    process.exit(1);
  }
}

checkArvRuns()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
