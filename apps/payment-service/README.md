# Payment Service

Microservicio responsable de la validación y procesamiento de operaciones de pago dentro del flujo de transferencias.

## Configuración

| Variable | Valor |
|---|---|
| Puerto | 8084 |
| Base de datos | `bank_payment` (PostgreSQL, puerto 5437) |
| Broker | RabbitMQ (`bank.events`, tipo topic) |

## Endpoints REST

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/payments` | Procesa un pago (uso manual/pruebas) |
| GET | `/api/payments` | Lista el historial de pagos procesados |

## Eventos

**Publica:**
- `payment.approved` — cuando la operación es válida
- `payment.rejected` — cuando la operación es rechazada

**Consume:**
- `account.funds.reserved` — dispara la validación del pago

## Reglas de negocio

- Un pago se rechaza si el monto es menor o igual a cero (`PAYMENT_VALIDATION_FAILED`).
- Todos los eventos entrantes son idempotentes (se registran por `eventId` en la tabla `processed_events`).
- El procesamiento de pagos es automático, disparado por eventos — no requiere intervención manual del usuario final.

## Cómo correr localmente

```bash
mvn spring-boot:run
```

Requiere PostgreSQL (puerto 5437) y RabbitMQ corriendo previamente (ver `infrastructure/docker-compose.yml`).

## Pruebas

```bash
mvn test
```

7 pruebas unitarias, cobertura de: procesamiento de pago (aprobado y rechazado), reacción al evento `account.funds.reserved`, idempotencia, y consulta de historial.
