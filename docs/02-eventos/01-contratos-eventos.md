# 7. Contratos de eventos

## Envelope común
```json
{
  "eventId": "uuid",
  "eventType": "domain.action",
  "version": 1,
  "timestamp": "2026-09-05T06:53:57.729Z",
  "correlationId": "uuid",
  "causationId": "uuid",
  "payload": {}
}
```

- `eventId`: identidad del mensaje lógico para idempotencia.
- `eventType`: también se usa como routing key.
- `correlationId`: se conserva durante toda una operación distribuida. Lo fija el Gateway a partir del header `X-Correlation-Id` (solo si es un UUID; si no, genera uno), así que en una transferencia es el mismo id desde el request HTTP hasta la auditoría.
- `causationId` (opcional, Fase 2): `eventId` del evento que provocó este. Lo envían Transaction (en todos sus eventos) y Notification (en `notification.classified`).
- `version`: permite evolución del contrato.

## Eventos de Customer
| Evento | Productor | Payload relevante | Consumidor |
|---|---|---|---|
| `customer.registered` | Customer | customerId, email, username, fullName, role, identityStatus, status, activationToken | Notification/Audit |
| `customer.activated` | Customer | customerId, username, role, status | Notification/Audit |
| `customer.updated` | Customer | customerId, updatedFields | Notification/Audit |
| `customer.kyc.status.changed` | Customer | customerId, estadoAnterior, estadoNuevo (`PENDING`, `VERIFIED`, `REJECTED`) | Transaction, Notification/Audit |

`customer.kyc.status.changed` (Fase 2) se publica solo cuando el estado cambia: repetir el estado actual no emite otro evento. Transaction lo proyecta en su tabla local `customer_kyc_status` y descarta los eventos con `timestamp` anterior al último aplicado.

## Eventos de Account/Transaction/Payment
| Evento | Productor | Consumidores principales | Propósito |
|---|---|---|---|
| `account.created` | Account | Notification/Audit | evidencia de creación |
| `transaction.transfer.requested` | Gateway | Transaction, Notification/Audit | comando inicial aceptado |
| `transaction.created` | Transaction | Account, Notification/Audit | transferencia PENDING persistida |
| `account.funds.reserved` | Account | Payment, Transaction, Notification/Audit | fondos bloqueados |
| `account.funds.rejected` | Account | Transaction, Notification/Audit | rechazo por cuenta/fondos |
| `payment.approved` | Payment | Account, Notification/Audit | validación aprobada |
| `payment.rejected` | Payment | Account, Transaction, Notification/Audit | inicia compensación |
| `account.transfer.completed` | Account | Transaction, Notification/Audit | débito/crédito aplicado |
| `account.transfer.failed` | Account | Transaction, Notification/Audit | fallo de aplicación si ocurre |
| `account.funds.released` | Account | Transaction, Notification/Audit | reserva liberada |
| `account.deactivated` | Account | Notification/Audit | mantenimiento automático |
| `transaction.completed` | Transaction | Notification/Audit | estado terminal exitoso |
| `transaction.failed` | Transaction | Notification/Audit | estado terminal fallido |
| `transaction.compensated` | Transaction | Notification/Audit | estado terminal compensado |
| `transaction.status.changed` | Transaction | Notification/Audit | cambio del estado público (Fase 2) |
| `notification.classified` | Notification/Audit | ninguno por ahora | severidad asignada a un evento auditado (Fase 2) |

Payloads de la Saga:

| Evento | Payload |
|---|---|
| `transaction.transfer.requested` | sourceAccount, targetAccount, amount, requestedBy (customerId del JWT), requestedEmail |
| `transaction.created` | transactionId, sourceAccount, targetAccount, amount, status |
| `account.funds.rejected`, `payment.rejected`, `account.transfer.failed` | transactionId, reason |
| `transaction.completed`, `transaction.failed`, `transaction.compensated` | transactionId, status, reason (solo en fallos) |

### Motivos de fallo (`reason`)
| Productor | Motivo | Cuándo |
|---|---|---|
| Transaction | `KYC_NOT_VERIFIED` | el cliente que pide la transferencia no tiene KYC `VERIFIED` |
| Account | `ACCOUNT_NOT_FOUND_OR_INACTIVE` | la cuenta origen o destino no existe o no está `ACTIVE` |
| Account | `INSUFFICIENT_FUNDS` | saldo disponible (balance − reservado − saldo mínimo) menor que monto + comisión |
| Payment | `INVALID_AMOUNT` | monto no positivo |
| Payment | `PAYMENT_LIMIT_EXCEEDED` | monto mayor que `PAYMENT_MAX_AMOUNT` |
| Payment | `EXTERNAL_FAILURE` | el procesador externo simulado falla (`PAYMENT_SIMULATE_FAILURE_RATE`, 10 % por defecto) |
| Payment | `TIMEOUT` | el procesador externo simulado no responde (`PAYMENT_SIMULATE_TIMEOUT_RATE`, 5 % por defecto) |

Transaction guarda el motivo en `failure_reason` y lo expone en el historial. Los motivos de Payment se guardan con prefijo `PAYMENT_` (`PAYMENT_TIMEOUT`, `PAYMENT_EXTERNAL_FAILURE`, …) para distinguir qué participante falló.

### `transaction.status.changed` (Fase 2)
Se publica junto con `transaction.created`, `transaction.completed`, `transaction.failed` y `transaction.compensated`, es decir, cada vez que cambia el estado público de la transacción.

| Campo del payload | Descripción |
|---|---|
| `transactionId` | identificador de la transacción |
| `accountId` | cuenta origen de la transferencia |
| `estado` | `PENDING`, `APPROVED` o `FAILED` (ver mapeo en la referencia API del historial) |
| `fecha` | fecha ISO-8601 del cambio de estado |

### `notification.classified` (Fase 2)
| Campo del payload | Descripción |
|---|---|
| `eventId` | evento auditado que se clasificó (también va en `causationId`) |
| `severidad` | `INFO`, `WARNING` o `ERROR`, asignada por Notification/Audit |
| `origen` | servicio que produjo el evento auditado |
| `mensaje` | texto de la notificación |

## Invariantes de contrato
- los eventos persistentes se publican en `bank.events`;
- routing key = `eventType`;
- mensajes de negocio contienen `eventId` y `correlationId`;
- consumidores con efectos persistentes deduplican por `eventId`;
- Transaction y Notification generan `eventId` deterministas (derivados de la transacción y la transición, o del evento de origen): si un evento de entrada se reprocesa, lo que se republica trae el mismo `eventId` y los consumidores lo descartan;
- un evento que llega cuando la Saga ya pasó esa etapa (reentrega tardía) se ignora sin error; uno que llega antes de tiempo falla y se reintenta (cola `.retry`, hasta 3 veces, luego DLQ).
