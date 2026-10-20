# Permite que el pipeline deploy-observability cree los ClusterRole de
# Prometheus y kube-state-metrics (roles/container.developer no alcanza para RBAC).
resource "google_project_iam_member" "github_deployer_gke_admin" {
  project = var.project_id
  role    = "roles/container.admin"
  member  = "serviceAccount:${google_service_account.github_deployer.email}"
}
