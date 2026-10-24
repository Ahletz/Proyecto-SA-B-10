# Account Service

Microservicio (NestJS + TypeORM) responsable de las cuentas bancarias: creación por tipo, consulta de saldo, reserva y aplicación de fondos durante la Saga de transferencia, operaciones de los depósitos interbancarios (reserva, débito, crédito y reversos), detección de anomalías y desactivación automática de cuentas inactivas.

## Configuración

| Variable | Valor local (`.env.example`) |
|---|---|
| `PORT` | 3004 |
| `DB_HOST` / `DB_PORT` / `DB_DATABASE` | `localhost` / 5436 / `bank_account` (PostgreSQL) |
| `RABBITMQ_URL` | `amqp://rabbit_user:rabbit_password@localhost:5672` |
| `RABBITMQ_QUEUE` | `account-service.events` (exchange `bank.events`, tipo topic) |
| `RABBITMQ_PREFETCH` / `RABBITMQ_MAX_RETRIES` / `RABBITMQ_RETRY_DELAY_MS` | 10 / 3 / 3000 |
| `DB_POOL_MAX` | Conexiones por réplica a la base (4 en Kubernetes) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Por defecto, el OTel Collector del namespace `observability` |

## Endpoints REST

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/accounts` | Crea una cuenta (`customerId`, `type`, `initialBalance?`, `minBalance?`, `feeAmount?`) |
| GET | `/api/accounts?customerId=` | Lista las cuentas de un cliente |
| GET | `/api/accounts/:id` | Consulta una cuenta (saldo, reservado, disponible) |
| POST | `/api/accounts/maintenance/deactivate-inactive` | Ejecuta a mano la desactivación de cuentas inactivas |
| POST | `/internal/interbank/deposits/:id/cancel` | Interno: Payment decide la cancelación de un depósito recibido que venció o fue cancelado |
| GET | `/health` | Estado del servicio |

## Eventos

**Publica:** `account.created`, `account.funds.reserved`, `account.funds.rejected` (`INSUFFICIENT_FUNDS`, `ACCOUNT_NOT_FOUND_OR_INACTIVE`), `account.transfer.completed`, `account.funds.released`, `account.deactivated`, `account.anomaly.detected` y los eventos `account.interbank.*` del depósito interbancario.

**Consume:** `transaction.created` (reserva de fondos), `payment.approved` (aplica la transferencia), `payment.rejected` (libera la reserva: compensación) y `interbank.transfer.requested`, `.accepted`, `.rejected`, `.reversed`, `interbank.deposit.requested` e `interbank.reversal.requested`. Detalle en el [diseño interbancario](../../docs/interbank/diseno-interbancario.md).

## Reglas de negocio

- Tipos de cuenta: `MONETARY` y `SAVINGS`. `SAVINGS` tiene saldo mínimo 50 por defecto; `MONETARY`, 0.
- Comisión opcional por transferencia (`feeAmount`): se reserva junto con el monto.
- Disponible para transferir = `balance - reservedBalance - minBalance`. Si no alcanza para monto + comisión, se emite `account.funds.rejected` con `INSUFFICIENT_FUNDS`.
- Todos los días a medianoche se desactivan las cuentas activas con saldo menor a 50 y sin actividad en 6 meses.
- Cada operación de saldo corre en una transacción con la fila de la cuenta bloqueada (`FOR UPDATE`).
- Los depósitos interbancarios reservan monto más comisión antes de llamar al otro banco; un depósito recibido se acredita en una sola transacción y nunca si venció o fue cancelado.
- Los eventos entrantes son idempotentes (tabla `processed_events` por `eventId`); los fallos se reintentan y terminan en la DLQ.

## Observabilidad
OpenTelemetry (`src/tracing.ts`) envía trazas y métricas al Collector; los logs son JSON con `traceId` y `correlationId` (`src/common/json-logger.ts`). Métricas: `bank_operations_total`, `bank_operation_duration_seconds`, `bank_events_*` y `bank_anomalies_detected_total` ([catálogo](../../docs/observabilidad/catalogo-metricas.md)).

## Cómo correr localmente

```bash
npm ci
npm run start:dev
```

Requiere PostgreSQL y RabbitMQ (ver `infrastructure/docker-compose.yml` o `scripts/project/start-local.sh`).

## Pruebas

```bash
npm test
```

Pruebas unitarias con Vitest: creación por tipo (saldo mínimo, comisión), reserva y liberación de fondos, operaciones interbancarias, anomalías, idempotencia, telemetría y reconexión a RabbitMQ. Detalle en [`docs/testing/README.md`](../../docs/testing/README.md).
