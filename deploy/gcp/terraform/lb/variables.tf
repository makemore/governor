variable "project_id" {
  description = "GCP project ID hosting the Cloud Run service and the existing LB."
  type        = string
}

variable "region" {
  description = "Region of the Cloud Run service. Must match the base module."
  type        = string
}

variable "service_name" {
  description = "Cloud Run service name. Must match the base module."
  type        = string
  default     = "governor"
}

variable "domain" {
  description = "Custom hostname to terminate, e.g. gov.vibepolice.io."
  type        = string
}
