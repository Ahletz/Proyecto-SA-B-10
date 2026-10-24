# Proyecto-SA-B-10 — Bank USAC

Monorepo del proyecto de Software Avanzado (Fase 3: observabilidad, SLO y depósitos interbancarios).

## Arquitectura
Exactamente cinco microservicios: Customer, Account, Transaction, Payment y Notification & Audit. API Gateway como único punto de entrada. RabbitMQ para comunicación asíncrona entre microservicios. Una PostgreSQL independiente por microservicio, fuera del cluster (Docker Compose en desarrollo, Cloud SQL en producción).

La Fase 3 agrega:
- **Observabilidad:** OpenTelemetry en los cinco servicios y el Gateway, con OTel Collector, Prometheus, Tempo, Loki y Grafana (`observability/`), SLO con alertas y runbooks.
- **Depósitos interbancarios** con el banco pareja (BANK13) según el contrato OpenAPI del curso, con idempotencia, timeout, reversos y conciliación. `apps/interbank-mock` es un banco simulado (BANK99) para pruebas y escenarios de fallo.
- **Producción en GCP:** GKE (namespaces `prod` y `observability`), Cloud SQL y Cloud Run para el frontend, desplegados por pipeline.

## Estructura
| Ruta | Contenido |
|---|---|
| `apps/` | Los cinco microservicios, el Gateway, el frontend y `interbank-mock` |
| `k8s/` | Manifiestos Kustomize (`base`, `components/autoscaling`, `overlays/{dev,prod}`) |
| `observability/` | Stack de observabilidad, dashboards, alertas y runbooks |
| `infrastructure/` | Docker Compose, bases de datos y Terraform (GKE, Cloud SQL, Cloud Run) |
| `tests/` | E2E, carga (k6) y verificaciones de observabilidad |
| `docs/` | Documentación técnica |

## Inicio rápido (local)
```bash
./scripts/project/start-local.sh
./scripts/project/smoke-local.sh
```

Frontend: `http://localhost:3000`
Gateway: `http://localhost:8080`
RabbitMQ: `http://localhost:15672`
MailHog: `http://localhost:8025`

Kubernetes (kind):
```bash
./scripts/project/start-k8s.sh
./scripts/project/smoke-k8s.sh
```

Producción y desarrollo se despliegan solo por pipeline (`.github/workflows/`); ver [Despliegue](docs/04-despliegue/07-despliegue-fase3.md).

Documentación técnica: [`docs/README.md`](docs/README.md).
