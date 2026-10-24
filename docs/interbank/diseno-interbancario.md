# Depósitos interbancarios — diseño e interfaces (Fase 3)

Implementa el contrato del curso (`docs/interbank/openapi.yaml`, **sin modificar**). Payment es la frontera con el otro banco; Account mueve el dinero. Todo es idempotente por `interbankTransferId` (= `Idempotency-Key`).

## 1. Decisiones que hay que respetar (y acordar con el banco pareja)

| Tema | Decisión |
|---|---|
| **Número de cuenta entre bancos** | El `accountId` (UUID) **sin guiones**, 32 caracteres hexadecimales (el contrato permite hasta 34; el UUID con guiones mide 36). Al recibir se aceptan ambas formas. |
| **`interbankTransferId`** | Para un depósito saliente es el `transactionId` de la Saga (un UUID). Así un mismo `transactionId` nunca genera dos depósitos. |
| **Quién llama** | El Gateway valida `X-Api-Key` y **siempre reescribe** el header `X-Caller-Bank-Code` (`BANKnn` del banco dueño de esa clave) antes de reenviar a Payment. Payment lo usa para que cada banco solo consulte, cancele o reciba callbacks de transferencias en las que participa. Nunca se acepta ese header tal como llega de afuera. |
| **Comisión** | Un depósito saliente usa la misma `feeAmount` de la cuenta que las transferencias internas (se reserva monto + comisión). |
| **Moneda y límite** | Solo GTQ. Máximo Q10,000.00 por operación (`AMOUNT_LIMIT_EXCEEDED`); mínimo Q0.01. |

## 2. Flujo como banco emisor (nosotros enviamos)

```
Transaction ─ interbank.transfer.requested ─▶ Account (reserva monto+comisión)
Account ─ account.interbank.funds.reserved ─▶ Payment (crea el depósito PENDING y llama POST {pareja}/transfers)
Payment ─ interbank.transfer.sent ─▶ Transaction                       (202 del receptor)
receptor ─ POST /interbank/v1/transfers/{id}/result ─▶ Payment (callback)
Payment ─ interbank.transfer.accepted ─▶ Account (confirma el débito) ─ account.interbank.transfer.completed ─▶ Transaction
Payment ─ interbank.transfer.rejected ─▶ Account (libera la reserva)  ─ account.interbank.funds.released ─▶ Transaction
```

Si Account rechaza la reserva (sin fondos, cuenta inactiva, sobre el límite) publica `account.interbank.funds.rejected` y **no** se envía nada al otro banco.

**Timeout (protocolo del contrato):** si no llega el callback antes de `expiresAt` (= `createdAt` + 180 s) el depósito pasa a `TIMEOUT` y **la reserva sigue retenida**. Payment consulta `GET /transfers/{id}` (3 intentos con espera creciente):

| Respuesta del receptor | Resultado |
|---|---|
| `ACCEPTED` | confirma el débito (`interbank.transfer.accepted`) |
| `REJECTED` o `CANCELLED` | libera la reserva (`interbank.transfer.reversed`) |
| `404` o `PROCESSING` | `POST /transfers/{id}/cancel` → `CANCELLED`/`ALREADY_REJECTED` libera; `ALREADY_ACCEPTED` confirma |
| sin respuesta | sigue reintentando consulta y cancelación; **solo tras `expiresAt` + 300 s** libera la reserva y deja una ALERTA en el log (`interbank.partner_unreachable`) |

Si después llega un callback `ACCEPTED` para una transferencia ya liberada: incidente nivel ERROR (`interbank.late_accepted`) y Payment pide el reverso con `POST /reversals` hasta que el otro banco lo complete.

## 3. Flujo como banco receptor (nos envían)

```
pareja ─ POST /interbank/v1/transfers ─▶ Gateway ─▶ Payment: valida, 202 PROCESSING (200 si repite, 409 si contenido distinto, 422 si ya venció)
Payment ─ interbank.deposit.requested ─▶ Account: valida y acredita en UNA transacción
Account ─ account.interbank.deposit.credited | .rejected ─▶ Payment (y .credited ─▶ Transaction, solo para el historial)
Payment ─ POST {pareja}/transfers/{id}/result ─▶ callback con espera creciente 2 s, 4 s, 8 s… hasta 24 h
```

Account **nunca acredita** un mensaje vencido (`EXPIRED`, aunque llegue por reintento o DLQ) ni un id cancelado (`CANCELLED`), y un reintento del mismo id no acredita dos veces. La cancelación (`POST /transfers/{id}/cancel`) la decide Account con bloqueo de fila, así un depósito en curso no puede acreditarse después de haber respondido `CANCELLED`.

**Reversos:** `POST /reversals` (acreditado → Account debita → Payment envía la devolución como un depósito nuevo al banco que lo pidió). **Conciliación:** `GET /reconciliation?date=` lista lo recibido de ese banco ese día (UTC); además, una vez al día Payment concilia el día anterior contra cada banco pareja y registra cada diferencia (`interbank.reconciliation_mismatch`).

## 4. Eventos (exchange `bank.events`, mismo envelope de siempre)

| Evento | Lo publica | Lo consumen | Contenido (`payload`) |
|---|---|---|---|
| `interbank.transfer.requested` | **Transaction** | Account | `transactionId`, `sourceAccount` (UUID), `destinationBankCode`, `destinationAccount`, `amount` (número), `currency` ("GTQ", opcional), `description` (opcional). `interbankTransferId` = `transactionId`. |
| `account.interbank.funds.reserved` | Account | Payment | `transactionId`, `interbankTransferId`, `sourceAccount`, `destinationBankCode`, `destinationAccount`, `amount`, `fee`, `currency`, `description` |
| `account.interbank.funds.rejected` | Account | **Transaction** | `transactionId`, `interbankTransferId`, `reason`: `INSUFFICIENT_FUNDS`, `ACCOUNT_NOT_FOUND_OR_INACTIVE`, `AMOUNT_LIMIT_EXCEEDED`, `INVALID_AMOUNT`, `CURRENCY_NOT_SUPPORTED` |
| `interbank.transfer.sent` | Payment | **Transaction** | `transactionId`, `interbankTransferId`, `partnerBankCode`, `amount`, `state` |
| `interbank.transfer.timeout` | Payment | **Transaction** | igual + `expiresAt` |
| `interbank.transfer.accepted` | Payment | Account, **Transaction** | igual |
| `interbank.transfer.rejected` | Payment | Account, **Transaction** | igual + `reasonCode`, `reasonMessage` |
| `interbank.transfer.reversed` | Payment | Account, **Transaction** | igual + `reasonCode` (`TIMEOUT` o `TIMEOUT_NO_RESPONSE`) |
| `account.interbank.transfer.completed` | Account | **Transaction** | `transactionId`, `interbankTransferId`, `sourceAccount`, `amount`, `fee` |
| `account.interbank.funds.released` | Account | **Transaction** | `transactionId`, `interbankTransferId`, `amount`, `fee`, `reason` |
| `interbank.deposit.requested` | Payment | Account | `interbankTransferId`, `originBankCode`, `destinationAccount`, `amount` ("150.00"), `currency`, `expiresAt` |
| `account.interbank.deposit.credited` / `.rejected` | Account | Payment; `.credited` también Transaction | `interbankTransferId` (+ `reasonCode`, `reasonMessage`); `.credited` lleva además `accountId`, `amount`, `originBankCode` y `originAccount` |
| `interbank.reversal.requested` | Payment | Account | `reversalId`, `originalTransferId`, `amount` |
| `account.interbank.reversal.debited` / `.failed` | Account | Payment | `reversalId`, `originalTransferId` (+ `accountId`, `amount` / `reason`) |

Los eventos de Payment salen con `eventId` determinista (id + estado) desde una tabla outbox: si RabbitMQ estaba caído se publican después, y si se publican dos veces el consumidor los descarta por idempotencia.

## 5. Estados de la Saga en Transaction

| Estado en la Saga | Cuándo |
|---|---|
| `PENDING` | Transaction publicó `interbank.transfer.requested` |
| `SENT` | llegó `interbank.transfer.sent` |
| `TIMEOUT` | llegó `interbank.transfer.timeout` |
| `ACCEPTED` | llegó `interbank.transfer.accepted` (el débito lo confirma `account.interbank.transfer.completed`) |
| `REJECTED` | llegó `account.interbank.funds.rejected` o `interbank.transfer.rejected` |
| `REVERSED` | llegó `interbank.transfer.reversed` |

Pueden llegar eventos fuera de orden (por ejemplo `timeout` y luego `accepted`): un estado final (`ACCEPTED`, `REJECTED`, `REVERSED`) no debe sobrescribirse con `SENT` ni `TIMEOUT`.

## 6. Qué hace el Gateway

- Enruta `/interbank/v1/*` → `payment-service` (mismo path), solo por HTTPS. `GET /interbank/v1/health` no requiere autenticación.
- Valida `X-Api-Key` (una clave por banco, en un Secret de Kubernetes), exige `traceparent` (`400` si falta) y lo reenvía.
- Reenvía a Payment `X-Caller-Bank-Code` según la clave y descarta cualquier `X-Caller-Bank-Code` que venga del cliente. Reenvía también `Idempotency-Key`.
- **No** expone `/internal/*` (hay endpoints internos en Account y Payment).

## 7. Configuración (variables de entorno / Secrets)

| Servicio | Variable | Valor |
|---|---|---|
| Payment | `INTERBANK_BANK_CODE` | código de nuestro banco, `BANKnn`. **Sin esto el módulo interbancario queda inactivo.** |
| Payment | `INTERBANK_PARTNERS` | **Secret.** JSON: `{"BANK07":{"baseUrl":"https://host-pareja/interbank/v1","apiKey":"..."}}` (puede incluir varios bancos, por ejemplo el mock y el real) |
| Payment | `ACCOUNT_SERVICE_URL` | URL interna de Account, por defecto `http://account-service:3004` |
| Payment | opcionales | `INTERBANK_HTTP_TIMEOUT_MS` (5000), `INTERBANK_TICK_MS` (2000), `INTERBANK_QUERY_ATTEMPTS` (3), `INTERBANK_TIMEOUT_MARGIN_SECONDS` (300), `INTERBANK_WORKER_ENABLED` (true) |

## 8. Observabilidad del flujo

- Métrica `bank_interbank_transfers_total{role="emisor|receptor", state}` (estados `PENDING`, `SENT`, `TIMEOUT`, `ACCEPTED`, `REJECTED`, `REVERSED`, `late_accepted`, `partner_unreachable`, `callback_failed`) y `bank_interbank_reconciliation_mismatches_total`.
- Operaciones medidas en `bank_operations_total{operation}`: `interbank.receive`, `interbank.send`, `interbank.status`, `interbank.cancel`, `interbank.callback.receive`, `interbank.callback.send`, `interbank.timeout.query`, `interbank.timeout.cancel`, `account.interbank.{reserve,debit,release,credit,reversal}`. Un 4xx del contrato cuenta como `business_rejection`; solo las fallas técnicas consumen presupuesto de error.
- Logs (campo `event`): `interbank.received`, `interbank.timeout`, `interbank.partner_unreachable` (alerta), `interbank.late_accepted` (incidente ERROR), `interbank.callback_failed` (alerta), `interbank.reversal_*`, `interbank.reconciliation_mismatch`, `interbank.refund_failed` (incidente).
- `traceparent` viaja en cada llamada al otro banco y en los eventos de RabbitMQ: una transferencia completa aparece como una sola traza en Tempo.
## Códigos de banco
El contrato solo exige el formato `BANKnn` (`^BANK[0-9]{2}$`) y que cada banco use uno distinto. Criterio acordado: el número de grupo. Nosotros (grupo 8): `BANK08`. Banco pareja (grupo 13): `BANK13`. Se configuran en `INTERBANK_BANK_CODE=BANK08` y en `INTERBANK_PARTNERS` con la clave `BANK13`. Sin `INTERBANK_BANK_CODE` el módulo interbancario queda inactivo.
