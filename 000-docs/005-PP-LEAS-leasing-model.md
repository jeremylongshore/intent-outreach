# Leasing Model: PipelinePilot

**Document ID:** 007-PP-LEAS-leasing-model
**Created:** 2025-10-31
**Status:** Draft v0.2

---

## Overview

PipelinePilot operates as a **leaseable SaaS platform** for agencies. Agencies pay a flat monthly fee + per-seat charges + performance commission.

### Revenue Model

```
Monthly Revenue = Flat Fee + (Seats × Seat Price) + Commission
```

**Example (Growth Plan):**
- Flat fee: $999/mo
- Seats: 5 × $49 = $245/mo
- Commission: 10 meetings × $100 = $1,000
- **Total:** $2,244/mo

---

## Pricing Tiers

### Starter Plan
- **Flat Monthly Fee:** $499
- **Per Seat:** $49/seat/month
- **Commission Rate:** 5% (500 basis points)
- **Included:**
  - 10,000 provider API calls/month
  - 5 agent invocations/day
  - Basic support (email, 48hr SLA)
- **Best For:** Small agencies (1-3 clients)

### Growth Plan
- **Flat Monthly Fee:** $999
- **Per Seat:** $49/seat/month
- **Commission Rate:** 7% (700 basis points)
- **Included:**
  - 50,000 provider API calls/month
  - 20 agent invocations/day
  - Priority support (email + chat, 24hr SLA)
  - Custom ICP scoring
- **Best For:** Mid-size agencies (4-10 clients)

### Scale Plan
- **Flat Monthly Fee:** $1,999
- **Per Seat:** $49/seat/month
- **Commission Rate:** 10% (1000 basis points)
- **Included:**
  - Unlimited provider API calls
  - Unlimited agent invocations
  - White-glove support (phone + dedicated Slack, 4hr SLA)
  - Custom agent training
  - Multi-region deployment
- **Best For:** Enterprise agencies (10+ clients)

---

## Commission Models

### Model 1: Meetings
**Definition:** Commission based on qualified meetings booked.

**Calculation:**
```
Commission = # of qualified meetings × $ per meeting
```

**Example:**
- Tier: Growth (7% = 700 bps)
- Meetings booked: 15
- Avg meeting value: $500 (assumed value per qualified meeting)
- Commission: 15 × $500 × 0.07 = **$525**

**Recording:**
```bash
POST /usage/:tenantId/meeting
{
  "meetingId": "mtg_123",
  "qualified": true,
  "attendees": ["john@example.com"],
  "notes": "Demo scheduled"
}
```

---

### Model 2: Sourced MRR
**Definition:** Commission based on closed-won deals attributed to PipelinePilot leads.

**Calculation:**
```
Commission = (Deal MRR × 6 months) × commission_rate
```

**Example:**
- Tier: Scale (10% = 1000 bps)
- Deal closed: $5,000 MRR
- Commission: ($5,000 × 6) × 0.10 = **$3,000**

**Recording:**
```bash
POST /usage/:tenantId/sourced-mrr
{
  "dealId": "deal_456",
  "dealAmountUSD": 5000,
  "stage": "closed_won",
  "closeDate": "2025-10-31"
}
```

**Attribution Window:** 6 months from first contact.

---

## Billing Cycle

### Monthly Invoicing

**Process:**
1. **Day 1 of month:** Cloud Scheduler triggers `POST /billing/run-monthly`
2. **System aggregates:**
   - Flat fee (from LeaseContract)
   - Active seats (count from Firestore)
   - Commission (from usage events)
3. **Invoice created:**
   - Firestore: `billing/{tenantId}/invoices/{period}`
   - Stripe: Draft invoice → Finalized → Sent
4. **Payment collected:**
   - Stripe charges customer
   - Webhook updates Firestore status

**Invoice Line Items:**
```json
{
  "lineItems": [
    {
      "type": "flat",
      "description": "Growth plan - 2025-10",
      "amountUSD": 999
    },
    {
      "type": "seat",
      "description": "5 seats @ $49/seat",
      "amountUSD": 245
    },
    {
      "type": "commission",
      "description": "meetings commission @ 7%",
      "amountUSD": 525
    }
  ],
  "totalUSD": 1769
}
```

---

## Seat Management

### Adding Seats
```bash
POST /tenants/:id/seats
{
  "email": "user@agency.com",
  "role": "member"
}
```

**Prorated Billing:** If added mid-month, charge is prorated for remaining days.

### Removing Seats
```bash
DELETE /tenants/:id/seats/:userId
```

**Credit Issued:** Prorated credit applied to next invoice.

---

## Commission Attribution

### Challenge
How do we know if a closed deal came from PipelinePilot vs. other lead sources?

### Solution: Attribution Tag
- Every lead exported includes `source: "pipelinepilot"`
- Agency CRM tracks this tag through lifecycle
- When deal closes, agency reports back via API

**Reporting:**
```bash
POST /usage/:tenantId/sourced-mrr
{
  "dealId": "crm_deal_789",
  "dealAmountUSD": 10000,
  "stage": "closed_won",
  "closeDate": "2025-10-31",
  "attributionTag": "pipelinepilot"
}
```

---

## Overrides & Adjustments

### Per-Tenant Pricing
Agencies can negotiate custom pricing stored in `LeaseContract`:

```json
{
  "tenantId": "t_123",
  "plan": "growth",
  "flatMonthlyUSD": 899,  // Discounted from $999
  "seatUSD": 39,          // Discounted from $49
  "commissionRateBps": 600, // 6% instead of 7%
  "notes": "Founding customer discount"
}
```

### Manual Adjustments
```bash
PATCH /tenants/:id
{
  "flatMonthlyUSD": 799,
  "notes": "Q4 promotion - 20% off flat fee"
}
```

---

## Payment Terms

### Standard Terms
- **Due Date:** 7 days from invoice date
- **Payment Method:** Credit card (Stripe)
- **Late Fee:** $50 after 30 days overdue

### Enterprise Terms (Scale Plan)
- **Due Date:** Net 30
- **Payment Method:** ACH/wire transfer
- **Invoice Format:** PDF + CSV export

---

## Discounts & Promotions

### Annual Prepay Discount
- **Discount:** 20% off flat fee
- **Commitment:** 12 months upfront
- **Refund Policy:** No refunds for early cancellation

**Example:**
- Growth plan: $999/mo × 12 = $11,988
- Annual prepay: $11,988 × 0.80 = **$9,590** ($999 savings)

### Volume Discount
- **Threshold:** 10+ clients under one agency
- **Discount:** 15% off flat fee
- **Auto-applied:** When 10th client added

---

## Cancellation & Refunds

### Cancellation Policy
- **Notice Period:** 30 days
- **Access:** Service continues until end of paid period
- **Data Export:** Agency can export all data before termination

### Refund Policy
- **Unused Seats:** Prorated refund for current month
- **Flat Fee:** No refund (charged upfront for month)
- **Commission:** No refund (earned commission is final)

---

## Revenue Projections

### Year 1 (Aggressive)
- **Month 1-3:** 5 agencies × $999 avg = $5k MRR
- **Month 4-6:** 10 agencies × $999 avg = $10k MRR
- **Month 7-9:** 15 agencies × $999 avg = $15k MRR
- **Month 10-12:** 20 agencies × $999 avg = $20k MRR
- **ARR:** $180k

### Year 2 (Scale)
- **Q1:** 30 agencies × $1,200 avg = $36k MRR
- **Q2:** 50 agencies × $1,200 avg = $60k MRR
- **Q3:** 75 agencies × $1,200 avg = $90k MRR
- **Q4:** 100 agencies × $1,200 avg = $120k MRR
- **ARR:** $1.2M

---

## Success Metrics

### Per-Tenant Metrics
- **ARPU (Average Revenue Per User):** Target $1,200/mo
- **Churn Rate:** <5% monthly
- **LTV (Lifetime Value):** $14,400 (12 months avg)
- **CAC (Customer Acquisition Cost):** <$1,500

### Platform Metrics
- **MRR Growth:** 20% month-over-month (first 6 months)
- **Gross Margin:** >95% (SaaS target)
- **Commission as % of Revenue:** <30%

---

## Appendix

- **Lease Contract Schema:** [004-DR-SCHM-json-schemas.md](./004-DR-SCHM-json-schemas.md)
- **Billing API:** [003-DR-APIM-api-reference.md](./003-DR-APIM-api-reference.md)
- **PRD:** [001-PP-PROD-pipelinepilot-prd.md](./001-PP-PROD-pipelinepilot-prd.md)

---

**Document Status:** Draft
**Next Review:** 2025-11-07
