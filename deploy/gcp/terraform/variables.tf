variable "project_id" {
  description = "GCP project ID to deploy into."
  type        = string
}

variable "project_number" {
  description = <<EOT
Numeric GCP project number (e.g. "53857744562"). Required when iap_enabled
is true: the google_iap_web_cloud_run_service_iam_member resource silently
fails to grant access when given a project_id instead of the number
(hashicorp/terraform-provider-google#23092). Find it with
`gcloud projects describe PROJECT_ID --format='value(projectNumber)'`.
EOT
  type        = string
  default     = ""
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

Mutually exclusive with iap_enabled — IAP is the gatekeeper when on, and
public invocation would defeat the point.
EOT
  type        = bool
  default     = false
}

variable "iap_enabled" {
  description = <<EOT
Turn on Identity-Aware Proxy directly on the Cloud Run service (no load
balancer required). When true:
  * The IAP service agent is granted roles/run.invoker on the service.
  * Members listed in iap_members are granted roles/iap.httpsResourceAccessor.
  * project_number must be set (see that variable).
The OAuth consent screen for the project must already exist; create it once
in the Cloud Console (APIs & Services -> OAuth consent screen). For projects
inside a Google Workspace organization, choose "Internal" user type to avoid
Google verification.
EOT
  type        = bool
  default     = false
}

variable "iap_members" {
  description = <<EOT
Principals granted roles/iap.httpsResourceAccessor when iap_enabled is true.
Use the standard IAM member syntax, e.g.
  ["user:alice@example.com", "group:eng@example.com", "domain:example.com"]
EOT
  type        = list(string)
  default     = []
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
