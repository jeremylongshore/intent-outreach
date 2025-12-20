# PipelinePilot Multi-Cloud Terraform Templates

This directory contains Terraform templates for deploying PipelinePilot across different cloud providers.

## Directory Structure

```
tf-pipeline-multicloud/
├── gcp/          # Google Cloud Platform (Firebase + Vertex AI)
├── aws/          # Amazon Web Services (Lambda + Bedrock)
├── azure/        # Microsoft Azure (Functions + Azure OpenAI)
├── docs/         # Architecture decision records
└── README.md     # This file
```

## Cloud Provider Comparison

| Component | GCP | AWS | Azure |
|-----------|-----|-----|-------|
| **Serverless Functions** | Firebase Functions Gen2 | AWS Lambda | Azure Functions |
| **AI/ML Platform** | Vertex AI Gemini | AWS Bedrock (Claude) | Azure OpenAI Service |
| **Database** | Firestore | DynamoDB | Cosmos DB |
| **Object Storage** | Cloud Storage | S3 | Blob Storage |
| **Secrets** | Secret Manager | Secrets Manager | Key Vault |
| **Identity** | Service Account | IAM Role | Managed Identity |
| **Hosting** | Firebase Hosting | CloudFront + S3 | Azure Static Web Apps |

## Architecture Patterns

### Pattern 1: Firebase-First (GCP Only)

**Best for:**
- Mobile/web apps with real-time features
- Rapid prototyping
- Google Cloud ecosystem

**Stack:**
```
Firebase Hosting → Firebase Functions → Vertex AI → Firestore
```

**Limitations:**
- Vendor lock-in to Google
- Firebase not available on AWS/Azure

---

### Pattern 2: Cloud-Agnostic API Gateway

**Best for:**
- Multi-cloud deployments
- Client flexibility
- Enterprise requirements

**Stack (Any Cloud):**
```
Static Web Host → Serverless Functions → LLM API → NoSQL Database
```

**GCP:** `Firebase Hosting → Cloud Functions → Vertex AI → Firestore`
**AWS:** `CloudFront/S3 → Lambda → Bedrock → DynamoDB`
**Azure:** `Static Web Apps → Functions → Azure OpenAI → Cosmos DB`

---

### Pattern 3: Container-Based (Cloud-Agnostic)

**Best for:**
- Maximum portability
- Complex orchestration
- Kubernetes deployments

**Stack (Any Cloud):**
```
CDN → Container Service → LLM Container → Database
```

**GCP:** `Cloud CDN → Cloud Run → Vertex AI → Firestore`
**AWS:** `CloudFront → ECS Fargate → Bedrock → DynamoDB`
**Azure:** `Azure CDN → Container Apps → Azure OpenAI → Cosmos DB`

---

## Service Mapping

### GCP → AWS → Azure

#### Compute & Functions
- **GCP:** Cloud Functions, Cloud Run, Firebase Functions
- **AWS:** Lambda, ECS Fargate, App Runner
- **Azure:** Azure Functions, Container Apps, App Service

#### AI/ML Services
- **GCP:** Vertex AI (Gemini 2.5 Flash, Gemini 1.5 Pro)
- **AWS:** Bedrock (Claude Sonnet, Claude Opus)
- **Azure:** Azure OpenAI (GPT-4, GPT-3.5)

#### NoSQL Databases
- **GCP:** Firestore, Cloud Bigtable
- **AWS:** DynamoDB, DocumentDB
- **Azure:** Cosmos DB

#### Object Storage
- **GCP:** Cloud Storage
- **AWS:** S3
- **Azure:** Blob Storage

#### Secrets Management
- **GCP:** Secret Manager
- **AWS:** Secrets Manager, Parameter Store
- **Azure:** Key Vault

#### Identity & Access
- **GCP:** Service Accounts, IAM
- **AWS:** IAM Roles, IAM Users
- **Azure:** Managed Identities, Azure AD

---

## Current Implementation (GCP)

The current PipelinePilot uses **Pattern 1: Firebase-First**:

```
Firebase Hosting (Dashboard)
       ↓
Firebase Functions Gen2 (Gateway - Node 20 ESM)
       ↓
Vertex AI Reasoning Engine (Orchestrator - Python ADK)
       ↓
External APIs (Clay, Apollo, Clearbit, Crunchbase)
       ↓
Firestore (Logs & Campaign Data)
```

**Why GCP was chosen:**
1. ✅ Vertex AI Gemini 2.5 Flash (fast, cost-effective)
2. ✅ Firebase integration (hosting, functions, Firestore)
3. ✅ Vertex AI Reasoning Engine (managed agent hosting)
4. ✅ Native Python ADK support
5. ✅ Tight integration between services

---

## Migrating to AWS

To deploy on AWS, you need to replace:

### 1. Frontend Hosting
**GCP:** Firebase Hosting
**AWS:** S3 + CloudFront

```hcl
# terraform/aws/hosting.tf
resource "aws_s3_bucket" "dashboard" {
  bucket = "pipelinepilot-dashboard"
}

resource "aws_cloudfront_distribution" "cdn" {
  origin {
    domain_name = aws_s3_bucket.dashboard.bucket_regional_domain_name
    origin_id   = "S3-pipelinepilot-dashboard"
  }
  # ... cloudfront config
}
```

### 2. Serverless Functions
**GCP:** Firebase Functions (Node 20 ESM)
**AWS:** Lambda (Node 20 ESM)

```hcl
# terraform/aws/functions.tf
resource "aws_lambda_function" "start_campaign" {
  function_name = "pipelinepilot-start-campaign"
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  role          = aws_iam_role.lambda_role.arn
  # ... lambda config
}
```

**Code changes:** Minimal - Lambda supports ESM with `"type": "module"` in package.json

### 3. AI/ML Platform
**GCP:** Vertex AI (Gemini)
**AWS:** Bedrock (Claude Sonnet 4)

```python
# AWS Bedrock example
import boto3

bedrock = boto3.client('bedrock-runtime')
response = bedrock.invoke_model(
    modelId='anthropic.claude-sonnet-4-20250514',
    body=json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "messages": [{"role": "user", "content": prompt}]
    })
)
```

**Note:** Bedrock uses Claude (Anthropic) instead of Gemini (Google)

### 4. Database
**GCP:** Firestore
**AWS:** DynamoDB

```hcl
# terraform/aws/database.tf
resource "aws_dynamodb_table" "campaigns" {
  name           = "pipelinepilot-campaigns"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "campaignId"

  attribute {
    name = "campaignId"
    type = "S"
  }
}
```

### 5. Secrets
**GCP:** Secret Manager
**AWS:** Secrets Manager

```hcl
# terraform/aws/secrets.tf
resource "aws_secretsmanager_secret" "orchestrator_id" {
  name = "ORCHESTRATOR_DEV_ID"
}
```

---

## Migrating to Azure

To deploy on Azure, you need to replace:

### 1. Frontend Hosting
**GCP:** Firebase Hosting
**Azure:** Azure Static Web Apps

```hcl
# terraform/azure/hosting.tf
resource "azurerm_static_site" "dashboard" {
  name                = "pipelinepilot-dashboard"
  resource_group_name = azurerm_resource_group.main.name
  location            = "East US 2"
}
```

### 2. Serverless Functions
**GCP:** Firebase Functions
**Azure:** Azure Functions (Node 20)

```hcl
# terraform/azure/functions.tf
resource "azurerm_linux_function_app" "start_campaign" {
  name                = "pipelinepilot-start-campaign"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location

  site_config {
    application_stack {
      node_version = "20"
    }
  }
}
```

### 3. AI/ML Platform
**GCP:** Vertex AI (Gemini)
**Azure:** Azure OpenAI (GPT-4)

```python
# Azure OpenAI example
from openai import AzureOpenAI

client = AzureOpenAI(
    api_key=os.getenv("AZURE_OPENAI_KEY"),
    api_version="2024-02-01",
    azure_endpoint="https://YOUR-ENDPOINT.openai.azure.com/"
)

response = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": prompt}]
)
```

**Note:** Azure OpenAI uses GPT models, not Gemini

### 4. Database
**GCP:** Firestore
**Azure:** Cosmos DB (NoSQL API)

```hcl
# terraform/azure/database.tf
resource "azurerm_cosmosdb_account" "main" {
  name                = "pipelinepilot-cosmos"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  offer_type          = "Standard"
  kind                = "GlobalDocumentDB"

  consistency_policy {
    consistency_level = "Session"
  }
}
```

### 5. Secrets
**GCP:** Secret Manager
**Azure:** Key Vault

```hcl
# terraform/azure/secrets.tf
resource "azurerm_key_vault" "main" {
  name                = "pipelinepilot-kv"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  tenant_id           = data.azurerm_client_config.current.tenant_id
  sku_name            = "standard"
}
```

---

## Cost Comparison (Estimated Monthly)

| Service | GCP | AWS | Azure |
|---------|-----|-----|-------|
| **Hosting** | Firebase: $0-5 | S3+CloudFront: $1-10 | Static Web Apps: $0-9 |
| **Functions** | Cloud Functions: $5-20 | Lambda: $5-20 | Azure Functions: $5-20 |
| **AI/ML** | Vertex AI: $10-100 | Bedrock: $15-150 | Azure OpenAI: $20-200 |
| **Database** | Firestore: $5-25 | DynamoDB: $5-25 | Cosmos DB: $10-50 |
| **Secrets** | Secret Manager: $1 | Secrets Manager: $1 | Key Vault: $1 |
| **Total** | **$21-151/mo** | **$27-206/mo** | **$36-280/mo** |

**Note:** Costs vary based on usage, region, and reserved capacity.

---

## Decision Matrix

### Choose GCP if:
- ✅ Using Firebase for mobile/web
- ✅ Want Gemini AI models
- ✅ Prefer tightly integrated services
- ✅ Prioritize rapid development

### Choose AWS if:
- ✅ Already using AWS services
- ✅ Want Claude AI models (Bedrock)
- ✅ Need maximum service breadth
- ✅ Enterprise compliance requirements (AWS GovCloud)

### Choose Azure if:
- ✅ Microsoft ecosystem (Office 365, Active Directory)
- ✅ Want GPT-4 models (Azure OpenAI)
- ✅ Hybrid cloud (on-prem + cloud)
- ✅ Enterprise contracts with Microsoft

---

## Next Steps

1. **Review** current GCP implementation in `../tf-pipeline/`
2. **Decide** which cloud provider your client prefers
3. **Use** the appropriate template from `aws/` or `azure/` directories
4. **Customize** for client-specific requirements
5. **Test** locally before deploying to client environment

---

## References

- **GCP Templates:** `../tf-pipeline/` (current implementation)
- **AWS Templates:** `./aws/` (to be created)
- **Azure Templates:** `./azure/` (to be created)
- **Architecture Decisions:** `./docs/`

**Last Updated:** 2025-11-01
**Status:** GCP complete, AWS/Azure templates in progress
