# Cluster GKE de producción (namespace prod lo crea cd-prod.yml).
# Standard zonal en la misma VPC que Cloud SQL: el peering de Cloud SQL no es
# transitivo, así que el cluster debe estar en bank-usac-vpc para llegar a las
# IP privadas de las bases. VPC-native con los rangos secundarios de network.tf.

resource "google_project_service" "container" {
  service            = "container.googleapis.com"
  disable_on_destroy = false
}

resource "google_container_cluster" "gke" {
  name     = var.gke_cluster_name
  location = var.gke_zone

  network    = google_compute_network.vpc.id
  subnetwork = google_compute_subnetwork.subnet.id

  ip_allocation_policy {
    cluster_secondary_range_name  = "gke-pods"
    services_secondary_range_name = "gke-services"
  }

  # El node pool se administra aparte (google_container_node_pool.primary).
  remove_default_node_pool = true
  initial_node_count       = 1

  release_channel {
    channel = "REGULAR"
  }

  deletion_protection = false

  depends_on = [google_project_service.container]
}

resource "google_container_node_pool" "primary" {
  name     = "bank-usac-pool"
  location = var.gke_zone
  cluster  = google_container_cluster.gke.name

  # Cluster autoscaler: el HPA (hasta 5 réplicas por servicio) pide nodos nuevos.
  autoscaling {
    min_node_count = var.gke_min_nodes
    max_node_count = var.gke_max_nodes
  }

  management {
    auto_repair  = true
    auto_upgrade = true
  }

  node_config {
    machine_type = var.gke_machine_type
    disk_type    = "pd-standard"
    disk_size_gb = 30
    oauth_scopes = ["https://www.googleapis.com/auth/cloud-platform"]
  }
}

# Service account que usa cd-prod.yml (secrets.GCP_SA_KEY) para desplegar.
# La llave JSON se crea con gcloud para que no quede en el estado de Terraform.
resource "google_service_account" "github_deployer" {
  account_id   = "github-deployer"
  display_name = "GitHub Actions - cd-prod.yml"
}

resource "google_project_iam_member" "github_deployer_gke" {
  project = var.project_id
  role    = "roles/container.developer"
  member  = "serviceAccount:${google_service_account.github_deployer.email}"
}
