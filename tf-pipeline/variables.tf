# PipelinePilot Infrastructure - Variables

variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP region for resources"
  type        = string
  default     = "us-central1"
}

variable "firestore_location" {
  description = "Firestore database location"
  type        = string
  default     = "us-central"
}

variable "service_account_name" {
  description = "Service account name for PipelinePilot"
  type        = string
  default     = "pp-dev"
}

variable "staging_bucket_name" {
  description = "GCS bucket name for agent staging (must be globally unique)"
  type        = string
}

variable "external_api_secrets" {
  description = "List of external API secret names to create in Secret Manager"
  type        = list(string)
  default = [
    "CLAY_API_KEY",
    "APOLLO_API_KEY",
    "CLEARBIT_API_KEY",
    "CRUNCHBASE_API_KEY"
  ]
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "labels" {
  description = "Labels to apply to all resources"
  type        = map(string)
  default = {
    project     = "pipelinepilot"
    managed_by  = "terraform"
  }
}
