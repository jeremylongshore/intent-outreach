# PipelinePilot Firestore Schema

**Last Updated:** 2025-11-02
**Version:** 1.0.0

---

## Collection: `/tenants/{tenant_id}`

Primary collection for managing tenant workspaces and their subscription status.

### Document Structure

```typescript
interface Tenant {
  // Stripe Integration
  stripe_customer_id: string;           // Stripe customer ID (cus_xxx)
  stripe_subscription_id: string;       // Stripe subscription ID (sub_xxx)
  stripe_subscription_status: string;   // "active" | "canceled" | "past_due" | "unpaid"

  // Plan Details
  plan: "starter" | "pro" | "enterprise";  // Subscription tier
  tier: "free" | "paid";                    // Billing tier
  status: "active" | "inactive" | "canceled";  // Operational status

  // Timestamps
  created_at: Timestamp;                // When tenant was created
  updated_at: Timestamp;                // Last modification
  subscription_start: Timestamp;        // When subscription started
  subscription_end?: Timestamp;         // When subscription ends/ended (optional)

  // API Keys Status
  api_keys: {
    clay: boolean;        // true if {TENANT_ID}_CLAY_API_KEY secret exists
    apollo: boolean;      // true if {TENANT_ID}_APOLLO_API_KEY secret exists
    clearbit: boolean;    // true if {TENANT_ID}_CLEARBIT_API_KEY secret exists
    crunchbase: boolean;  // true if {TENANT_ID}_CRUNCHBASE_API_KEY secret exists
  };

  // Metadata
  email?: string;           // Primary contact email (optional)
  company_name?: string;    // Company name (optional)
  metadata?: Record<string, any>;  // Additional custom data
}
```

### Example Document

```json
{
  "stripe_customer_id": "cus_abc123xyz",
  "stripe_subscription_id": "sub_def456uvw",
  "stripe_subscription_status": "active",
  "plan": "pro",
  "tier": "paid",
  "status": "active",
  "created_at": "2025-11-02T10:30:00Z",
  "updated_at": "2025-11-02T10:30:00Z",
  "subscription_start": "2025-11-02T10:30:00Z",
  "api_keys": {
    "clay": true,
    "apollo": true,
    "clearbit": true,
    "crunchbase": true
  },
  "email": "admin@example.com",
  "company_name": "Acme Corp"
}
```

---

## Collection: `/tenants/{tenant_id}/data/{doc_id}`

Tenant-isolated data storage. All tenant-specific data should be stored under this subcollection.

### Security Rules

```javascript
match /tenants/{tenantId}/data/{docId} {
  allow read, write: if request.auth != null &&
                        request.auth.token.tenant_id == tenantId;
}
```

---

## Collection: `/tenant_audit/{audit_id}`

Audit logs for tenant operations.

### Document Structure

```typescript
interface TenantAudit {
  tenant_id: string;
  action: "created" | "updated" | "canceled" | "secret_created" | "secret_expired";
  timestamp: Timestamp;
  details: Record<string, any>;
  source: "stripe_webhook" | "admin_action" | "automated_audit";
}
```

---

## Secret Manager Naming Convention

For each tenant, the following secrets are created in Google Cloud Secret Manager:

### Secret Names

```
{TENANT_ID}_CLAY_API_KEY
{TENANT_ID}_APOLLO_API_KEY
{TENANT_ID}_CLEARBIT_API_KEY
{TENANT_ID}_CRUNCHBASE_API_KEY
```

### Example

For tenant ID `tenant_abc123`:
```
tenant_abc123_CLAY_API_KEY
tenant_abc123_APOLLO_API_KEY
tenant_abc123_CLEARBIT_API_KEY
tenant_abc123_CRUNCHBASE_API_KEY
```

### Initial Value

All secrets are created with placeholder value: `"PLACEHOLDER_AWAITING_CUSTOMER_INPUT"`

### Permissions

Each secret is granted `roles/secretmanager.secretAccessor` to the Vertex AI Reasoning Engine service account:
```
service-365258353703@gcp-sa-aiplatform-re.iam.gserviceaccount.com
```

---

## Firestore Indexes

Required composite indexes for efficient queries:

### Index 1: Active Tenants by Plan
```
Collection: tenants
Fields:
  - status (Ascending)
  - plan (Ascending)
  - created_at (Descending)
```

### Index 2: Stripe Customer Lookup
```
Collection: tenants
Fields:
  - stripe_customer_id (Ascending)
  - status (Ascending)
```

---

## Migration Notes

### Phase 1 Implementation
- Creates `/tenants/{tenant_id}` on Stripe subscription creation
- Initializes all 4 API key secrets with placeholders
- Sets status to "active" for successful subscriptions

### Phase 2 Considerations
- Will add tenant_id validation middleware
- Will enforce security rules on all read/write operations
- Will add per-tenant usage tracking subcollection

---

**Document Status:** ✅ Complete
**Author:** Build Captain (Claude Code)
**Classification:** Technical Reference
