# interbank-mock — banco pareja simulado (BANK99)

Implementa el contrato interbancario del curso (`docs/interbank/openapi.yaml`, sin modificarlo) para:

- desarrollar y probar el depósito interbancario sin depender del banco del otro grupo;
- inyectar los fallos del escenario obligatorio (rechazo, banco que no responde, lento o caído) **sin tocar el sistema del otro grupo**.

Es un banco más para nuestro sistema: Payment lo llama por `INTERBANK_PARTNERS` y el mock responde los callbacks **a través del Gateway** con su propia API key, igual que un banco real.

## Modos (se cambian en caliente)

| Campo | Valores | Efecto |
|---|---|---|
| `mode` | `accept` (por defecto) | Acepta y envía el callback `ACCEPTED` |
| | `reject` | Envía el callback `REJECTED` con `rejectReason` |
| | `no-callback` | Responde `202` pero nunca avisa: nuestro banco pasa a `TIMEOUT`, consulta `GET /transfers/{id}` (`PROCESSING`) y cancela (`CANCELLED` → `REVERSED`) |
| | `down` | Todo el contrato responde `503` con `Retry-After` (banco caído) |
| `latencyMs` | 0–600000 | Latencia añadida a cada respuesta del contrato (banco lento; Payment corta a los 5 s) |
| `callbackDelayMs` | 0–600000 | Espera antes del callback (con más de 180 s, el depósito vence y pasa a `TIMEOUT`) |
| `rejectReason` | `ACCOUNT_NOT_FOUND`, `ACCOUNT_INACTIVE`, ... | Motivo del modo `reject` |

Siempre se respeta el contrato: idempotencia por `interbankTransferId` (200 si se repite igual, 409 si cambia el contenido), `422` si llega vencido, rechazo `EXPIRED`/`AMOUNT_LIMIT_EXCEEDED`, callback con el mismo `traceId` del `traceparent` recibido y reintentos 2 s, 4 s, 8 s... El estado vive en memoria (1 réplica).

## Uso en el cluster

```bash
kubectl -n prod port-forward svc/interbank-mock 3010:3010
TOKEN=$(kubectl -n prod get secret interbank-mock-secret -o jsonpath='{.data.MOCK_ADMIN_TOKEN}' | base64 -d)

curl -s localhost:3010/admin/state -H "X-Admin-Token: $TOKEN"                          # config, recibidos, enviados, reversos
curl -s -X POST localhost:3010/admin/config -H "X-Admin-Token: $TOKEN" -d '{"mode":"no-callback"}'
curl -s -X POST localhost:3010/admin/config -H "X-Admin-Token: $TOKEN" -d '{"mode":"accept","latencyMs":0}'
# El mock nos envía un depósito (prueba del lado receptor). Cuenta = UUID de una cuenta nuestra, sin guiones.
curl -s -X POST localhost:3010/admin/send -H "X-Admin-Token: $TOKEN" -d '{"destinationAccount":"<cuenta>","amount":"25.00"}'
```

## Configuración (Secrets, fuera del repo)

| Dónde | Clave | Valor |
|---|---|---|
| `interbank-mock-secret` | `MOCK_INBOUND_API_KEY` | clave con la que Payment llama al mock |
| | `MOCK_OUTBOUND_API_KEY` | clave que el Gateway le asignó al mock |
| | `MOCK_ADMIN_TOKEN` | token de `/admin/*` |
| `bank-interbank-secret` (Payment) | `INTERBANK_PARTNERS` | agregar `"BANK99":{"baseUrl":"http://interbank-mock:3010/interbank/v1","apiKey":"<MOCK_INBOUND_API_KEY>"}` |
| `gateway-interbank-keys` (Gateway) | `INTERBANK_API_KEYS` | agregar `"BANK99":"<MOCK_OUTBOUND_API_KEY>"` |
