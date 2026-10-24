# Payment Service

Microservicio (NestJS + TypeORM) que valida el pago de cada transferencia, simula un procesador de pagos externo (éxito, falla o timeout) y es la **única frontera con el banco pareja** en los depósitos interbancarios.

## Configuración

| Variable | Valor local |
|---|---|
| `PORT` | 3005 |
| `DB_HOST` / `DB_PORT` / `DB_DATABASE` | `localhost` / 5437 / `bank_payment` (PostgreSQL) |
| `RABBITMQ_URL` | `amqp://rabbit_user:rabbit_password@localhost:5672` (exchange `bank.events`, tipo topic) |
| `PAYMENT_MAX_AMOUNT` | 1000000 |
| `PAYMENT_SIMULATE_FAILURE_RATE` | 0.1 (10 % de fallas externas; 0 en producción) |
| `PAYMENT_SIMULATE_TIMEOUT_RATE` | 0.05 (5 % de timeouts; 0 en producción) |
| `PAYMENT_SIMULATE_TIMEOUT_MS` | 3000 |
| `INTERBANK_BANK_CODE` | Código de este banco (`BANK08`) |
| `INTERBANK_PARTNERS` | JSON con la URL y la API key de cada banco pareja (Secret) |
| `INTERBANK_HTTP_TIMEOUT_MS` | 5000 |
| `ADMIN_TOKEN` | Token de `/internal/payment-simulation` (Secret) |

## Endpoints REST

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/payments` | Lista el historial de pagos procesados |
| GET | `/api/payments/transaction/:id` | Consulta el pago de una transacción |
| GET, POST, DELETE | `/internal/payment-simulation` | Interno (`X-Admin-Token`): consulta, cambia y restablece la simulación del procesador (`failureRate`, `timeoutRate`, `timeoutMs`, `latencyMs`). El Gateway lo expone a ADMIN en `/api/admin/payment-simulation` |
| GET, POST | `/interbank/v1/*` | Contrato del curso para el banco pareja: `health`, `transfers`, `transfers/:id`, `transfers/:id/cancel`, `transfers/:id/result`, `reversals`, `reversals/:id` y `reconciliation`. Llega por el Gateway con `X-Api-Key` y `traceparent` |
| POST | `/internal/interbank/reconcile` | Interno: dispara la conciliación contra el banco pareja |
| GET | `/health` | Estado del servicio |

## Eventos

**Consume:** `account.funds.reserved` (dispara la validación del pago) y, del depósito interbancario, `account.interbank.funds.reserved`, `account.interbank.deposit.credited` / `.rejected` y `account.interbank.reversal.debited` / `.failed`.

**Publica:** `payment.approved` o `payment.rejected` con `reason`, y los eventos `interbank.transfer.*`, `interbank.deposit.requested` e `interbank.reversal.requested` del depósito interbancario ([diseño](../../docs/interbank/diseno-interbancario.md)):

| `reason` | Cuándo |
|---|---|
| `INVALID_AMOUNT` | Monto menor o igual a cero o no numérico |
| `PAYMENT_LIMIT_EXCEEDED` | Monto mayor a `PAYMENT_MAX_AMOUNT` |
| `EXTERNAL_FAILURE` | Falla simulada del procesador externo |
| `TIMEOUT` | Timeout simulado del procesador externo |

Transaction guarda estos motivos con prefijo `PAYMENT_` y la Saga compensa (libera la reserva en Account).

## Reglas de negocio

- El procesamiento es automático, disparado por eventos; no hay endpoint para crear pagos a mano.
- Un pago por transacción; los eventos entrantes son idempotentes (tabla `processed_events` por `eventId`).
- Depósito saliente: envía `POST /transfers` al otro banco con `Idempotency-Key` = `interbankTransferId`. Si el callback no llega antes de `expiresAt` (180 s), consulta y cancela, y mantiene la reserva hasta conocer el resultado.
- Depósito entrante: valida idempotencia (`200` si se repite igual, `409` si cambia el contenido, `422` si venció) y avisa el resultado al otro banco por callback con reintentos.
- Reversos y conciliación diaria contra cada banco pareja (`interbank.reconciliation_mismatch` ante una diferencia).

## Observabilidad
OpenTelemetry (`src/tracing.ts`) hacia el Collector, logs JSON con `traceId` y `correlationId`, y el `traceparent` se envía y se exige en todas las llamadas interbancarias. Métricas `bank_operations_total`, `bank_interbank_transfers_total` y `bank_interbank_reconciliation_mismatches_total` ([catálogo](../../docs/observabilidad/catalogo-metricas.md)); alertas `InterbankPartnerUnreachable` e `InterbankReconciliationMismatch`.

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

Pruebas unitarias con Vitest: validación de monto y límite, idempotencia, simulación del procesador externo, reglas y servicio interbancario, telemetría y reconexión a RabbitMQ. Detalle en [`docs/testing/README.md`](../../docs/testing/README.md).
