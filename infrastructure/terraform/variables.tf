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

variable "gke_cluster_name" {
  description = "Nombre del cluster GKE (vars.GKE_CLUSTER en GitHub)"
  type        = string
  default     = "bank-usac-gke"
}

variable "gke_zone" {
  description = "Zona del cluster GKE zonal (vars.GKE_LOCATION en GitHub)"
  type        = string
  default     = "us-central1-a"
}

variable "gke_machine_type" {
  description = "Tipo de máquina de los nodos"
  type        = string
  default     = "e2-medium"
}

variable "gke_min_nodes" {
  description = "Mínimo de nodos del node pool (cluster autoscaler)"
  type        = number
  default     = 1
}

variable "gke_max_nodes" {
  description = "Máximo de nodos del node pool (cluster autoscaler)"
  type        = number
  default     = 3
}
