# Acuerdo de integración interbancaria — BANK08 ↔ BANK13

Documento breve entre el **grupo 8 (BANK08, Bank USAC)** y el **grupo 13 (BANK13)** para operar depósitos interbancarios. El contrato técnico es el OpenAPI publicado por el curso ([`openapi.yaml`](openapi.yaml)) y **ninguno de los dos grupos lo modifica**; aquí solo se acuerdan URLs, autenticación, cuentas de prueba y la ventana de pruebas.

| Rol | Grupo 8 (BANK08) | Grupo 13 (BANK13) |
|---|---|---|
| Contacto | Ale (Integrante 1), integración: Nufio (Integrante 3) | Ángel |

## 1. Endpoints

| | BANK08 | BANK13 |
|---|---|---|
| URL base | `https://35-244-157-47.sslip.io/interbank/v1` | `https://angelgonza21.dpdns.org/interbank/v1` |
| Salud (sin autenticación) | `GET /health` → `{"bankCode":"BANK08",…}` | `GET /health` |
| Callback de resultado | `POST /transfers/{interbankTransferId}/result` | `POST /transfers/{interbankTransferId}/result` |
| Protocolo | Solo HTTPS (certificado administrado por Google) | Solo HTTPS |

## 2. Autenticación

- Header **`X-Api-Key`** en todas las rutas salvo `/health`. Cada banco genera la clave con la que el **otro** lo llama, y se la entrega por un canal privado, nunca por el repositorio ni por chat del grupo.
- BANK08 generó la clave de BANK13 y la entrega por medio de Ale. BANK13 ya entregó la suya para que BANK08 lo llame.
- Las claves viven solo en Secrets de Kubernetes: `gateway-interbank-keys` (entrantes) y `bank-interbank-secret` (salientes). Una clave inválida recibe `401`.
- Cada clave identifica al banco que llama. BANK08 ignora cualquier código de banco que llegue en headers y usa el asociado a la clave.

## 3. Reglas del contrato que ambos cumplen

- Header **`traceparent`** (W3C) en toda solicitud y en los callbacks. BANK08 responde `400` si falta. El mismo `traceId` identifica el depósito en los dos bancos.
- **`Idempotency-Key` = `interbankTransferId`** en `POST /transfers`:
  - el mismo id con el mismo contenido devuelve `200` y no acredita dos veces;
  - el mismo id con otro contenido devuelve `409`.
- **`expiresAt` = `createdAt` + 180 s.** Un depósito recibido vencido se rechaza (`422` / `EXPIRED`).
- **Timeout del emisor:** si no llega el callback antes de `expiresAt`, el emisor consulta `GET /transfers/{id}` y, si sigue en proceso, cancela con `POST /transfers/{id}/cancel`. Los fondos del emisor no se liberan hasta conocer el resultado.
- Moneda GTQ; monto mínimo Q0.01. BANK08 envía hasta Q10,000.00 por operación (`AMOUNT_LIMIT_EXCEEDED` por encima).
- Callbacks con reintento y espera creciente (2 s, 4 s, 8 s…).

## 4. Formato de cuenta y cuentas de prueba

| | BANK08 | BANK13 |
|---|---|---|
| Formato de cuenta | UUID de la cuenta **sin guiones** (32 caracteres hexadecimales); también acepta el UUID con guiones | 12 dígitos |
| Cuenta de prueba (para recibir) | `8f7fd8efa4a647f9a79235d236ac4d40`, titular *Cliente Prueba Banco 13* | `109732195767`, titular *Cliente Prueba 1* |

## 5. Ventana de pruebas conjuntas

| Prueba | Fecha y hora (GT, UTC−6) | Estado |
|---|---|---|
| Conectividad: `/health` de ambos lados y una clave inválida → `401` | Por acordar con Ángel, antes del 23 oct | Pendiente |
| Depósito BANK08 → BANK13 aceptado, y consulta de estado | Ídem | Pendiente |
| Depósito BANK13 → BANK08 aceptado, y reenvío idéntico sin doble crédito | Ídem | Pendiente |
| Mismo `traceId` en ambos bancos (captura de Tempo de cada lado) | Ídem | Pendiente |

Hasta la prueba conjunta, BANK08 valida cada camino contra su simulador `interbank-mock` (BANK99), que implementa el mismo contrato. Ninguna prueba de fallo se hace apagando o alterando el sistema del otro grupo: los fallos se inyectan con el simulador.

## 6. Incidentes

Si un banco detecta respuestas `5xx`, timeouts repetidos o diferencias de conciliación, avisa al contacto del otro grupo con el `interbankTransferId` y el `traceId`. BANK08 tiene las alertas `InterbankPartnerUnreachable` e `InterbankReconciliationMismatch` ([runbooks](../../observability/runbooks/)).
