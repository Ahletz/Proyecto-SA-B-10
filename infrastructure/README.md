# Infraestructura

| Ruta | Contenido |
|---|---|
| `docker-compose.yml` | Entorno local: las cinco PostgreSQL (una por servicio), RabbitMQ, MailHog, los cinco microservicios, el Gateway y el frontend ([Docker Compose](../docs/04-despliegue/01-docker-compose.md)) |
| `databases/<servicio>/` | Migraciones SQL aditivas aplicadas a mano en bases existentes; las tablas base las crean los ORM ([Modelo de dominio](../docs/01-arquitectura/02-modelo-dominio.md#diagrama-entidad-relación)) |
| `broker/` | Notas del broker RabbitMQ ([README](broker/README.md)) |
| `terraform/` | Infraestructura de producción en GCP: VPC, Cloud SQL ×5, GKE, IP del Ingress, Artifact Registry y Cloud Run del frontend ([Terraform](../docs/04-despliegue/05-terraform-cloud-sql.md)) |

Producción se despliega solo por pipeline: la aplicación con `cd-prod.yml` y el stack de observabilidad (`observability/`) con `deploy-observability.yml` ([Despliegue](../docs/04-despliegue/07-despliegue-fase3.md)).
