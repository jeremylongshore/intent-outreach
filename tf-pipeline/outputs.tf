# PipelinePilot Infrastructure - Outputs

output "project_id" {
  description = "GCP Project ID"
  value       = var.project_id
}

output "region" {
  description = "GCP region"
  value       = var.region
}

output "service_account_email" {
  description = "Service account email for PipelinePilot"
  value       = google_service_account.pipelinepilot_sa.email
}

output "service_account_id" {
  description = "Service account ID"
  value       = google_service_account.pipelinepilot_sa.id
}

output "staging_bucket_name" {
  description = "GCS bucket name for agent staging"
  value       = google_storage_bucket.agent_staging.name
}

output "staging_bucket_url" {
  description = "GCS bucket URL for agent staging"
  value       = google_storage_bucket.agent_staging.url
}

output "firestore_database" {
  description = "Firestore database name"
  value       = google_firestore_database.pipelinepilot_db.name
}

output "secret_orchestrator_id" {
  description = "Secret Manager secret ID for orchestrator"
  value       = google_secret_manager_secret.orchestrator_id.id
}

output "external_api_secrets" {
  description = "External API secret IDs"
  value       = { for k, v in google_secret_manager_secret.external_api_keys : k => v.id }
}

output "deployment_commands" {
  description = "Commands to deploy PipelinePilot components"
  value = <<-EOT

    # Deployment Commands for PipelinePilot

    ## Set Environment Variables
    export PROJECT_ID=${var.project_id}
    export LOCATION=${var.region}
    export SERVICE_ACCOUNT=${google_service_account.pipelinepilot_sa.email}
    export STAGING_BUCKET=${google_storage_bucket.agent_staging.url}

    ## Deploy Orchestrator to Vertex AI
    cd /home/jeremy/000-projects/pipelinepilot
    source venv-deploy/bin/activate
    python3 src/deploy_with_wrapper.py

    ## Deploy Firebase Functions (when Cloud Build is fixed)
    cd /home/jeremy/000-projects/pipelinepilot/pipelinepilot-dashboard
    firebase deploy --only functions

    ## Deploy Firebase Hosting
    firebase deploy --only hosting

    ## Test Orchestrator
    python3 scripts/smoke_orchestrator.py
  EOT
}
