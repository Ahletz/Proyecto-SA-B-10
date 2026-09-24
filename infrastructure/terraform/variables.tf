variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "db_tier" {
  description = "Tier de m\u00e1quina para las instancias de Cloud SQL (free-tier friendly)"
  type        = string
  default     = "db-f1-micro"
}

variable "db_password" {
  description = "Password compartido para los usuarios de base de datos (Fase 2, entorno acad\u00e9mico)"
  type        = string
  sensitive   = true
}
