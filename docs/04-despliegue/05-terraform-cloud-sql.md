# Terraform — Infraestructura de producción en GCP (Fase 2)

Toda la infraestructura de producción se crea con Terraform desde `infrastructure/terraform/`: red, bases de datos (Cloud SQL), cluster de Kubernetes (GKE) y lo que usa el frontend en Cloud Run (Artifact Registry y permisos). Nada se crea a mano en la consola, salvo el bucket del estado (ver [Estado remoto](#estado-remoto)). Las decisiones y sus trade-offs están en los ADR-009 a ADR-012 de [Decisiones de arquitectura](../01-arquitectura/05-decisiones-arquitectura.md).

## Qué provisiona

| Archivo | Recurso | Qué es |
| ------- | ------- | ------ |
| `network.tf` | `google_compute_network.vpc` | VPC `bank-usac-vpc`, sin subredes automáticas |
| `network.tf` | `google_compute_subnetwork.subnet` | Subred `bank-usac-subnet` `10.10.0.0/24` en `us-central1`, con rangos secundarios `gke-pods` (`10.20.0.0/16`) y `gke-services` (`10.30.0.0/20`) para el cluster VPC-native |
| `network.tf` | `google_compute_global_address.private_ip_range` + `google_service_networking_connection.private_vpc_connection` | Rango `/16` reservado y peering con Service Networking para que Cloud SQL tenga IP privada dentro de la VPC |
| `cloudsql.tf` | `google_sql_database_instance.db` (×5) | Una instancia PostgreSQL 17 por microservicio (`bank-usac-<servicio>-db`), edición Enterprise, tier `db-f1-micro`, con IP privada en la VPC |
| `cloudsql.tf` | `google_sql_database.database` / `google_sql_user.user` (×5) | Base y usuario de cada servicio (ver [Usuarios y bases de datos](#usuarios-y-bases-de-datos)) |
| `gke.tf` | `google_project_service.container` | Habilita la API de Kubernetes Engine |
| `gke.tf` | `google_container_cluster.gke` | Cluster `bank-usac-gke`, Standard **zonal** en `us-central1-a`, en `bank-usac-vpc`, canal `REGULAR`. El node pool por defecto se elimina |
| `gke.tf` | `google_container_node_pool.primary` | Node pool `bank-usac-pool`: `e2-medium`, disco `pd-standard` de 30 GB, cluster autoscaler de 1 a 3 nodos, auto-repair y auto-upgrade |
| `gke.tf` | `google_service_account.github_deployer` + `google_project_iam_member.github_deployer_gke` | Service account `github-deployer` con `roles/container.developer`, que usa `cd-prod.yml` para desplegar |
| `frontend.tf` | `google_project_service.run` / `.artifactregistry` | Habilita las API de Cloud Run y Artifact Registry |
| `frontend.tf` | `google_artifact_registry_repository.images` | Repositorio Docker `bank-usac` en `us-central1`, donde `cd-prod.yml` copia `frontend:vX.Y.Z` (Cloud Run no descarga de GHCR) |
| `frontend.tf` | `google_service_account.frontend_run` | Identidad sin roles con la que corre el servicio Cloud Run `bank-usac-frontend` |
| `frontend.tf` | IAM de `github-deployer` | `roles/artifactregistry.writer` en el repositorio, `roles/run.admin` y `roles/iam.serviceAccountUser` sobre `frontend-run`, para publicar la imagen y desplegar |

El cluster va en la **misma VPC** que Cloud SQL porque el peering de Cloud SQL no es transitivo: desde otra VPC no se llegaría a las IP privadas de las bases.

## Variables

| Variable | Default | Uso |
| -------- | ------- | --- |
| `project_id` | — (en `terraform.tfvars`) | Proyecto de GCP |
| `region` | `us-central1` | Región de la subred y de Cloud SQL |
| `db_tier` | `db-f1-micro` | Tier de las instancias de Cloud SQL |
| `db_password` | — (**sensible**) | Contraseña de los 5 usuarios de base de datos. No se guarda en git: se pasa con `TF_VAR_db_password` |
| `gke_cluster_name` | `bank-usac-gke` | Nombre del cluster |
| `gke_zone` | `us-central1-a` | Zona del cluster zonal |
| `gke_machine_type` | `e2-medium` | Tipo de máquina de los nodos |
| `gke_min_nodes` / `gke_max_nodes` | `1` / `3` | Límites del cluster autoscaler |

## Outputs

| Output | Para qué |
| ------ | -------- |
| `db_private_ips` | Mapa `servicio → IP privada`. Es la variable `PROD_DB_PRIVATE_IPS` de GitHub (`terraform output -json db_private_ips`) |
| `db_public_ips` | Mapa `servicio → IP pública`, solo para depuración (sin redes autorizadas, no acepta conexiones) |
| `gke_cluster_name` | Variable `GKE_CLUSTER` de GitHub |
| `gke_location` | Variable `GKE_LOCATION` de GitHub |
| `github_deployer_email` | Service account para crear la llave de `GCP_SA_KEY` |
| `frontend_registry` | Variable `GAR_REPOSITORY` de GitHub (`us-central1-docker.pkg.dev/<proyecto>/bank-usac`) |
| `frontend_run_service_account` | Variable `FRONTEND_RUN_SA` de GitHub |

Las IP cambian en cada `apply` desde cero: siempre se leen de los outputs, no se copian en la documentación ni en los manifiestos.

## Estado remoto

El estado vive en un bucket de Cloud Storage (`versions.tf`), para que cualquier integrante con acceso al proyecto trabaje sobre la misma infraestructura:

```hcl
backend "gcs" {
  bucket = "bank-usac-tfstate-elevated-range-509623-j8"
  prefix = "terraform/state"
}
```

El bucket es lo único que no crea este Terraform (el backend tiene que existir antes de `terraform init`). Se crea una sola vez:

```bash
gcloud storage buckets create gs://bank-usac-tfstate-elevated-range-509623-j8 \
  --location=us-central1 --uniform-bucket-level-access
gcloud storage buckets update gs://bank-usac-tfstate-elevated-range-509623-j8 --versioning
```

El versionado permite recuperar un estado anterior si un `apply` falla a medias.

## Procedimiento de despliegue

Lo más simple es **Cloud Shell**, que ya trae `gcloud`, `terraform` y `git`.

1. Seleccionar el proyecto y habilitar las APIs:
   ```bash
   gcloud config set project elevated-range-509623-j8
   gcloud services enable compute.googleapis.com servicenetworking.googleapis.com \
     sqladmin.googleapis.com container.googleapis.com iam.googleapis.com \
     run.googleapis.com artifactregistry.googleapis.com
   ```
2. Aplicar (unos 20–30 min: 5 Cloud SQL + GKE):
   ```bash
   cd infrastructure/terraform
   export TF_VAR_db_password='<contraseña>'
   terraform init
   terraform plan
   terraform apply
   ```
3. Crear la llave de la service account para GitHub. No se crea en Terraform para que no quede en el estado:
   ```bash
   gcloud iam service-accounts keys create key.json \
     --iam-account="$(terraform output -raw github_deployer_email)"
   ```
   Pegar el contenido en el secret `GCP_SA_KEY` y **borrar** `key.json`.
4. Configurar GitHub (Settings → Secrets and variables → Actions), según [CI/CD — Producción](04-ci-cd.md#producción):
   - Secrets: `GCP_SA_KEY`, `PROD_DB_PASSWORD` (la misma de `TF_VAR_db_password`), `GHCR_PULL_TOKEN`.
   - Variables: `GKE_CLUSTER`, `GKE_LOCATION`, `PROD_DB_PRIVATE_IPS`, `GAR_REPOSITORY`, `FRONTEND_RUN_SA` (de los outputs).
5. A partir de aquí, producción se despliega solo por pipeline: rama `release/X.Y.Z` → tag `vX.Y.Z` → merge a `main` → `cd-prod.yml`.

Para borrar todo después de la calificación: `terraform destroy` (el bucket del estado se borra aparte).

## Usuarios y bases de datos

Mismos nombres que en `infrastructure/docker-compose.yml` (entorno local), una base y un usuario por servicio, sin acceso cruzado:

| Servicio | Instancia | Base | Usuario |
| -------- | --------- | ---- | ------- |
| Customer | `bank-usac-customer-db` | `bank_customer` | `customer_user` |
| Account | `bank-usac-account-db` | `bank_account` | `account_user` |
| Transaction | `bank-usac-transaction-db` | `bank_transaction` | `transaction_user` |
| Payment | `bank-usac-payment-db` | `bank_payment` | `payment_user` |
| Notification & Audit | `bank-usac-notification-db` | `bank_notification` | `notification_user` |
