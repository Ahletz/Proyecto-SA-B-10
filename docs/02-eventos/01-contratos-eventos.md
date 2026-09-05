# 7. Contratos de eventos

## Envelope común
```json
{
  "eventId": "uuid",
  "eventType": "domain.action",
  "version": 1,
  "timestamp": "2026-09-05T06:53:57.729Z",
  "correlationId": "uuid",
  "payload": {}
}
```

- `eventId`: identidad del mensaje lógico para idempotencia.
- `eventType`: también se usa como routing key.
- `correlationId`: se conserva durante toda una operación distribuida.
- `version`: permite evolución del contrato.

## Eventos de Customer
| Evento | Productor | Payload relevante | Consumidor |
|---|---|---|---|
| `customer.registered` | Customer | customerId, email, username, fullName, role, identityStatus, status, activationToken | Notification/Audit |
| `customer.activated` | Customer | customerId, username, role, status | Notification/Audit |
| `customer.updated` | Customer | customerId, updatedFields | Notification/Audit |

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

## Invariantes de contrato
- los eventos persistentes se publican en `bank.events`;
- routing key = `eventType`;
- mensajes de negocio contienen `eventId` y `correlationId`;
- consumidores con efectos persistentes deduplican por `eventId`.
