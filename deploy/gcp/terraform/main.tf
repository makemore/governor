// Governor on Google Cloud: Cloud Run for compute, GCS for Litestream
// replication, Secret Manager for the bootstrap token, Artifact Registry
// for the image. Single-instance pinned (--max-instances=1) because the
// underlying SQLite store is single-writer; see deploy/gcp/README.md for
// the architectural rationale.

locals {
  bucket_name = "${var.project_id}-${var.service_name}-replica"
}

// ---- APIs ----
resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "storage.googleapis.com",
    "secretmanager.googleapis.com",
    "cloudbuild.googleapis.com",
  ])
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
