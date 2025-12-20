# Multi-Cloud Terraform Quick Reference

## Yes, you need different Terraform for each cloud!

### Why Different Terraform?

Each cloud provider has:
- ✅ **Different Services** - Firebase (GCP) ≠ Lambda (AWS) ≠ Azure Functions
- ✅ **Different APIs** - Vertex AI ≠ Bedrock ≠ Azure OpenAI
- ✅ **Different Naming** - Service Account ≠ IAM Role ≠ Managed Identity
- ✅ **Different Providers** - `hashicorp/google` vs `hashicorp/aws` vs `hashicorp/azurerm`

## Service Equivalents

| What You Need | GCP | AWS | Azure |
|---------------|-----|-----|-------|
| **Web Hosting** | Firebase Hosting | S3 + CloudFront | Static Web Apps |
| **Functions** | Cloud Functions | Lambda | Azure Functions |
| **AI/ML** | Vertex AI (Gemini) | Bedrock (Claude) | Azure OpenAI (GPT-4) |
| **Database** | Firestore | DynamoDB | Cosmos DB |
| **Secrets** | Secret Manager | Secrets Manager | Key Vault |
| **Identity** | Service Account | IAM Role | Managed Identity |

## Cost Comparison (Monthly)

- **GCP**: $21-151/mo (cheapest, Firebase included)
- **AWS**: $27-206/mo (mid-range, most services)
- **Azure**: $36-280/mo (highest, but best for Microsoft shops)

## Client Scenarios

### Scenario 1: Client Prefers AWS

**Use:** `tf-pipeline-multicloud/aws/`

**Changes Needed:**
1. Replace Vertex AI → AWS Bedrock (Claude Sonnet 4)
2. Replace Firestore → DynamoDB
3. Replace Firebase Functions → Lambda
4. Replace Firebase Hosting → S3 + CloudFront

**Terraform:**
```bash
cd tf-pipeline-multicloud/aws
cp terraform.tfvars.example terraform.tfvars
nano terraform.tfvars  # Edit region, bucket names
terraform init
terraform apply
```

**Code Changes:**
- ✅ Frontend: No changes (static files work anywhere)
- ✅ Functions: Minimal (Lambda supports Node 20 ESM)
- ⚠️ Orchestrator: Change AI SDK from Vertex AI to Bedrock

---

### Scenario 2: Client Prefers Azure

**Use:** `tf-pipeline-multicloud/azure/` (to be created)

**Changes Needed:**
1. Replace Vertex AI → Azure OpenAI (GPT-4)
2. Replace Firestore → Cosmos DB
3. Replace Firebase Functions → Azure Functions
4. Replace Firebase Hosting → Azure Static Web Apps

**Terraform:**
```bash
cd tf-pipeline-multicloud/azure
# Similar setup to AWS
```

**Code Changes:**
- ✅ Frontend: No changes
- ✅ Functions: Minimal (Azure Functions support Node 20)
- ⚠️ Orchestrator: Change AI SDK from Vertex AI to Azure OpenAI

---

### Scenario 3: Client Has No Preference

**Use:** `tf-pipeline/` (GCP - current implementation)

**Why GCP:**
1. ✅ Lowest cost ($21-151/mo)
2. ✅ Best AI models (Gemini 2.5 Flash)
3. ✅ Firebase ecosystem (hosting, functions, database together)
4. ✅ Fastest to deploy

---

## Quick Decision Tree

```
Client prefers AWS?
├─ Yes → Use tf-pipeline-multicloud/aws/
└─ No
   └─ Client prefers Azure?
      ├─ Yes → Use tf-pipeline-multicloud/azure/
      └─ No → Use tf-pipeline/ (GCP - default)
```

## What's Included

### Current (Complete)
- ✅ **GCP** - `tf-pipeline/` (production-ready)
- ✅ **Multi-Cloud Guide** - `tf-pipeline-multicloud/README.md`
- ✅ **AWS Starter** - `tf-pipeline-multicloud/aws/` (foundation)

### Coming Soon
- 🔴 **Azure** - `tf-pipeline-multicloud/azure/` (to be created)
- 🔴 **AWS Lambda Function** - Complete Lambda deployment
- 🔴 **Azure Function** - Complete Azure Functions deployment

## Migration Effort

### GCP → AWS
- **Infrastructure**: 1-2 days (Terraform rewrite)
- **Code Changes**: 1 day (AI SDK swap)
- **Testing**: 1-2 days
- **Total**: ~1 week

### GCP → Azure
- **Infrastructure**: 1-2 days (Terraform rewrite)
- **Code Changes**: 1 day (AI SDK swap)
- **Testing**: 1-2 days
- **Total**: ~1 week

## Key Takeaway

> **You CANNOT use the same Terraform for different clouds.**
>
> Each cloud has its own Terraform provider, resources, and configurations.
>
> BUT the application code (frontend, business logic) remains ~90% the same!

---

**Last Updated:** 2025-11-01
**Status:** GCP complete, AWS starter, Azure planned
