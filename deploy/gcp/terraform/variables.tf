variable "project_id" {
  description = "GCP project ID to deploy into."
  type        = string
}

variable "region" {
  description = "GCP region. Cloud Run, Artifact Registry, and GCS bucket all live here."
  type        = string
  default     = "europe-west1"
}

variable "service_name" {
  description = "Cloud Run service name. Also used as the Artifact Registry repo and the bucket suffix."
  type        = string
  default     = "governor"
}

variable "image" {
  description = <<EOT
Container image for the initial Terraform apply. Use the gcr.io/cloudrun/hello
placeholder for the first apply (before you have built and pushed your own
image); subsequent image rollouts happen via `gcloud run deploy` or the
provided cloudbuild.yaml and do not require re-running Terraform — the
Cloud Run service resource ignores `image` changes after creation.
EOT
  type        = string
  default     = "gcr.io/cloudrun/hello"
}

variable "bucket_location" {
  description = "GCS bucket location. Use a single region (matches `region`) for the lowest egress to Cloud Run."
  type        = string
  default     = "EUROPE-WEST1"
}

variable "public_view_enabled" {
  description = "Set true to enable the read-only public attestation view at /."
  type        = bool
  default     = false
}

variable "allow_unauthenticated" {
  description = <<EOT
Grant roles/run.invoker to allUsers so the service is reachable from the
public internet. Required if you want the public view to actually be public.
The Governor API endpoints still require a bearer token regardless.
EOT
  type        = bool
  default     = false
}

variable "cpu" {
  description = "Cloud Run CPU allocation. 1 is plenty for SQLite + Hono."
  type        = string
  default     = "1"
}

variable "memory" {
  description = "Cloud Run memory allocation."
  type        = string
  default     = "512Mi"
}
