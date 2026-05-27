output "service_url" {
  description = "HTTPS URL of the Cloud Run service."
  value       = google_cloud_run_v2_service.governor.uri
}

output "image_repo" {
  description = "Artifact Registry Docker repo URL. Push images here."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}"
}

output "replica_bucket" {
  description = "GCS bucket Litestream replicates the SQLite WAL into."
  value       = google_storage_bucket.replica.name
}

output "runtime_sa_email" {
  description = "Service account used by the Cloud Run container at runtime."
  value       = google_service_account.runtime.email
}

output "bootstrap_token_secret" {
  description = "Secret Manager secret holding GOVERNOR_BOOTSTRAP_TOKEN. Add a version with `gcloud secrets versions add`."
  value       = google_secret_manager_secret.bootstrap_token.secret_id
}

output "iap_enabled" {
  description = "Whether IAP is gating the service. When true, the run.app URL requires Google sign-in."
  value       = var.iap_enabled
}
