output "db_public_ips" {
  description = "IP p\u00fablica de cada instancia de Cloud SQL"
  value       = { for k, v in google_sql_database_instance.db : k => v.public_ip_address }
}

output "db_private_ips" {
  description = "IP privada de cada instancia de Cloud SQL (para conectar desde el cluster)"
  value       = { for k, v in google_sql_database_instance.db : k => v.private_ip_address }
}

output "gke_cluster_name" {
  description = "Valor para vars.GKE_CLUSTER"
  value       = google_container_cluster.gke.name
}

output "gke_location" {
  description = "Valor para vars.GKE_LOCATION"
  value       = google_container_cluster.gke.location
}

output "github_deployer_email" {
  description = "Service account para secrets.GCP_SA_KEY (crear la llave con gcloud)"
  value       = google_service_account.github_deployer.email
}
