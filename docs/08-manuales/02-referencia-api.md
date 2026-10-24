# Referencia API del Gateway

Base en producción: el frontend en Cloud Run reenvía `/api` al Gateway (mismo origen). El banco pareja entra por `https://35-244-157-47.sslip.io`.  
Base Docker Compose: `http://localhost:8080`  
Base kind: `http://localhost:30080`

Los endpoints protegidos requieren `Authorization: Bearer <JWT>`.

## Correlation ID
Toda respuesta del Gateway trae el header `X-Correlation-Id` (expuesto por CORS para el frontend).

- Si el request manda `X-Correlation-Id` con un **UUID**, el Gateway lo conserva; si falta o no es un UUID, genera uno nuevo.
- El Gateway lo reenvía en todas las llamadas a los servicios y lo usa como `correlationId` de los eventos que publica, así que el mismo id aparece en los logs, en los errores de los servicios y en `/api/audit/events`.
- En `POST /api/transfers` ese id es el `correlationId` de la Saga. Reenviar la transferencia con el mismo `X-Correlation-Id` cuenta como reintento: no se crea una segunda transacción.

## Customer
| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| POST | `/api/customers/register` | público | registrar CLIENT |
| POST | `/api/customers/login` | público | obtener JWT |
| GET | `/api/customers/activate/:token` | público | activar cliente |
| GET | `/api/customers/me` | autenticado | consultar perfil |
| PUT | `/api/customers/me` | autenticado | actualizar perfil |
| GET | `/api/customers?kycStatus=PENDING` | ADMIN, CASHIER | listar clientes (ADMIN revisa KYC; CASHIER elige cliente en Cuentas e Historial) (filtro opcional `PENDING`, `VERIFIED` o `REJECTED`; sin la foto del documento) |
| PATCH | `/api/customers/:customerId/kyc` | ADMIN | cambiar estado KYC y publicar `customer.kyc.status.changed` |

Request KYC (`PENDING`, `VERIFIED` o `REJECTED`; repetir el estado actual no publica otro evento):
```json
{"status":"VERIFIED"}
```

Un cliente solo puede transferir con KYC `VERIFIED`; si no, la transferencia termina `FAILED` con motivo `KYC_NOT_VERIFIED`.

## Accounts
| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| POST | `/api/accounts` | autenticado | crear cuenta; CLIENT queda forzado a su customerId |
| GET | `/api/accounts` | autenticado | listar cuentas; CLIENT solo propias |
| GET | `/api/accounts/:id` | autenticado | consultar cuenta; CLIENT valida ownership |
| POST | `/api/accounts/maintenance/deactivate-inactive` | ADMIN/CASHIER | mantenimiento |

Ejemplo:
```json
{"type":"MONETARY","initialBalance":1500}
```

## Transfers
| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| POST | `/api/transfers` | CLIENT | aceptar transferencia y publicar comando |
| GET | `/api/transfers/:correlationId` | autenticado | consultar estado; un CLIENT solo ve transferencias de sus cuentas (si no, 403) |

Request:
```json
{"sourceAccount":"uuid","targetAccount":"uuid","amount":250}
```

Respuesta de aceptación (el `traceId` permite abrir la Saga completa en Tempo):
```json
{"accepted":true,"correlationId":"uuid","eventId":"uuid","status":"PENDING","traceId":"hex32"}
```

## Historial de transacciones
| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| GET | `/api/transactions?accountId=` | autenticado (CLIENT solo sus cuentas) | historial de la cuenta como origen o destino, más reciente primero |

Filtros opcionales:
- `from`, `to`: fechas ISO-8601, rango inclusivo sobre la fecha de creación;
- `status`: `PENDING`, `APPROVED` o `FAILED`;
- `page` (desde 1, por defecto 1) y `size` (1–100, por defecto 20).

Respuesta:
```json
{"items":[{"transactionId":"uuid","sourceAccount":"uuid","targetAccount":"uuid","direction":"OUTGOING","amount":250,"status":"APPROVED","detailedStatus":"COMPLETED","failureReason":null,"correlationId":"uuid","createdAt":"ISO-8601","updatedAt":"ISO-8601"}],"page":1,"size":20,"total":1}
```

`status` es el estado público del contrato. `detailedStatus` es el estado interno de la Saga: `PENDING`, `PROCESSING` y `COMPENSATING` se exponen como `PENDING`; `COMPLETED` como `APPROVED`; `FAILED` y `COMPENSATED` como `FAILED`. `direction` indica si la cuenta consultada envió (`OUTGOING`) o recibió (`INCOMING`) el dinero.

`failureReason` es `null` salvo que la Saga falle o compense: `KYC_NOT_VERIFIED`, `INSUFFICIENT_FUNDS` (lo manda Account), los motivos de Payment con prefijo `PAYMENT_` o, en un depósito a otro banco, con prefijo `INTERBANK_` (`PAYMENT_TIMEOUT`, `PAYMENT_EXTERNAL_FAILURE`, `PAYMENT_LIMIT_EXCEEDED`, …). También lo devuelve `GET /api/transfers/:correlationId`.

## Depósitos interbancarios
| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| POST | `/api/interbank-transfers` | CLIENT (solo sus cuentas) | publica `transaction.interbank.requested` y responde `202` con `correlationId`, `eventId` y `traceId` |
| GET | `/api/interbank-transfers/:correlationId` | CLIENT (solo los suyos), CASHIER, ADMIN | estado de la Saga, `interbankState`, banco destino y motivo de rechazo |

Request:
```json
{"sourceAccount":"uuid","destinationBankCode":"BANK13","destinationAccount":"109732195767","amount":"150.00","description":"opcional"}
```

`destinationBankCode` con formato `BANKnn`, cuenta destino de 1 a 34 caracteres alfanuméricos o guiones y monto con hasta 2 decimales. Los motivos de rechazo llevan prefijo `INTERBANK_` (`INTERBANK_REJECTED`, `INTERBANK_TIMEOUT`, …).

El contrato para el banco pareja (`/interbank/v1/*`, autenticado con `X-Api-Key`) está en [API Gateway y seguridad](../01-arquitectura/03-api-gateway-seguridad.md#rutas-interbancarias-y-de-administración) y en `docs/interbank/openapi.yaml`.

## Administración
| Método | Ruta | Acceso |
|---|---|---|
| GET | `/api/audit/events` | ADMIN · auditoría; ver filtros abajo |
| GET | `/api/payments` | ADMIN/CASHIER |
| GET | `/api/payments/transaction/:id` | ADMIN/CASHIER |
| GET, POST, DELETE | `/api/admin/payment-simulation` | ADMIN · inyección de fallos en Payment (`failureRate`, `timeoutRate`, `timeoutMs`, `latencyMs`) |

### Auditoría: filtros y paginación
`GET /api/audit/events` acepta `correlationId`, `traceId`, `service`, `level` (`INFO`, `WARNING`, `ERROR`), `q` (busca evento, `correlationId` y origen), `page` (desde 0), `size` (1–200) y `paged=true`. Los filtros se combinan en la base. Sin `paged=true` devuelve la lista compatible de los eventos más recientes; con `paged=true` devuelve `{items, page, size, total, totalPages}`. Cada evento incluye `traceId`, `spanId` y `serviceName` (nulos en eventos anteriores a la Fase 3).

## Health
- `GET /health`
- `GET /health/ready`
