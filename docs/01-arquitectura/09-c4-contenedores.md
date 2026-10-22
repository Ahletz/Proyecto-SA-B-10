# 9. C4 Nivel 2 — Contenedores

## Propósito

El diagrama de contenedores abre el sistema Bank USAC del [C4 Nivel 1](07-c4-contexto-fase2.md) y muestra qué se despliega, dónde corre cada pieza y cómo se comunica: la aplicación, el stack de observabilidad, la entrada HTTPS para el banco pareja (BANK13) y su simulador (BANK99).

![C4 Nivel 2 — Contenedores](../assets/diagramas/c4-container-fase3.png)

Fuente Mermaid: [`c4-src/c4-container-fase3.mmd`](c4-src/c4-container-fase3.mmd).

## Contenedores de la aplicación (namespace `prod`)

| Contenedor | Tecnología | Responsabilidad |
| ---------- | ---------- | --------------- |
| Frontend | React + TypeScript, nginx en Cloud Run | Menú por rol, transferencias con seguimiento de estado, página **Otro banco** (`/interbank`) para depósitos interbancarios, historial y auditoría. Muestra el `correlationId` y el `traceId` de cada operación. nginx reenvía `/api` al Gateway |
| Ingress HTTPS | GKE Ingress `gce` + `ManagedCertificate`, IP global `35.244.157.47` | Entrada **solo HTTPS** del banco pareja: `https://35-244-157-47.sslip.io/interbank/v1` |
| API Gateway | NestJS `:8080`, HPA de 1 a 3 réplicas | Único punto de entrada HTTP: JWT, roles, propiedad de cuentas y `X-Correlation-Id`. Publica `transaction.transfer.requested` y `transaction.interbank.requested`. Expone `/interbank/v1/*` hacia Payment con `X-Api-Key` y `traceparent` obligatorio, y `/api/admin/payment-simulation` (ADMIN). Responde 503 si un servicio interno no contesta en 5 s |
| Customer | Spring Boot `:8081` | Registro, activación, login/JWT y estado KYC |
| Account | NestJS `:3004` | Cuentas monetarias y de ahorro, reservas, saldo mínimo y comisión; reserva, débito y crédito interbancarios. Cada operación de saldo corre en una transacción con la fila bloqueada (`FOR UPDATE`) |
| Transaction | NestJS `:3003` | Saga de la transferencia interna y del depósito interbancario (`PENDING/SENT/TIMEOUT/ACCEPTED/REJECTED/REVERSED`), historial por cuenta y proyección local del KYC |
| Payment | NestJS `:3005` | Procesador externo simulado (`SUCCESS`/`FAILURE`/`TIMEOUT`, ajustable en caliente) y conector con el banco pareja: envío, consulta, cancelación, callbacks, reversos y conciliación |
| Notification & Audit | Spring Boot `:8082` | Auditoría de todos los eventos, correo y clasificación `INFO`/`WARNING`/`ERROR` |
| interbank-mock | Node `:3010`, `BANK99` | Banco pareja simulado con el mismo contrato OpenAPI; modos `accept`, `reject`, `no-callback` y `down`, latencia y retraso del callback |
| RabbitMQ | Exchange `bank.events` + `.retry` + `.dlx` | Único canal entre microservicios. Expone métricas en `:15692` para el consumer lag |
| MailHog | SMTP de demostración | Recibe los correos |

Los cinco microservicios escalan con HPA de 1 a 5 réplicas al 80 % de CPU, con un pool de **4 conexiones** a la base por réplica: 5 réplicas × 4 = 20 conexiones, por debajo de las ~25 de `db-f1-micro`.

## Stack de observabilidad (namespace `observability`)

| Contenedor | Rol |
| ---------- | --- |
| OpenTelemetry Collector | Recibe OTLP (`:4317`/`:4318`) de los servicios: trazas a Tempo y métricas a Prometheus (`:8889`) |
| otel-logs-agent (DaemonSet) | Lee los logs JSON de los contenedores de `prod` y `dev` y los envía a Loki con `service_name`, `traceId` y `correlation_id` |
| Tempo | Almacena las trazas. Una transferencia completa es **una sola traza**, porque `traceparent` viaja por HTTP, por los headers AMQP y hacia y desde el banco pareja |
| Prometheus | Métricas de negocio (`bank_*`), HTTP, RabbitMQ, kube-state-metrics y cAdvisor; reglas de SLO y alertas |
| Loki | Logs centralizados; se consultan por `traceId` desde una traza |
| Grafana | Dashboards y alertas versionados en `observability/dashboards` y `observability/alerts` |
| kube-state-metrics | Réplicas del HPA, pods y despliegues (anotaciones de despliegue) |

## Eventos por contenedor

Entre microservicios no hay HTTP: la coordinación es por eventos (detalle en [contratos de eventos](../02-eventos/01-contratos-eventos.md) y, para los interbancarios, en el [diseño interbancario](../interbank/diseno-interbancario.md)).

| Contenedor | Publica | Consume |
| ---------- | ------- | ------- |
| API Gateway | `transaction.transfer.requested`, `transaction.interbank.requested` | — |
| Customer | `customer.*` (incluye `customer.kyc.status.changed`) | — |
| Transaction | `transaction.created`, `.completed`, `.failed`, `.compensated`, `.status.changed`; `interbank.transfer.requested` | `transaction.transfer.requested`, `transaction.interbank.requested`, `account.*`, `payment.*`, `interbank.transfer.*`, `account.interbank.*`, `customer.kyc.status.changed` |
| Account | `account.created`, `.deactivated`, `.funds.reserved`, `.funds.rejected`, `.funds.released`, `.transfer.completed`, `account.interbank.*`, `account.anomaly.detected` | `transaction.created`, `payment.approved`, `payment.rejected`, `interbank.*` |
| Payment | `payment.approved`, `payment.rejected`, `interbank.transfer.*`, `interbank.deposit.requested`, `interbank.reversal.requested` | `account.funds.reserved`, `account.interbank.*` |
| Notification & Audit | `notification.classified` | Todos los eventos |

## Flujos que cruzan contenedores

- **Transferencia interna:** Frontend → Gateway → `transaction.transfer.requested` → Transaction, Account y Payment por RabbitMQ. Ver [Saga de transferencia](../03-saga/01-saga-transferencia.md).
- **Depósito saliente:** Frontend → Gateway → `transaction.interbank.requested` → Transaction → Account (reserva) → Payment → banco pareja → callback por el Ingress y el Gateway → Payment → Account → Transaction. Ver [Depósito interbancario](../03-saga/02-deposito-interbancario.md).
- **Depósito entrante:** banco pareja → Ingress → Gateway (`X-Api-Key`) → Payment → Account → callback de Payment al banco pareja.
- **Telemetría:** los servicios envían trazas y métricas por OTLP al Collector y escriben logs por stdout, que el agente lleva a Loki. Prometheus además scrapea RabbitMQ, kube-state-metrics y cAdvisor.

## Despliegue

- **Kubernetes:** la aplicación corre en GKE (`bank-usac-gke`, namespace `prod`), desplegada por `cd-prod.yml`; el stack de observabilidad, en el namespace `observability`, por `deploy-observability.yml`. El namespace `dev` es un cluster kind efímero que crea `cd-dev.yml` en cada merge a `develop`.
- **Frontend en producción:** fuera del cluster, en Cloud Run (`bank-usac-frontend`).
- **Bases de datos fuera del cluster:** una PostgreSQL por servicio (data ownership). En `dev` corren con Docker Compose; en `prod` son Cloud SQL (PostgreSQL 17) con IP privada en la VPC `bank-usac-vpc`.
- **CI/CD:** GitHub Actions publica las imágenes en GHCR con tag `sha-<commit>` (dev) o `vX.Y.Z` (release), nunca `latest`. Ver [CI/CD](../04-despliegue/04-ci-cd.md) y [Despliegue](../04-despliegue/07-despliegue-fase3.md).

Ver también el [catálogo de métricas](../observabilidad/catalogo-metricas.md).
