# Contratos de Account y Payment (Fase 3)

Lo que Alex y Nufio pueden esperar de Account y Payment. Todo ya está en la rama `feature/fase3-observabilidad`.

## 1. Evento `account.anomaly.detected` (para Alex: Notification y Audit)

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

**Alex:** bindear una cola de Notification y otra de Audit a ese routing key. Notification avisa al cliente (con `customerId` consulta su correo), Audit lo guarda. Recordar enmascarar el correo en logs.

## 2. Endpoint interno de simulación de Payment (para pruebas de carga y fallas)

Cambia en caliente cómo se comporta el procesador externo simulado, sin redeploy. **Es interno: Nufio, no lo expongas en el API Gateway.**

| Método | Ruta (directo al servicio Payment) | Qué hace |
|---|---|---|
| GET | `/internal/payment-simulation` | Ajustes vigentes |
| POST | `/internal/payment-simulation` | Cambia uno o varios campos |
| DELETE | `/internal/payment-simulation` | Vuelve a los valores del entorno |

Campos: `failureRate` (0-1), `timeoutRate` (0-1), `timeoutMs` (0-60000), `latencyMs` (0-60000, latencia añadida a toda llamada). `failureRate + timeoutRate` no puede pasar de 1.

Si Payment tiene la variable `ADMIN_TOKEN`, hay que mandar el header `X-Admin-Token`. Los cambios viven en memoria del pod y se pierden al reiniciarlo (con más de una réplica solo afectan al pod que respondió).

```bash
# desde otra terminal: kubectl -n <namespace> port-forward svc/payment-service 3005:3005
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
