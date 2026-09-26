# Payment Service

Microservicio (NestJS + TypeORM) que valida el pago de cada transferencia y simula un procesador de pagos externo (éxito, falla o timeout).

## Configuración

| Variable | Valor local |
|---|---|
| `PORT` | 3005 |
| `DB_HOST` / `DB_PORT` / `DB_DATABASE` | `localhost` / 5437 / `bank_payment` (PostgreSQL) |
| `RABBITMQ_URL` | `amqp://rabbit_user:rabbit_password@localhost:5672` (exchange `bank.events`, tipo topic) |
| `PAYMENT_MAX_AMOUNT` | 1000000 |
| `PAYMENT_SIMULATE_FAILURE_RATE` | 0.1 (10 % de fallas externas) |
| `PAYMENT_SIMULATE_TIMEOUT_RATE` | 0.05 (5 % de timeouts) |
| `PAYMENT_SIMULATE_TIMEOUT_MS` | 3000 |

## Endpoints REST

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/payments` | Lista el historial de pagos procesados |
| GET | `/api/payments/transaction/:id` | Consulta el pago de una transacción |
| GET | `/health` | Estado del servicio |

## Eventos

**Consume:** `account.funds.reserved` (dispara la validación del pago).

**Publica:** `payment.approved` o `payment.rejected` con `reason`:

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

Pruebas unitarias con Vitest: validación de monto y límite, idempotencia, simulación del procesador externo y reconexión a RabbitMQ. Detalle en `docs/testing/README.md`.
