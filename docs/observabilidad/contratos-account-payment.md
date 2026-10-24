# Contratos de Account y Payment (Fase 3)

Lo que el resto del sistema (Notification, Gateway, pruebas de carga y de fallo) puede esperar de Account y Payment.

## 1. Evento `account.anomaly.detected` (consumido por Notification & Audit)

Lo publica Account en el exchange `bank.events` con routing key `account.anomaly.detected`. Usa el mismo envelope que el resto de los eventos (`eventId`, `eventType`, `version`, `timestamp`, `correlationId`, `payload`).

**Cuándo:** una cuenta de origen intenta más de N operaciones (`transaction.created`) en M minutos. Se publica **una sola vez por ventana** y cuenta, sin repetirse por cada operación siguiente.

**Configuración (ConfigMap / variables de entorno de Account):** `ANOMALY_MAX_OPS` (por defecto 5) y `ANOMALY_WINDOW_MINUTES` (por defecto 10).

```json
{
  "eventId": "uuid",
  "eventType": "account.anomaly.detected",
  "version": 1,
  "timestamp": "2026-10-19T14:30:00.000Z",
  "correlationId": "uuid de la transacción que cruzó el umbral",
  "payload": {
    "accountId": "uuid",
    "customerId": "uuid",
    "transactionId": "uuid",
    "reason": "HIGH_FREQUENCY",
    "operationCount": 6,
    "threshold": 5,
    "windowMinutes": 10,
    "detectedAt": "2026-10-19T14:30:00.000Z"
  }
}
```

**Consumo:** Notification & Audit lo recibe por su binding `account.#`, lo audita como `WARNING` y avisa al cliente con el correo que proyectó desde los eventos de Customer (sin HTTP hacia Customer; si no hay contacto histórico usa el canal operativo configurado). Los correos se enmascaran en logs.

## 2. Endpoint de simulación de Payment (para pruebas de carga y fallas)

Cambia en caliente cómo se comporta el procesador externo simulado, sin redeploy. El endpoint de Payment es interno; el API Gateway lo expone solo a ADMIN en `/api/admin/payment-simulation` (reenvía a Payment con `X-Admin-Token` desde el Secret `bank-interbank-secret`) y es la vía que usan los escenarios de fallo.

| Método | Ruta (directo al servicio Payment; por el Gateway es `/api/admin/payment-simulation`) | Qué hace |
|---|---|---|
| GET | `/internal/payment-simulation` | Ajustes vigentes |
| POST | `/internal/payment-simulation` | Cambia uno o varios campos |
| DELETE | `/internal/payment-simulation` | Vuelve a los valores del entorno |

Campos: `failureRate` (0-1), `timeoutRate` (0-1), `timeoutMs` (0-60000), `latencyMs` (0-60000, latencia añadida a toda llamada). `failureRate + timeoutRate` no puede pasar de 1.

Si Payment tiene la variable `ADMIN_TOKEN`, hay que mandar el header `X-Admin-Token` (el Gateway lo agrega). Los cambios viven en memoria del pod y se pierden al reiniciarlo (con más de una réplica solo afectan al pod que respondió).

```bash
# directo al servicio, desde otra terminal: kubectl -n <namespace> port-forward svc/payment-service 3005:3005
curl -X POST localhost:3005/internal/payment-simulation -H 'Content-Type: application/json' \
  -d '{"failureRate":0.6,"timeoutRate":0.2}'          # escenario: procesador externo degradado
curl -X POST localhost:3005/internal/payment-simulation -H 'Content-Type: application/json' \
  -d '{"latencyMs":6000}'                             # escenario: latencia sobre el SLO de 5 s
curl -X DELETE localhost:3005/internal/payment-simulation   # volver a la normalidad
```

## 3. Métricas que emiten Account y Payment

Etiquetas permitidas: `operation`, `outcome`, `event_type` (más `service_name` y `deployment_environment` automáticas).

| Métrica (Prometheus) | Operaciones |
|---|---|
| `bank_operations_total{operation,outcome}` | `account.reserve`, `account.complete`, `account.release`, `payment.process` |
| `bank_operation_duration_seconds_*{operation}` | las mismas, y `consume <routing key>` |
| `bank_events_processed_total{event_type,outcome}` | cada evento consumido |
| `bank_events_duplicate_total{event_type}` | eventos descartados por idempotencia |
| `bank_anomalies_detected_total` | anomalías de Account |

`outcome`: `success`, `business_rejection` (fondos insuficientes, cuenta inactiva, monto inválido o sobre el límite) y `technical_error` (excepciones y fallas del procesador externo: `EXTERNAL_FAILURE`, `TIMEOUT`). **Solo `technical_error` consume presupuesto de error.**

## 4. Eventos de log útiles (campo `event`)

`account.anomaly.detected` (WARN), `payment.rejected` (WARN), `payment.simulation.changed` y `payment.simulation.reset` (WARN, dejan rastro de cuándo se activó un escenario de falla).
