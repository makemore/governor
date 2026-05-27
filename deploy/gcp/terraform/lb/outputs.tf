output "backend_service_name" {
  description = "Name of the backend service. Pass to `gcloud compute url-maps add-path-matcher --default-service=...`."
  value       = google_compute_backend_service.backend.name
}

output "cert_name" {
  description = "Name of the managed SSL certificate. Pass to `gcloud compute target-https-proxies update --ssl-certificates=...`."
  value       = google_compute_managed_ssl_certificate.cert.name
}

output "neg_name" {
  description = "Name of the serverless NEG."
  value       = google_compute_region_network_endpoint_group.serverless.name
}

output "next_steps" {
  description = "Copy-pasteable gcloud commands to wire the new backend and cert into the existing LB."
  value       = <<EOT
# 1. Add gov.vibepolice.io as a host rule on the existing URL map:
gcloud compute url-maps add-path-matcher EXISTING_URL_MAP_NAME \
  --project=${var.project_id} \
  --path-matcher-name=${var.service_name} \
  --new-hosts=${var.domain} \
  --default-service=${google_compute_backend_service.backend.name}

# 2. Attach the new managed cert to the existing HTTPS target proxy
#    (preserve any existing certs by listing them too):
gcloud compute target-https-proxies update EXISTING_HTTPS_PROXY_NAME \
  --project=${var.project_id} \
  --ssl-certificates=EXISTING_CERT_NAME,${google_compute_managed_ssl_certificate.cert.name}

# 3. Add the DNS A record at your registrar:
#      ${var.domain}  A  <existing LB IP>
EOT
}
