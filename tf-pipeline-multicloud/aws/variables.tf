# AWS Infrastructure Variables

variable "region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "dashboard_bucket_name" {
  description = "S3 bucket name for dashboard hosting (must be globally unique)"
  type        = string
}

variable "staging_bucket_name" {
  description = "S3 bucket name for Lambda code and agent staging (must be globally unique)"
  type        = string
}

variable "external_api_secrets" {
  description = "List of external API secret names to create in Secrets Manager"
  type        = list(string)
  default = [
    "CLAY_API_KEY",
    "APOLLO_API_KEY",
    "CLEARBIT_API_KEY",
    "CRUNCHBASE_API_KEY"
  ]
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default = {
    Project    = "PipelinePilot"
    ManagedBy  = "Terraform"
    Cloud      = "AWS"
  }
}
