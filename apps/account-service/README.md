# Account Service

Microservicio responsable de la gestión de cuentas bancarias: creación, consulta de saldo, reserva y aplicación de fondos durante transferencias, y desactivación automática de cuentas inactivas.

## Configuración

| Variable | Valor |
|---|---|
| Puerto | 8083 |
| Base de datos | `bank_account` (PostgreSQL, puerto 5436) |
| Broker | RabbitMQ (`bank.events`, tipo topic) |

## Endpoints REST

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/accounts` | Crea una cuenta nueva |
| GET | `/api/accounts/{id}/balance` | Consulta el saldo disponible de una cuenta |
| GET | `/api/accounts/customer/{customerId}` | Lista las cuentas de un cliente |

## Eventos

**Publica:**
- `account.funds.reserved` — cuando se reservan fondos para una transferencia

**Consume:**
- `transaction.created` — dispara la reserva de fondos
- `payment.approved` — aplica la transferencia real
- `payment.rejected` — libera los fondos reservados (compensación)

## Reglas de negocio

- El saldo disponible es `balance - reservedAmount`.
- Una cuenta se desactiva automáticamente si su saldo es menor a Q50 y no ha tenido actividad en 6 meses.
- Todos los eventos entrantes son idempotentes (se registran por `eventId` en la tabla `processed_events`).

## Cómo correr localmente

```bash
mvn spring-boot:run
```

Requiere PostgreSQL (puerto 5436) y RabbitMQ corriendo previamente (ver `infrastructure/docker-compose.yml`).

## Pruebas

```bash
mvn test
```

8 pruebas unitarias, cobertura de: creación de cuenta, consulta de saldo, reserva de fondos (éxito y fondos insuficientes), idempotencia, aplicación de transferencia, y desactivación automática.
