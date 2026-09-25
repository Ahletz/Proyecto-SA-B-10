# 9. C4 Nivel 2 — Contenedores Fase 2

## Propósito

El diagrama de contenedores abre el sistema Bank USAC del [C4 Nivel 1](07-c4-contexto-fase2.md) y muestra qué se despliega, dónde corre cada pieza y cómo llega el código hasta el cluster.

![C4 Nivel 2 — Contenedores](../assets/diagramas/c4-container.png)

Fuente Mermaid: [`c4-src/c4-container.mmd`](c4-src/c4-container.mmd).

## Contenedores

| Contenedor | Tecnología | Responsabilidad |
| ---------- | ---------- | --------------- |
| Frontend | React + TypeScript, servido con `serve` en `:3000` | Shell con menú por rol, transferencias con seguimiento de estado, historial y módulos de cada integrante |
| API Gateway | NestJS `:8080` | Único punto de entrada HTTP: JWT, roles, propiedad de cuentas, `X-Correlation-Id`. Publica `transaction.transfer.requested` |
| Customer | Spring Boot `:8081` | Registro, activación, login/JWT y estado KYC |
| Account | NestJS `:3004` | Cuentas monetarias y de ahorro, reservas, saldo mínimo y comisión |
| Transaction | NestJS `:3003` | Saga de transferencia, historial por cuenta y proyección local del KYC |
| Payment | NestJS `:3005` | Validación del pago y simulación del procesador externo (`SUCCESS`/`FAILURE`/`TIMEOUT`) |
| Notification & Audit | Spring Boot `:8082` | Auditoría de todos los eventos, correo y clasificación `INFO`/`WARNING`/`ERROR` |
| RabbitMQ | Exchange `bank.events` + `.retry` + `.dlx` | Único canal entre microservicios |
| MailHog | SMTP de desarrollo | Recibe los correos en `dev` |

## Eventos por contenedor

Entre microservicios no hay HTTP: la coordinación es por eventos (detalle en [contratos de eventos](../02-eventos/01-contratos-eventos.md)).

| Contenedor | Publica | Consume |
| ---------- | ------- | ------- |
| API Gateway | `transaction.transfer.requested` | — |
| Customer | `customer.*` (incluye `customer.kyc.status.changed`) | — |
| Transaction | `transaction.created`, `.completed`, `.failed`, `.compensated`, `.status.changed` | `transaction.transfer.requested`, `account.*`, `payment.*`, `customer.kyc.status.changed` |
| Account | `account.created`, `.deactivated`, `.funds.reserved`, `.funds.rejected`, `.funds.released`, `.transfer.completed` | `transaction.created`, `payment.approved`, `payment.rejected` |
| Payment | `payment.approved`, `payment.rejected` | `account.funds.reserved` |
| Notification & Audit | `notification.classified` | Todos los eventos |

## Despliegue

- **Kubernetes:** todos los contenedores de aplicación, RabbitMQ y MailHog corren en el cluster. El namespace `dev` es un cluster kind efímero que crea `cd-dev.yml` en cada merge a `develop`; `prod` será GKE (pendiente del Terraform de Integrante 2).
- **HPA:** los cinco microservicios escalan de 1 a 5 réplicas al 80 % de CPU, con rolling update `maxUnavailable: 0` / `maxSurge: 1` y probes HTTP.
- **Bases de datos fuera del cluster:** una PostgreSQL por servicio (data ownership). En `dev` corren con Docker Compose; en `prod` son Cloud SQL (PostgreSQL 17) con IP privada en la VPC `bank-usac-vpc`. Las credenciales llegan por `bank-db-config` y `bank-db-secret`.
- **CI/CD:** GitHub Actions construye las imágenes y las publica en GHCR con tag `sha-<commit>` (dev) o `vX.Y.Z` (release), nunca `latest`. El cluster despliega esas imágenes versionadas. Ver [CI/CD](../04-despliegue/04-ci-cd.md).

## Cambios respecto de Fase 1

- Pipeline CI/CD y registry GHCR con imágenes versionadas.
- Namespaces `dev`/`prod`, HPA y rolling update.
- Bases de datos fuera del cluster (Cloud SQL en producción).
- Proyección KYC en Transaction alimentada por `customer.kyc.status.changed`.
- Pago externo simulado en Payment y `notification.classified` en Notification & Audit.
- `transaction.status.changed` para el historial y la auditoría.
