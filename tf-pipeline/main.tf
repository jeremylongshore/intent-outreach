# PipelinePilot Infrastructure - Main Configuration
# This template creates the complete infrastructure for PipelinePilot

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
  }

  # Optional: Configure remote backend for state storage
  # backend "gcs" {
  #   bucket = "pipelinepilot-terraform-state"
  #   prefix = "terraform/state"
  # }
}

# Configure Google Cloud Provider
provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

# Enable required APIs
resource "google_project_service" "required_apis" {
  for_each = toset([
    "cloudfunctions.googleapis.com",
    "cloudbuild.googleapis.com",
    "firebase.googleapis.com",
    "firestore.googleapis.com",
    "aiplatform.googleapis.com",
    "secretmanager.googleapis.com",
    "iam.googleapis.com",
    "cloudresourcemanager.googleapis.com",
  ])

  project = var.project_id
  service = each.key

  disable_on_destroy = false
}

# Service Account for PipelinePilot
resource "google_service_account" "pipelinepilot_sa" {
  account_id   = var.service_account_name
  display_name = "PipelinePilot Service Account"
  description  = "Service account for PipelinePilot orchestrator and functions"
  project      = var.project_id

  depends_on = [google_project_service.required_apis]
}

# IAM roles for service account
resource "google_project_iam_member" "sa_roles" {
  for_each = toset([
    "roles/aiplatform.user",           # Vertex AI access
    "roles/secretmanager.secretAccessor", # Secret Manager access
    "roles/datastore.user",            # Firestore access
    "roles/logging.logWriter",         # Cloud Logging
    "roles/cloudtrace.agent",          # Cloud Trace
  ])

  project = var.project_id
  role    = each.key
  member  = "serviceAccount:${google_service_account.pipelinepilot_sa.email}"

  depends_on = [google_service_account.pipelinepilot_sa]
}

# GCS Bucket for Agent Staging
resource "google_storage_bucket" "agent_staging" {
  name          = var.staging_bucket_name
  location      = var.region
  project       = var.project_id
  force_destroy = false

  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      age = 30
    }
    action {
      type = "Delete"
    }
  }

  depends_on = [google_project_service.required_apis]
}

# Grant service account access to staging bucket
resource "google_storage_bucket_iam_member" "staging_bucket_access" {
  bucket = google_storage_bucket.agent_staging.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.pipelinepilot_sa.email}"

  depends_on = [google_storage_bucket.agent_staging]
}

# Firestore Database (Native mode)
resource "google_firestore_database" "pipelinepilot_db" {
  project     = var.project_id
  name        = "(default)"
  location_id = var.firestore_location
  type        = "FIRESTORE_NATIVE"

  depends_on = [google_project_service.required_apis]
}

# Secret Manager secrets for API keys
resource "google_secret_manager_secret" "orchestrator_id" {
  secret_id = "ORCHESTRATOR_DEV_ID"
  project   = var.project_id

  replication {
    auto {}
  }

  depends_on = [google_project_service.required_apis]
}

# Grant service account access to secrets
resource "google_secret_manager_secret_iam_member" "orchestrator_id_access" {
  secret_id = google_secret_manager_secret.orchestrator_id.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.pipelinepilot_sa.email}"

  depends_on = [google_secret_manager_secret.orchestrator_id]
}

# Optional: Create secrets for external APIs (Clay, Apollo, Clearbit, Crunchbase)
resource "google_secret_manager_secret" "external_api_keys" {
  for_each = toset(var.external_api_secrets)

  secret_id = each.key
  project   = var.project_id

  replication {
    auto {}
  }

  depends_on = [google_project_service.required_apis]
}

resource "google_secret_manager_secret_iam_member" "external_api_access" {
  for_each = google_secret_manager_secret.external_api_keys

  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.pipelinepilot_sa.email}"
}
