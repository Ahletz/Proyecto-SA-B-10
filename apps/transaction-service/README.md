# Transaction Service

Microservicio (NestJS + TypeORM) dueño del ciclo de vida de cada transferencia y de la Saga por coreografía: crea la transacción, valida el KYC con una proyección local y cambia de estado según los eventos de Account y Payment. También lleva el estado de los depósitos a otro banco (`interbankState`). No ejecuta lógica de saldos ni de pagos.

## Configuración

| Variable | Valor local (`.env.example`) |
|---|---|
| `PORT` | 3003 |
| `DB_HOST` / `DB_PORT` / `DB_DATABASE` | `localhost` / 5434 / `bank_transaction` (PostgreSQL) |
| `RABBITMQ_URL` | `amqp://rabbit_user:rabbit_password@localhost:5672` |
| `RABBITMQ_EXCHANGE` / `RABBITMQ_QUEUE` | `bank.events` / `transaction-service.events` |
| `RABBITMQ_RETRY_EXCHANGE` / `RABBITMQ_DLX` | `bank.events.retry` / `bank.events.dlx` |
| `RABBITMQ_PREFETCH` / `RABBITMQ_MAX_RETRIES` / `RABBITMQ_RETRY_DELAY_MS` | 10 / 3 / 5000 |
| `DB_POOL_MAX` | Conexiones por réplica a la base (4 en Kubernetes) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Por defecto, el OTel Collector del namespace `observability` |

## Endpoints REST

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/transactions?accountId=` | Historial de una cuenta (origen o destino) con filtros `from`, `to`, `status`, `page` y `size` |
| GET | `/api/transactions/correlation/:correlationId` | Estado de una transferencia por su `correlationId` (lo usa el Gateway para el seguimiento) |
| GET | `/api/transactions/:transactionId` | Consulta una transacción |
| GET | `/health` | Estado del servicio |

## Eventos

**Publica:** `transaction.created`, `transaction.completed`, `transaction.failed`, `transaction.compensated`, `transaction.status.changed` e `interbank.transfer.requested`. Los `eventId` son deterministas y cada evento lleva `causationId`.

**Consume:** `transaction.transfer.requested`, `transaction.interbank.requested`, `account.funds.reserved`, `account.funds.rejected`, `payment.rejected`, `account.transfer.completed`, `account.transfer.failed`, `account.funds.released`, `customer.kyc.status.changed` y los eventos `account.interbank.*` e `interbank.transfer.*` del depósito. Lista completa en la [topología RabbitMQ](../../docs/02-eventos/02-topologia-rabbitmq.md).

## Reglas de negocio

- Estados internos: `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, `COMPENSATING` y `COMPENSATED`. Estado público: `PENDING`, `APPROVED` o `FAILED` (ver la [Saga](../../docs/03-saga/01-saga-transferencia.md)).
- Solo un cliente con KYC `VERIFIED` puede transferir; sin registro en la proyección `customer_kyc_status` cuenta como `PENDING` (`KYC_NOT_VERIFIED`).
- Depósito interbancario: `interbankState` pasa por `PENDING`, `SENT`, `TIMEOUT`, `ACCEPTED`, `REJECTED` o `REVERSED`; un estado final nunca se sobrescribe con uno anterior ([Saga interbancaria](../../docs/03-saga/02-deposito-interbancario.md)).
- Idempotencia por `eventId` (`processed_events`); un evento fuera de orden falla y se reintenta desde la cola `.retry` hasta 3 veces, luego va a la DLQ.

## Observabilidad
OpenTelemetry (`src/tracing.ts`) hacia el Collector y logs JSON con `traceId` y `correlationId`. Abre los spans `transaction.saga.start` y `transaction.saga.compensate` y mide `bank_transfer_duration_seconds{type,outcome}` y `bank_operations_total` ([catálogo](../../docs/observabilidad/catalogo-metricas.md)).

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

Pruebas unitarias con Vitest: consumidor de la Saga, proyección KYC, historial, publicación de eventos y estados. Detalle en [`docs/testing/README.md`](../../docs/testing/README.md).
