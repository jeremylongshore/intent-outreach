# Stripe Webhook Deployment Guide

**Phase:** 1 - Stripe–Firestore Integration
**Last Updated:** 2025-11-02
**Status:** ✅ Implemented, Ready for Deployment

---

## Overview

The Stripe webhook handler (`handleStripeWebhook`) connects Stripe subscription events to PipelinePilot's tenant management system. When a customer subscribes via Stripe, a tenant workspace is automatically provisioned with:

1. Firestore `/tenants/{tenant_id}` document
2. Secret Manager stubs for API keys (Clay, Apollo, Clearbit, Crunchbase)
3. IAM bindings for Vertex AI Reasoning Engine access

---

## Pre-Deployment Checklist

### ✅ Code Preparation

- [x] `stripeWebhook.ts` implemented with signature validation
- [x] TypeScript compilation successful (`npm run build`)
- [x] Dependencies installed (`stripe`, `@google-cloud/secret-manager`)
- [x] Function exported from `index.ts`

### ✅ Secrets Created

```bash
# Verify secrets exist
gcloud secrets list --project=pipelinepilot-prod | grep STRIPE

# Expected output:
# STRIPE_API_KEY
# STRIPE_WEBHOOK_SECRET
```

### ✅ IAM Permissions

Cloud Functions service account needs `secretAccessor` role:

```bash
# Already configured for:
# - serviceAccount:365258353703-compute@developer.gserviceaccount.com

# Verify permissions
gcloud secrets get-iam-policy STRIPE_API_KEY --project=pipelinepilot-prod
gcloud secrets get-iam-policy STRIPE_WEBHOOK_SECRET --project=pipelinepilot-prod
```

---

## Deployment Steps

### Step 1: Deploy Firebase Functions

```bash
cd /home/jeremy/000-projects/pipelinepilot/pipelinepilot-dashboard

# Deploy only the new webhook function
firebase deploy --only functions:handleStripeWebhook --project=pipelinepilot-prod

# Or deploy all functions
firebase deploy --only functions --project=pipelinepilot-prod
```

**Expected Output:**
```
✔  functions[us-central1-handleStripeWebhook(us-central1)] Successful create operation.
Function URL (handleStripeWebhook(us-central1)): https://us-central1-pipelinepilot-prod.cloudfunctions.net/handleStripeWebhook
```

### Step 2: Note the Function URL

The deployed webhook URL will be:
```
https://us-central1-pipelinepilot-prod.cloudfunctions.net/handleStripeWebhook
```

### Step 3: Configure Stripe Webhook

1. Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks)
2. Click "Add endpoint"
3. Enter the function URL from Step 2
4. Select events to listen for:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. Click "Add endpoint"
6. Copy the "Signing secret" (starts with `whsec_`)

### Step 4: Update STRIPE_WEBHOOK_SECRET

Replace the placeholder with the real signing secret:

```bash
# Update secret with real value from Stripe
echo -n "whsec_YOUR_REAL_SIGNING_SECRET_HERE" | \
  gcloud secrets versions add STRIPE_WEBHOOK_SECRET --data-file=- --project=pipelinepilot-prod
```

### Step 5: Update STRIPE_API_KEY (Optional for Testing)

If you want to test with a real Stripe account:

```bash
# Get your Stripe API key from https://dashboard.stripe.com/apikeys
echo -n "sk_test_YOUR_REAL_API_KEY_HERE" | \
  gcloud secrets versions add STRIPE_API_KEY --data-file=- --project=pipelinepilot-prod
```

---

## Testing

### Option 1: Stripe CLI (Recommended)

Install Stripe CLI:
```bash
# macOS
brew install stripe/stripe-cli/stripe

# Login
stripe login
```

Forward webhooks to local or deployed function:
```bash
# Test against deployed function
stripe listen --forward-to https://us-central1-pipelinepilot-prod.cloudfunctions.net/handleStripeWebhook

# Trigger test event
stripe trigger customer.subscription.created
```

### Option 2: Manual Test with cURL

Create a test subscription via Stripe Dashboard, then verify:

```bash
# Check Firestore for new tenant
gcloud firestore documents list \
  --collection-id=tenants \
  --project=pipelinepilot-prod

# Check if secrets were created
gcloud secrets list --project=pipelinepilot-prod | grep "tenant_"

# View function logs
gcloud functions logs read handleStripeWebhook \
  --region=us-central1 \
  --project=pipelinepilot-prod \
  --limit=50
```

### Option 3: Send Test Webhook (Mock)

**Warning:** This bypasses signature validation. Only use for initial testing.

```bash
WEBHOOK_URL="https://us-central1-pipelinepilot-prod.cloudfunctions.net/handleStripeWebhook"

curl -X POST $WEBHOOK_URL \
  -H "Content-Type: application/json" \
  -H "stripe-signature: mock_signature_for_testing" \
  -d '{
    "type": "customer.subscription.created",
    "data": {
      "object": {
        "id": "sub_test123",
        "customer": "cus_test456",
        "status": "active",
        "items": {
          "data": [{
            "price": {
              "id": "price_pro_monthly",
              "unit_amount": 9900
            }
          }]
        },
        "current_period_start": 1699000000
      }
    }
  }'
```

**Note:** With real signature validation, this will fail. Use Stripe CLI for proper testing.

---

## Expected Behavior

### When Subscription Created

1. **Webhook receives event** → Validates signature
2. **Creates tenant document** in Firestore:
   ```
   /tenants/tenant_abc12345
   {
     "stripe_customer_id": "cus_abc123xyz",
     "stripe_subscription_id": "sub_def456uvw",
     "plan": "pro",
     "tier": "paid",
     "status": "active",
     ...
   }
   ```
3. **Creates 4 secrets** in Secret Manager:
   ```
   tenant_abc12345_CLAY_API_KEY
   tenant_abc12345_APOLLO_API_KEY
   tenant_abc12345_CLEARBIT_API_KEY
   tenant_abc12345_CRUNCHBASE_API_KEY
   ```
4. **Grants IAM permissions** to Reasoning Engine SA
5. **Logs to audit** collection: `/tenant_audit/{audit_id}`

### When Subscription Updated

1. Updates tenant document with new plan/status
2. Logs update to audit collection

### When Subscription Canceled

1. Marks tenant as `status: "canceled"`
2. Sets `subscription_end` timestamp
3. **Does NOT delete** tenant data or secrets
4. Logs cancellation to audit collection

---

## Monitoring

### View Logs

```bash
# Real-time logs
gcloud functions logs read handleStripeWebhook \
  --region=us-central1 \
  --project=pipelinepilot-prod \
  --limit=50 \
  --follow

# Filter for errors
gcloud functions logs read handleStripeWebhook \
  --region=us-central1 \
  --project=pipelinepilot-prod \
  --limit=50 \
  | grep ERROR
```

### Check Firestore

```bash
# List all tenants
gcloud firestore documents list \
  --collection-id=tenants \
  --project=pipelinepilot-prod

# View specific tenant
gcloud firestore documents describe tenants/tenant_abc12345 \
  --project=pipelinepilot-prod
```

### Check Secrets

```bash
# List all tenant secrets
gcloud secrets list --project=pipelinepilot-prod | grep "tenant_"

# View specific secret (not the value, just metadata)
gcloud secrets describe tenant_abc12345_CLAY_API_KEY \
  --project=pipelinepilot-prod

# Check IAM permissions
gcloud secrets get-iam-policy tenant_abc12345_CLAY_API_KEY \
  --project=pipelinepilot-prod
```

---

## Troubleshooting

### Issue: "Invalid signature" Error

**Cause:** STRIPE_WEBHOOK_SECRET doesn't match Stripe's signing secret

**Fix:**
1. Get signing secret from Stripe Dashboard → Webhooks → [Your endpoint] → "Signing secret"
2. Update secret:
   ```bash
   echo -n "whsec_YOUR_REAL_SECRET" | \
     gcloud secrets versions add STRIPE_WEBHOOK_SECRET --data-file=- --project=pipelinepilot-prod
   ```

### Issue: "Permission denied" Creating Secrets

**Cause:** Cloud Functions SA lacks Secret Manager permissions

**Fix:**
```bash
# Grant secretmanager.admin at project level (for creating secrets)
gcloud projects add-iam-policy-binding pipelinepilot-prod \
  --member="serviceAccount:365258353703-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.admin"
```

### Issue: Tenant Document Not Created

**Cause:** Missing Firestore permissions

**Fix:**
```bash
# Ensure datastore.user role is granted
gcloud projects add-iam-policy-binding pipelinepilot-prod \
  --member="serviceAccount:365258353703-compute@developer.gserviceaccount.com" \
  --role="roles/datastore.user"
```

### Issue: Webhook Not Receiving Events

**Cause:** Stripe webhook endpoint not configured or URL is wrong

**Fix:**
1. Verify function URL:
   ```bash
   gcloud functions describe handleStripeWebhook \
     --region=us-central1 \
     --project=pipelinepilot-prod \
     --format="value(url)"
   ```
2. Update Stripe webhook endpoint URL in Stripe Dashboard

---

## Security Considerations

### ✅ Implemented

- Stripe signature validation (prevents unauthorized requests)
- Secret Manager for sensitive data (API keys, webhook secret)
- IAM-based access control (Reasoning Engine SA only)
- Comprehensive logging (audit trail)

### 🔄 Phase 2 (Upcoming)

- Tenant ID validation middleware
- Firestore security rules enforcement
- Rate limiting per tenant
- Webhook replay protection

---

## Next Steps

After Phase 1 deployment succeeds:

1. **Test with real Stripe subscription**
   - Create test subscription in Stripe Dashboard
   - Verify tenant document created
   - Verify 4 secrets created
   - Verify IAM bindings applied

2. **Update API keys**
   - Customer provides real API keys
   - Update secrets for tenant:
     ```bash
     echo -n "REAL_CLAY_API_KEY" | \
       gcloud secrets versions add tenant_xxx_CLAY_API_KEY --data-file=- --project=pipelinepilot-prod
     ```

3. **Proceed to Phase 2**
   - Implement tenant isolation middleware
   - Add Firestore security rules
   - Test multi-tenant concurrency

---

## Success Criteria

Phase 1 is complete when:

- ✅ Webhook deployed and accessible
- ✅ Stripe signature validation working
- ✅ Subscription created → Tenant document created in Firestore
- ✅ Subscription created → 4 secrets created in Secret Manager
- ✅ Subscription created → IAM bindings applied correctly
- ✅ Subscription canceled → Tenant marked as canceled (data preserved)
- ✅ Audit logs written to `/tenant_audit/`

---

**Document Status:** ✅ Complete - Ready for Deployment
**Author:** Build Captain (Claude Code)
**Phase:** 1 - Stripe–Firestore Integration
**Next Document:** Phase 1 AAR (After Action Report)
