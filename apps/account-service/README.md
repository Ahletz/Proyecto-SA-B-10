# Account Service

Microservicio (NestJS + TypeORM) responsable de las cuentas bancarias: creación por tipo, consulta de saldo, reserva y aplicación de fondos durante la Saga de transferencia, y desactivación automática de cuentas inactivas.

## Configuración

| Variable | Valor local (`.env.example`) |
|---|---|
| `PORT` | 3004 |
| `DB_HOST` / `DB_PORT` / `DB_DATABASE` | `localhost` / 5436 / `bank_account` (PostgreSQL) |
| `RABBITMQ_URL` | `amqp://rabbit_user:rabbit_password@localhost:5672` |
| `RABBITMQ_QUEUE` | `account-service.events` (exchange `bank.events`, tipo topic) |
| `RABBITMQ_PREFETCH` / `RABBITMQ_MAX_RETRIES` / `RABBITMQ_RETRY_DELAY_MS` | 10 / 3 / 3000 |

## Endpoints REST

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/accounts` | Crea una cuenta (`customerId`, `type`, `initialBalance?`, `minBalance?`, `feeAmount?`) |
| GET | `/api/accounts?customerId=` | Lista las cuentas de un cliente |
| GET | `/api/accounts/:id` | Consulta una cuenta (saldo, reservado, disponible) |
| POST | `/api/accounts/maintenance/deactivate-inactive` | Ejecuta a mano la desactivación de cuentas inactivas |
| GET | `/health` | Estado del servicio |

## Eventos

**Publica:** `account.created`, `account.funds.reserved`, `account.funds.rejected` (`INSUFFICIENT_FUNDS`, `ACCOUNT_NOT_FOUND_OR_INACTIVE`), `account.transfer.completed`, `account.funds.released`, `account.deactivated`.

**Consume:** `transaction.created` (reserva de fondos), `payment.approved` (aplica la transferencia), `payment.rejected` (libera la reserva: compensación).

## Reglas de negocio

- Tipos de cuenta: `MONETARY` y `SAVINGS`. `SAVINGS` tiene saldo mínimo 50 por defecto; `MONETARY`, 0.
- Comisión opcional por transferencia (`feeAmount`): se reserva junto con el monto.
- Disponible para transferir = `balance - reservedBalance - minBalance`. Si no alcanza para monto + comisión, se emite `account.funds.rejected` con `INSUFFICIENT_FUNDS`.
- Todos los días a medianoche se desactivan las cuentas activas con saldo menor a 50 y sin actividad en 6 meses.
- Los eventos entrantes son idempotentes (tabla `processed_events` por `eventId`); los fallos se reintentan y terminan en la DLQ.

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

Pruebas unitarias con Vitest: creación por tipo (saldo mínimo, comisión), reserva y liberación de fondos, idempotencia y reconexión a RabbitMQ. Detalle en `docs/testing/README.md`.
