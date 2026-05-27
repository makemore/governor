// Governor on Google Cloud: Cloud Run for compute, GCS for Litestream
// replication, Secret Manager for the bootstrap token, Artifact Registry
// for the image. Single-instance pinned (--max-instances=1) because the
// underlying SQLite store is single-writer; see deploy/gcp/README.md for
// the architectural rationale.

locals {
  bucket_name = "${var.project_id}-${var.service_name}-replica"
  // IAP service agent identity is derived from the numeric project number.
  iap_service_agent = var.iap_enabled ? "serviceAccount:service-${var.project_number}@gcp-sa-iap.iam.gserviceaccount.com" : ""
}

// ---- Preconditions ----
// Catch misconfiguration at plan time rather than during a half-applied apply.
resource "terraform_data" "iap_preconditions" {
  count = var.iap_enabled ? 1 : 0
  lifecycle {
    precondition {
      condition     = length(var.project_number) > 0
      error_message = "iap_enabled = true requires project_number to be set (numeric project number, not project ID)."
    }
    precondition {
      condition     = !var.allow_unauthenticated
      error_message = "iap_enabled and allow_unauthenticated are mutually exclusive; IAP cannot gate a publicly invocable service."
    }
  }
}

// ---- APIs ----
resource "google_project_service" "apis" {
  for_each = toset(concat([
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "storage.googleapis.com",
    "secretmanager.googleapis.com",
    "cloudbuild.googleapis.com",
  ], var.iap_enabled ? ["iap.googleapis.com"] : []))
  service            = each.key
  disable_on_destroy = false
}

// ---- Artifact Registry (Docker) ----
resource "google_artifact_registry_repository" "images" {
  location      = var.region
  repository_id = var.service_name
  format        = "DOCKER"
  description   = "Container images for the ${var.service_name} Cloud Run service."
  depends_on    = [google_project_service.apis]
}

// ---- GCS bucket for Litestream replica ----
// Object versioning is on: Litestream uploads small WAL frames frequently
// and we want point-in-time restore to survive accidental deletion.
resource "google_storage_bucket" "replica" {
  name                        = local.bucket_name
  location                    = var.bucket_location
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  versioning { enabled = true }

  // Prune noncurrent WAL/snapshot objects after 30 days to keep cost flat.
  // Litestream retains the snapshot chain it actively needs regardless.
  lifecycle_rule {
    action { type = "Delete" }
    condition {
      age                = 30
      with_state         = "ARCHIVED"
      num_newer_versions = 3
    }
  }

  depends_on = [google_project_service.apis]
}

// ---- Runtime service account ----
resource "google_service_account" "runtime" {
  account_id   = "${var.service_name}-run"
  display_name = "Cloud Run runtime SA for ${var.service_name}"
}

// Litestream uses ADC. The runtime SA needs read/write on the replica bucket.
resource "google_storage_bucket_iam_member" "replica_rw" {
  bucket = google_storage_bucket.replica.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.runtime.email}"
}

// ---- Secret Manager: bootstrap token ----
// The secret resource itself is managed by Terraform; the *value* is not.
// Create the first version manually so the token never enters tfstate:
//   openssl rand -hex 32 | gcloud secrets versions add governor-bootstrap-token --data-file=-
resource "google_secret_manager_secret" "bootstrap_token" {
  secret_id = "${var.service_name}-bootstrap-token"
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_iam_member" "bootstrap_token_access" {
  secret_id = google_secret_manager_secret.bootstrap_token.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

// ---- Cloud Run service ----
resource "google_cloud_run_v2_service" "governor" {
  name     = var.service_name
  location = var.region
  // Required for the volume / startup-CPU semantics Litestream needs.
  launch_stage = "GA"

  // The real durability boundary is the Litestream replica in GCS, not the
  // Cloud Run service object. Leave deletion_protection off so terraform
  // can recreate the service in place when its shape changes (e.g. flipping
  // iap_enabled, swapping env layout). The replica bucket has its own
  // force_destroy=false guard and that's what actually matters.
  deletion_protection = false

  // Direct IAP integration on Cloud Run (GA April 2025). No load balancer
  // required; IAP authenticates every request and forwards a signed JWT
  // header. The runtime invoker grant goes to the IAP service agent below.
  iap_enabled = var.iap_enabled

  template {
    service_account                  = google_service_account.runtime.email
    max_instance_request_concurrency = 80
    // SQLite is single-writer. Do not relax this.
    scaling {
      min_instance_count = 1
      max_instance_count = 1
    }
    containers {
      image = var.image
      ports { container_port = 8080 }
      resources {
        cpu_idle = false // always-allocated CPU so Litestream replicates between requests
        limits = {
          cpu    = var.cpu
          memory = var.memory
        }
      }
      env {
        name  = "GOVERNOR_DB_PATH"
        value = "/data/governor.sqlite"
      }
      env {
        name  = "GOVERNOR_REPLICATION_URL"
        value = "gcs://${google_storage_bucket.replica.name}/governor"
      }
      env {
        name  = "GOVERNOR_PUBLIC_ENABLED"
        value = var.public_view_enabled ? "true" : "false"
      }
      env {
        name = "GOVERNOR_BOOTSTRAP_TOKEN"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.bootstrap_token.secret_id
            version = "latest"
          }
        }
      }
    }
  }

  // Image rollouts happen out of band (cloudbuild.yaml / gcloud run deploy);
  // Terraform owns the service shape, not the running tag.
  lifecycle {
    ignore_changes = [template[0].containers[0].image]
  }

  depends_on = [
    google_secret_manager_secret_iam_member.bootstrap_token_access,
    google_storage_bucket_iam_member.replica_rw,
  ]
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  count    = var.allow_unauthenticated ? 1 : 0
  location = google_cloud_run_v2_service.governor.location
  name     = google_cloud_run_v2_service.governor.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

// ---- IAP ----
// When IAP is on, the Cloud Run invoker is the IAP service agent (not the
// end user). End users are authorised at the IAP layer via
// roles/iap.httpsResourceAccessor.
resource "google_cloud_run_v2_service_iam_member" "iap_invoker" {
  count    = var.iap_enabled ? 1 : 0
  location = google_cloud_run_v2_service.governor.location
  name     = google_cloud_run_v2_service.governor.name
  role     = "roles/run.invoker"
  member   = local.iap_service_agent
}

// NOTE: project must be the numeric project number, not the project ID, or
// the binding silently no-ops (hashicorp/terraform-provider-google#23092).
resource "google_iap_web_cloud_run_service_iam_member" "members" {
  for_each               = var.iap_enabled ? toset(var.iap_members) : toset([])
  project                = var.project_number
  location               = google_cloud_run_v2_service.governor.location
  cloud_run_service_name = google_cloud_run_v2_service.governor.name
  role                   = "roles/iap.httpsResourceAccessor"
  member                 = each.value
  depends_on             = [google_project_service.apis]
}
