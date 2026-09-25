# Diagrama de Despliegue

Este diagrama muestra dónde corre cada parte de Bank USAC en los dos entornos: desarrollo (Kubernetes local con kind) y producción (GCP). El paso de uno a otro es solo por pipeline (CI/CD). Detalle de cada pieza en [CI/CD](../04-despliegue/04-ci-cd.md) y [Terraform](../04-despliegue/05-terraform-cloud-sql.md).

## Entorno de desarrollo

- **Cluster Kubernetes kind.** En local (`scripts/project/start-k8s.sh`) usa el namespace `bank-usac` con imágenes `:local`. En el pipeline (`cd-dev.yml`) se crea un cluster kind efímero en el runner y se despliega en el namespace **`dev`** con las imágenes `sha-<commit>` de GHCR.
- **Pods dentro del cluster:** API Gateway, Frontend, Customer, Account, Transaction, Payment, Notification & Audit y **RabbitMQ** (`k8s/broker`). Los cinco microservicios tienen HPA al 80 % de CPU en el namespace `dev`.
- **Bases de datos fuera del cluster:** cinco PostgreSQL en Docker Compose (`bank_customer`, `bank_account`, `bank_transaction`, `bank_payment`, `bank_notification`), cada una accedida solo por su microservicio. Los pods llegan a ellas por la IP del host.
- **Cliente:** navegador → Frontend (NodePort `30000`) y API Gateway (NodePort `30080`) por HTTP.

## Entorno de producción (GCP)

Todo lo crea Terraform (`infrastructure/terraform`), dentro de la VPC **`bank-usac-vpc`** (`us-central1`):

- **Cluster GKE `bank-usac-gke`** (Standard zonal, `us-central1-a`, nodos `e2-medium` con autoscaler de 1 a 3), namespace **`prod`**. `cd-prod.yml` despliega ahí las imágenes `vX.Y.Z` en cada merge a `main`.
- **Pods en `prod`:** API Gateway (Service `LoadBalancer`, la única entrada pública), Customer, Account, Transaction, Payment, Notification & Audit (los cinco con HPA al 80 % de CPU) y RabbitMQ.
- **Bases de datos fuera del cluster: Cloud SQL**, una instancia PostgreSQL 17 por microservicio (`bank-usac-<servicio>-db`), con IP privada en la misma VPC. Cada servicio se conecta solo a la suya por JDBC/PostgreSQL privado; las IP salen del output `db_private_ips` de Terraform.
- **Frontend fuera del cluster**, en Cloud Run o una VM: el navegador lo carga desde ahí y consume la API del Gateway por su IP pública (`PROD_API_BASE_URL`).

## Restricciones respetadas

- Ningún microservicio llama a otro directamente: toda la comunicación entre microservicios pasa por RabbitMQ (AMQP). El Gateway solo publica el comando inicial y hace proxy HTTP de consultas.
- Las bases de datos viven fuera del cluster en los dos entornos (Docker Compose en desarrollo, Cloud SQL en producción).
- Cada microservicio accede únicamente a su propia base de datos.
- Producción no se toca a mano: solo `cd-prod.yml` despliega, con imágenes versionadas (nunca `latest`).

![Diagrama de Despliegue](../assets/diagramas/deployment-fase2.png)

Fuente Mermaid: [`c4-src/deployment.mmd`](../01-arquitectura/c4-src/deployment.mmd). Para regenerar el PNG:

```bash
docker run --rm -u "$(id -u):$(id -g)" -v "$PWD/docs":/data minlag/mermaid-cli \
  -i /data/01-arquitectura/c4-src/deployment.mmd -o /data/assets/diagramas/deployment-fase2.png -s 4 -b white
```
