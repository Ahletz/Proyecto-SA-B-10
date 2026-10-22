# Postmortem: caída de Account Service (escenario 3)

- **Fecha y hora (UTC):** 21 oct 2026. Account estuvo sin réplicas de 10:54:58 a 10:58:59 (4 min 1 s) y la alerta se resolvió a las 10:59:15. Ventana completa de la prueba: 10:53:28–10:59:59.
- **Autor:** Nufio (Integrante 3)
- **Severidad:** media. El 61 % de las peticiones de la ventana falló con `500` del Gateway y el cliente esperó unos 10 s cada vez. Ninguna transferencia aceptada se perdió ni se duplicó, y los saldos cuadraron.
- **Servicios afectados:** Account Service (origen) y API Gateway (rechazó las transferencias nuevas). Transaction y Payment sin errores propios.

## Resumen
Con carga nominal (5 transferencias/s), se bajó Account a 0 réplicas durante 4 minutos. La Saga se comportó como se esperaba: el único mensaje en vuelo esperó en la cola `account-service.events` y se consumió al volver Account, sin duplicados. `ServiceUnavailable` pasó a Firing 2 min 17 s después de la caída.

El hallazgo fue otro. Se esperaba que las transferencias nuevas quedaran `PENDING` hasta que Account volviera, pero el Gateway rechazó 1145 peticiones con `500` tras unos 10 s cada una. Antes de publicar la transferencia, el Gateway consulta en línea a Account que la cuenta origen sea del cliente. Se corrigió en `v0.5.4` (PR #54): ahora responde `503` a los 5 s.

## Cronología (UTC)
| Hora | Evento |
|---|---|
| 10:53:18 | Línea base de saldos: Q4681 + Q404 = Q5085, nada reservado |
| 10:53:28 | Inicio de k6, perfil `load` (`tests/load/transfers.js`, hasta 5 transferencias/s) |
| 10:54:58 | **Inyección:** `kubectl -n prod scale deploy/account-service --replicas=0`. El HPA tenía Account en 2 réplicas |
| 10:55:15 | `ServiceUnavailable` (account-service) en **Pending**, 17 s después de la caída |
| 10:55:30 | Un mensaje queda retenido en `account-service.events` (una Saga en vuelo) |
| 10:55:45 | Primera señal en el Gateway: suben los `500` en `POST /api/transfers`, hasta 5 por segundo |
| 10:57:15 | `ServiceUnavailable` en **Firing**, 2 min 17 s después de la caída |
| 10:58:59 | **Recuperación:** `kubectl -n prod scale deploy/account-service --replicas=1` |
| 10:59:15 | El mensaje retenido se consume (cola y DLQ en 0). `ServiceUnavailable` resuelta |
| 10:59:59 | Fin de k6 |
| 11:00:00 | Último `500` del Gateway |
| 11:00:09 | Saldos finales: Q4673 + Q412 = Q5085, nada reservado |
| 11:00:15 | El HPA retoma el control y sube Account a 4 réplicas por la carga acumulada |

## Impacto
- **Peticiones al Gateway (ventana de k6, 6 min 30 s):** 1882 peticiones, 1145 fallidas (60,8 %), todas `500` en `POST /api/transfers`. Transferencias aceptadas con `202`: 580 de 1725, todas antes de la caída o después de la recuperación.
- **Latencia:** el p95 de creación fue de 10,55 s; cada petición fallida esperó unos 10 s. Las aceptadas tuvieron un p95 de 598 ms. El p99 de la Saga de punta a punta fue de 4,97 s.
- **Sagas:** 571 `COMPLETED` y ninguna con `technical_error`.
- **SLO de las operaciones (`bank_operations_total`):** sin consumo. Mientras Account estuvo caído no registró operaciones, y Transaction y Payment no tuvieron fallas técnicas. Por eso `SloBurnRateFast` no se encendió.
- **Disponibilidad del Gateway** (1 − 5xx / total): 39,2 % en la ventana. Con el mismo supuesto de tráfico del [escenario 1](2026-10-21-escenario1-payment-degradado.md) (unos 11,7 millones de operaciones al mes, presupuesto de 11 700 errores), los 1145 errores consumen cerca del **9,8 % del presupuesto mensual**. Con menos tráfico real, el porcentaje sería mayor.
- **Datos o dinero:** ninguno afectado.
  - El total de las cuentas de prueba fue Q5085 antes y después, con nada reservado.
  - `bank_events_duplicate_total` siguió en 0: ningún evento se aplicó dos veces.
  - La DLQ de Account no recibió mensajes.

## Detección
- `ServiceUnavailable` detectó la caída: Pending a los 17 s y Firing a los 2 min 17 s, lo esperado para `kube_deployment_status_replicas_available == 0` con `for: 2m`.
- **Brecha:** ninguna alerta mira la disponibilidad del Gateway. Los `500` se vieron en el dashboard *Bank USAC - Transferencias y API Gateway*, pero no dispararon nada. Si Account hubiera fallado sin quedar en 0 réplicas, por ejemplo con pods vivos que no responden, nadie habría recibido aviso.
- `SloBurnRateSlow` de Payment y Transaction ya estaba en Firing desde el escenario 1 (ventana de 6 h) y no tiene relación con este escenario.

## Evidencia
- Capturas pendientes de Grafana para la ventana 10:53–11:01:
  - *Bank USAC - Infraestructura, HPA y broker*: réplicas de Account en 0 y luego 4, y consumer lag de `account-service.events`;
  - *Bank USAC - Transferencias y API Gateway*: disponibilidad del Gateway y `5xx` por ruta;
  - Prometheus → *Alerts* con `ServiceUnavailable`.
- Salida de k6: `checks 33,62 %`, `http_req_failed 60,83 %`, p95 de `create_transfer` de 10,55 s.
- Prometheus:
  - `ALERTS{alertname="ServiceUnavailable",deployment="account-service"}`;
  - `kube_deployment_status_replicas_available{deployment="account-service"}`, de 2 a 0 y luego a 4;
  - `rabbitmq_detailed_queue_messages_ready{queue=~"account-service.*"}`, con un máximo de 1 en la cola y 0 en la DLQ;
  - `sum(increase(bank_events_duplicate_total[2m]))`, en 0;
  - `sum by (http_response_status_code)(rate(http_server_request_duration_seconds_count{service_name="api-gateway",http_response_status_code=~"5.."}[1m]))`.
- **Trazas en Tempo:**
  - fallida, `01747613dcb4c616295b77e9a1ca2ea8` (10:56:57, 10,15 s): solo spans de `api-gateway`. La consulta a Account no recibe respuesta y `POST /api/transfers` termina con error;
  - completa tras la recuperación, `0156373b5bf71112bd6e04ea8477a4c5` (10:59:28, 119 spans): Gateway → Transaction → Account (`account.reserve`, `account.complete`) → Payment (`payment.process`);
  - búsqueda: `{ resource.service.name = "api-gateway" && span.http.response.status_code = 500 }`.
- **Logs:** en esta ventana Loki todavía no recibía logs (se corrigió con `otel-logs-agent`, PR #57, `v0.5.5`). Desde entonces, los errores del Gateway en una caída así se buscan con `{service_name="api-gateway"} | json | level="ERROR"`.
- **Saldos** por el Gateway (`GET /api/accounts`): Q4681 + Q404 antes y Q4673 + Q412 después, ambos con total Q5085.

## Causa raíz
La causa fue la inyección: Account quedó sin réplicas durante 4 minutos. El sistema reaccionó de dos formas distintas:
1. **Lo asíncrono aguantó.** La Saga se comunica por RabbitMQ: el evento para Account esperó en su cola durable y, al volver Account, se procesó una sola vez gracias a `processed_events`.
2. **La validación síncrona del Gateway no aguantó.** Antes de publicar una transferencia, el Gateway pregunta a Account si la cuenta origen es del cliente. Sin Account, esa llamada esperaba hasta su timeout y el Gateway respondía `500`. El cliente veía un error genérico tras 10 s, en vez de un `503` rápido que le indicara reintentar. Por eso la transferencia no quedó `PENDING`, como suponía el diseño del escenario.

## Qué funcionó / qué no
- **Funcionó:**
  - la cola durable y la idempotencia por `processed_events`: ninguna Saga se perdió ni se duplicó;
  - `ServiceUnavailable` detectó la caída en 2 min 17 s;
  - el HPA retomó el control al volver a 1 réplica y escaló a 4 sin intervención;
  - la clasificación de `outcome`: Account caído no se contó como error técnico de otro servicio.
- **No funcionó o fue lento:**
  - el Gateway respondía `500` tras 10 s en vez de fallar rápido con `503`;
  - las transferencias nuevas no se aceptaron durante la caída, aunque la Saga podía absorberla;
  - no hay alerta sobre la disponibilidad del Gateway.

## Acciones
| Acción | Responsable | Fecha |
|---|---|---|
| Gateway con timeout de 5 s hacia los servicios internos y `503` cuando no responden (PR #54) | Nufio | 21 oct (hecho, `v0.5.4`) |
| Alerta de burn rate sobre la disponibilidad del Gateway (`http_server_request_duration_seconds`, 5xx / total) | Nufio | Fase 4 / mejora |
| Evaluar validar la propiedad de la cuenta origen con un dato local del Gateway (por ejemplo, cuentas del cliente en el JWT o en caché), para aceptar transferencias `PENDING` aunque Account esté caído | Nufio con Ale (I1, dueña de Account) | Fase 4 / mejora |
| Enlazar este postmortem desde `docs/pruebas/escenarios-de-fallo.md` | Nufio | 21 oct (hecho) |
