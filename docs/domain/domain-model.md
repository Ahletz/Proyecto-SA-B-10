# Modelo de Dominio - Bank USAC

## Objetivo

Este documento describe las entidades principales del negocio bancario relacionadas con Account Service y Payment Service, sus atributos y responsabilidades dentro del sistema.

## Cuenta (Account)

**Responsabilidad:** representa una cuenta bancaria perteneciente a un cliente. Es responsable de mantener el saldo disponible, gestionar la reserva temporal de fondos durante una transferencia, y aplicar la regla de negocio de desactivación automática por inactividad.

**Atributos principales:**
- Identificador único de la cuenta
- Cliente al que pertenece
- Tipo de cuenta: `MONETARY` (monetaria) o `SAVINGS` (ahorro)
- Saldo actual
- Saldo mínimo (`SAVINGS`: 50 por defecto; `MONETARY`: 0)
- Comisión por transacción (opcional)
- Monto reservado (fondos apartados temporalmente durante una transferencia en curso)
- Estado (activa/inactiva)
- Fecha de última actividad

**Reglas de negocio:**
- El saldo disponible real es el saldo actual menos el monto reservado.
- Una transferencia se reserva solo si, después de apartar el monto más la comisión, la cuenta conserva su saldo mínimo; si no, se rechaza con `INSUFFICIENT_FUNDS`.
- Al completarse la transferencia se descuenta el monto más la comisión de la cuenta origen; la cuenta destino recibe solo el monto.
- Una cuenta se desactiva automáticamente si su saldo es menor a Q50 y no ha tenido actividad en 6 meses.
- Los fondos se reservan antes de aplicar una transferencia, y se liberan si la operación falla (compensación de la Saga).

## Pago (Payment)

**Responsabilidad:** representa la validación y procesamiento de una operación financiera asociada a una transacción. Determina si una operación puede aprobarse o debe rechazarse.

**Atributos principales:**
- Identificador único del pago
- Transacción asociada
- Monto de la operación
- Estado (aprobado/rechazado)
- Razón de rechazo, si aplica

**Reglas de negocio:**
- Un pago se rechaza si el monto no es válido (menor o igual a cero, `INVALID_AMOUNT`) o supera el límite configurado (`PAYMENT_LIMIT_EXCEEDED`).
- Si el monto es válido, se consulta un procesador de pagos externo simulado que responde `SUCCESS`, `FAILURE` (rechazo con `EXTERNAL_FAILURE`) o `TIMEOUT` (rechazo con `TIMEOUT`), con tasas configurables por variables de entorno.
- Hay un solo pago por transacción: un evento repetido no genera un segundo pago.
- El resultado del pago (aprobado o rechazado) determina si Account Service aplica la transferencia o libera los fondos reservados.

## Diagrama Entidad-Relación

Cada microservicio posee su propia base de datos PostgreSQL, sin claves foráneas ni consultas entre bases (regla "database per service"). Los datos de otro servicio se guardan solo como identificadores (por ejemplo `accounts.customer_id` o `payments.transaction_id`) o como proyección alimentada por eventos (`customer_kyc_status`):

| Base | Servicio | Tablas |
| ---- | -------- | ------ |
| `bank_customer` | Customer | `customers` (incluye `kyc_status`) |
| `bank_account` | Account | `accounts` (tipo, saldo mínimo, comisión), `transfer_reservations`, `processed_events` |
| `bank_transaction` | Transaction | `transactions` (incluye `failure_reason`), `customer_kyc_status`, `processed_events` |
| `bank_payment` | Payment | `payments`, `processed_events` |
| `bank_notification` | Notification & Audit | `processed_events` (auditoría con `payload` y clasificación `severity`/`origin`) |

Cada servicio que consume eventos tiene su propia tabla `processed_events` para la idempotencia por `eventId`; no es una tabla compartida. La única relación dibujada es interna de `bank_account` (`accounts` → `transfer_reservations`, por id y sin FK).

![Diagrama ER por base de datos](../assets/diagramas/er-databases.png)

Fuente Mermaid: [`c4-src/er-databases.mmd`](../01-arquitectura/c4-src/er-databases.mmd). Las tablas base las crean los ORM (TypeORM en los servicios NestJS, JPA con `ddl-auto: update` en Customer y Notification); los cambios de Fase 2 están en `infrastructure/databases/<servicio>/*.sql`.