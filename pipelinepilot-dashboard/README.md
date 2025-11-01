# PipelinePilot Dashboard MVP

## Prereqs
- Node 20
- Firebase CLI
- GCP project: pipelinepilot-prod

## Setup
1. Fill `dashboard/.env.local` with Firebase web config.
2. `npm install` in both `dashboard/` and `functions/`.
3. `firebase deploy --only firestore:rules,functions,hosting`.
4. Open Hosting site → sign in → create a campaign → observe live counters.
5. Add provider keys in Settings. Keys are stored in Secret Manager.

## Go live
- Replace function stub with Agent Engine integration when agents are deployed.
- Add Monitoring and budget alerts in Cloud Monitoring.
