# PipelinePilot Dashboard - Next Steps

## ✅ What's Been Completed

1. **Bootstrap GCP Services** ✅
   - Set project to pipelinepilot-prod
   - Enabled: firebaserules, firestore, secretmanager, cloudfunctions, run
   - Granted Secret Manager permissions to service accounts

2. **Created Full Dashboard Scaffold** ✅
   - Next.js dashboard (static export)
   - Firebase Functions backend
   - Firestore security rules
   - GitHub Actions deployment workflow
   - All 47 files created

3. **Installing Dependencies** ⏳ (in progress)
   - `dashboard/node_modules` installing
   - `functions/node_modules` installing

---

## 🔧 Required: Get Firebase Web App Config

You need to add a Firebase web app and get the config values.

### Option 1: Firebase Console (Recommended)

1. Go to: https://console.firebase.google.com/project/pipelinepilot-prod/settings/general
2. Scroll to "Your apps"
3. Click "Add app" → Select "Web" (</> icon)
4. App nickname: "PipelinePilot Dashboard"
5. Click "Register app"
6. Copy the config object that looks like:
   ```javascript
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "pipelinepilot-prod.firebaseapp.com",
     projectId: "pipelinepilot-prod",
     storageBucket: "pipelinepilot-prod.firebasestorage.app",
     messagingSenderId: "365258353703",
     appId: "1:365258353703:web:..."
   };
   ```

### Option 2: gcloud CLI

```bash
# After manually creating app in console, get the config:
firebase apps:sdkconfig WEB --project=pipelinepilot-prod
```

### Update .env.local

Edit `dashboard/.env.local` and fill in:

```bash
NEXT_PUBLIC_FB_API_KEY=AIza...
NEXT_PUBLIC_FB_AUTH_DOMAIN=pipelinepilot-prod.firebaseapp.com
NEXT_PUBLIC_FB_PROJECT_ID=pipelinepilot-prod
NEXT_PUBLIC_FB_APP_ID=1:365258353703:web:...
```

---

## 🚀 Build and Deploy

Once you have the Firebase config filled in:

```bash
cd /home/jeremy/000-projects/iams/pipelinepilot/pipelinepilot-dashboard

# Build dashboard
cd dashboard
npm run build

# Build functions
cd ../functions
npm run build

# Deploy everything
cd ..
firebase deploy --only firestore:rules,functions,hosting --project pipelinepilot-prod
```

---

## 🎯 Test the Dashboard

After deployment:

1. Get your Hosting URL:
   ```bash
   firebase hosting:sites:list --project=pipelinepilot-prod
   ```
   - URL will be: https://pipelinepilot-prod.web.app

2. Open the URL in your browser

3. Click "Login" and sign in with Google

4. Create a test campaign:
   - Click "New Campaign"
   - Name: "Test Campaign"
   - ICP: "SaaS companies, 100-500 employees"
   - Domains: "google.com microsoft.com salesforce.com"
   - Click "Create"

5. Watch the campaign detail page:
   - Should show status changing: QUEUED → RUNNING → DONE
   - Watch counters update in real-time:
     - Leads: 3
     - Enriched: 3
     - Messages: 3

6. Test provider keys:
   - Go to Settings → Keys
   - Enter a test value for CLAY_API_KEY
   - Click "Save" (should show "Saved")
   - Click "Test" (should show "OK")

---

## 🔑 Add Real API Keys

When ready to use real providers:

```bash
# From the Settings page in the dashboard, or via gcloud:
gcloud secrets versions add CLAY_API_KEY --data-file=- --project=pipelinepilot-prod <<< "your-clay-api-key"
gcloud secrets versions add APOLLO_API_KEY --data-file=- --project=pipelinepilot-prod <<< "your-apollo-api-key"
gcloud secrets versions add CLEARBIT_API_KEY --data-file=- --project=pipelinepilot-prod <<< "your-clearbit-api-key"
gcloud secrets versions add CRUNCHBASE_API_KEY --data-file=- --project=pipelinepilot-prod <<< "your-crunchbase-api-key"
```

---

## 🔌 Wire to Agent Engine (Later)

When ADK is available and agents are deployed:

1. Get agent endpoint IDs from Vertex AI Console
2. Edit `functions/src/index.ts`
3. Replace the `TODO:` section in `runQueuedCampaign` with real Agent Engine calls
4. Use the `readSecret()` helper to fetch API keys
5. Call agents in sequence: Research → Enrich → Outreach
6. Write results to Firestore subcollections as they stream

Example:
```typescript
async function readSecret(name: string) {
  const [v] = await secrets.accessSecretVersion({
    name: `projects/${PROJECT}/secrets/${name}/versions/latest`
  });
  return v.payload?.data?.toString() || '';
}

// In runQueuedCampaign:
const clayKey = await readSecret('CLAY_API_KEY');
const apolloKey = await readSecret('APOLLO_API_KEY');
// ... make Agent Engine calls with keys
```

---

## 📋 Current Status

- ✅ GCP project configured
- ✅ Firestore database operational
- ✅ Secret Manager configured
- ✅ All code scaffolded
- ⏳ Dependencies installing
- 🔴 Firebase web app config needed
- 🔴 Build and deploy pending

---

## 🆘 Troubleshooting

### "Module not found" errors
```bash
cd dashboard && npm install
cd ../functions && npm install
```

### Firebase CLI not authenticated
```bash
firebase login
```

### Deployment fails
```bash
# Check Firebase CLI version (should be latest)
firebase --version

# Re-authenticate
firebase logout
firebase login

# Try deploying components separately
firebase deploy --only firestore:rules
firebase deploy --only functions
firebase deploy --only hosting
```

### Functions not deploying
```bash
# Make sure functions are built
cd functions && npm run build

# Check lib/ directory exists
ls -la lib/
```

---

## 📞 Quick Links

- **Firebase Console:** https://console.firebase.google.com/project/pipelinepilot-prod
- **GCP Console:** https://console.cloud.google.com/home/dashboard?project=pipelinepilot-prod
- **Firestore Data:** https://console.firebase.google.com/project/pipelinepilot-prod/firestore
- **Functions Logs:** https://console.firebase.google.com/project/pipelinepilot-prod/functions
- **Hosting:** https://console.firebase.google.com/project/pipelinepilot-prod/hosting

---

**Created:** 2025-10-31
**Status:** Dashboard scaffold complete, ready for Firebase config and deployment
