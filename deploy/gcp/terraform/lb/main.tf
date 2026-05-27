// Optional add-on: plug the Governor Cloud Run service into a pre-existing
// external HTTPS load balancer so it can serve from a custom domain
// (e.g. gov.vibepolice.io) instead of the raw run.app URL.
//
// What this module owns:
//   * Serverless NEG targeting the Cloud Run service
//   * Backend service wrapping that NEG
//   * Managed SSL certificate for the custom hostname
//
// What this module deliberately does NOT own:
//   * The forwarding rules, IP address, URL map, and HTTPS proxy of the
//     LB itself — those are assumed to be pre-existing (often hand-rolled
//     or owned by a different team's Terraform). Wiring the new backend
//     and cert in is a one-shot gcloud step documented in README.md.
//
// IAP placement: this module assumes IAP is already enabled directly on
// the Cloud Run service (the base module's iap_enabled = true). Cloud Run
// gates traffic from every ingress path — both the run.app URL and the
// LB — so there is no additional IAP wiring to do at the LB layer.

resource "google_compute_region_network_endpoint_group" "serverless" {
  name                  = "${var.service_name}-neg"
  region                = var.region
  network_endpoint_type = "SERVERLESS"
  cloud_run {
    service = var.service_name
  }
}

resource "google_compute_backend_service" "backend" {
  name                  = "${var.service_name}-backend"
  protocol              = "HTTP"
  port_name             = "http"
  timeout_sec           = 30
  load_balancing_scheme = "EXTERNAL_MANAGED"

  backend {
    group = google_compute_region_network_endpoint_group.serverless.id
  }

  // No health checks: serverless NEGs do not support them. The Cloud Run
  // service health is managed by the Cloud Run control plane, not by the
  // LB.
  log_config {
    enable      = true
    sample_rate = 1.0
  }
}

// Google-managed SSL certificate for the custom hostname. Validation is
// HTTP-01-style: Google issues the cert once the LB receives traffic for
// this hostname and the DNS A record resolves to the LB's IP. Provisioning
// typically takes 10–60 minutes after both conditions are met.
resource "google_compute_managed_ssl_certificate" "cert" {
  name = "${var.service_name}-cert"
  managed {
    domains = [var.domain]
  }
}
