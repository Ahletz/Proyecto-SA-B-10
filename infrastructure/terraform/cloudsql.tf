locals {
  services = {
    customer     = { db_name = "bank_customer",     db_user = "customer_user" }
    account      = { db_name = "bank_account",      db_user = "account_user" }
    transaction  = { db_name = "bank_transaction",  db_user = "transaction_user" }
    payment      = { db_name = "bank_payment",      db_user = "payment_user" }
    notification = { db_name = "bank_notification", db_user = "notification_user" }
  }
}

resource "google_sql_database_instance" "db" {
  for_each            = local.services
  name                = "bank-usac-${each.key}-db"
  database_version    = "POSTGRES_17"
  region              = var.region
  deletion_protection = false

  depends_on = [google_service_networking_connection.private_vpc_connection]

  settings {
    tier    = var.db_tier
    edition = "ENTERPRISE"
    ip_configuration {
      ipv4_enabled    = true
      private_network = google_compute_network.vpc.id
    }
    backup_configuration {
      enabled = false
    }
  }
}

resource "google_sql_database" "database" {
  for_each = local.services
  name     = each.value.db_name
  instance = google_sql_database_instance.db[each.key].name
}

resource "google_sql_user" "user" {
  for_each = local.services
  name     = each.value.db_user
  instance = google_sql_database_instance.db[each.key].name
  password = var.db_password
}
