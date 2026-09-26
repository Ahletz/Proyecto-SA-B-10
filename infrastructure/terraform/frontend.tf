# Frontend de producción en Cloud Run (fuera del cluster).
# Terraform crea el registro, la identidad del servicio y los permisos; el servicio
# Cloud Run lo crea y actualiza cd-prod.yml con `gcloud run deploy` en cada release
# (así la versión de la imagen la controla el pipeline y no queda desfasada aquí).
#
# Cloud Run no descarga de GHCR: cd-prod.yml copia la imagen frontend:vX.Y.Z de GHCR
# a este Artifact Registry con el mismo tag (no se reconstruye).

resource "google_project_service" "run" {
  service            = "run.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "artifactregistry" {
  service            = "artifactregistry.googleapis.com"
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "images" {
  location      = var.region
  repository_id = "bank-usac"
  format        = "DOCKER"
  description   = "Imágenes versionadas que usa Cloud Run (frontend)"

  depends_on = [google_project_service.artifactregistry]
}

# Identidad con la que corre el servicio Cloud Run: sin roles, solo sirve archivos
# estáticos y reenvía /api al Gateway.
resource "google_service_account" "frontend_run" {
  account_id   = "frontend-run"
  display_name = "Cloud Run - frontend"
}

# Permisos de github-deployer (secrets.GCP_SA_KEY) para publicar y desplegar el frontend.
resource "google_artifact_registry_repository_iam_member" "github_deployer_push" {
  location   = google_artifact_registry_repository.images.location
  repository = google_artifact_registry_repository.images.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.github_deployer.email}"
}

# run.admin: crear/actualizar el servicio y permitir el acceso público (allUsers).
resource "google_project_iam_member" "github_deployer_run" {
  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.github_deployer.email}"
}

resource "google_service_account_iam_member" "github_deployer_act_as_frontend" {
  service_account_id = google_service_account.frontend_run.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.github_deployer.email}"
}
