output "db_public_ips" {
  description = "IP p\u00fablica de cada instancia de Cloud SQL"
  value       = { for k, v in google_sql_database_instance.db : k => v.public_ip_address }
}

output "db_private_ips" {
  description = "IP privada de cada instancia de Cloud SQL (para conectar desde el cluster)"
  value       = { for k, v in google_sql_database_instance.db : k => v.private_ip_address }
}
