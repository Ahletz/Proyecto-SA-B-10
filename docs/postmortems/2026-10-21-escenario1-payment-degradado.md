# Postmortem: procesador externo de pagos degradado (escenario 1)

- **Fecha y hora (UTC):** 21 oct 2026. La falla duró de 10:32:08 a 10:36:09 (4 min 1 s) y la alerta se resolvió a las 10:41:30. Ventana completa de la prueba: 10:30:37–10:42.
- **Autor:** Nufio (Integrante 3)
- **Severidad:** media. Más de la mitad de las transferencias fallaron mientras duró la degradación, pero ninguna dejó dinero bloqueado ni movimientos duplicados, y el Gateway siguió respondiendo.
- **Servicios afectados:** Payment Service (origen) y Transaction Service (Sagas compensadas). Account y el Gateway sin errores propios.

## Resumen
Con carga nominal (5 transferencias/s), se degradó el procesador externo de Payment: 60 % de fallos y 20 % de timeouts de 3 s. Durante 4 minutos el 55 % de las Sagas terminó en `COMPENSATED`. Cada una liberó su reserva en Account, así que el saldo total no cambió. `SloBurnRateFast` pasó a Firing 3 min 22 s después de la inyección, y el sistema se recuperó solo al quitar la falla.

## Cronología (UTC)
| Hora | Evento |
|---|---|
| — | Preparación: Payment fijado en 1 réplica (`kubectl -n prod patch hpa payment-service -p '{"spec":{"maxReplicas":1}}'`), porque la simulación vive en la memoria de cada pod |
| 10:30:37 | Inicio de k6, perfil `load` (`tests/load/transfers.js`), como línea base |
| 10:32:08 | **Inyección** por el Gateway con el rol ADMIN: `POST /api/admin/payment-simulation` con `{"failureRate":0.6,"timeoutRate":0.2}` |
| ~10:33 | Primera señal: `bank_operations_total{outcome="technical_error"}` sube en Payment y Transaction; aparecen `transaction.saga.compensate` en Tempo |
| 10:33:30 | `SloBurnRateFast` (payment-service y transaction-service) en **Pending**, 1 min 22 s después de la inyección |
| 10:35:30 | `SloBurnRateFast` en **Firing**, 3 min 22 s después de la inyección |
| 10:36:09 | **Recuperación:** `DELETE /api/admin/payment-simulation` (vuelve a `failureRate: 0`) |
| 10:37:09 | Fin de k6 |
| 10:41:30 | `SloBurnRateFast` resuelta, 5 min 21 s después de la recuperación (lo que tarda la ventana de 5 min en limpiarse) |
| 10:45 | Payment vuelve a `maxReplicas: 5` |

## Impacto
- **Peticiones al Gateway:** 1754 transferencias aceptadas con `202` y 0 errores HTTP. El p95 de creación fue de 137 ms. El cliente no vio errores al enviar; la falla se ve en el estado final de la transferencia.
- **Sagas:** 776 `COMPLETED` y 969 `COMPENSATED` por `PAYMENT_EXTERNAL_FAILURE` o `PAYMENT_TIMEOUT`. Payment registró 787 operaciones exitosas y 983 con `technical_error`.
- **Tasa de error máxima (5 min):** 68,5 % en Payment y 68,6 % en Transaction.
- **Burn rate máximo (1 h):** 634× (63,4 % contra un presupuesto de 0,1 %).
- **Presupuesto de error consumido:** cerca del **8,4 % del mensual**. Supuesto: el tráfico del mes es igual al de la prueba (unas 4,5 operaciones/s, unos 11,7 millones al mes, con un presupuesto de 11 700 errores); 983 fallas consumen un 8,4 %. Con menos tráfico real, el porcentaje sería mayor.
- **Latencia:** el p95 de la Saga fue de 6,34 s, sobre el objetivo de 5 s, y el p95 de `payment.process` fue de 4,08 s. Los timeouts de 3 s más el reintento alargaron las Sagas compensadas.
- **Datos o dinero:** ninguno afectado.
  - El total de las cuentas de prueba fue Q5085 antes y después.
  - Los reservados no cambiaron: los Q162 que había eran del incidente anterior.
  - Ninguna Saga quedó detenida y la DLQ de Account no recibió mensajes.

## Detección
- `SloBurnRateFast` detectó la degradación a tiempo. Pasó a Pending a los 1 min 22 s y a Firing a los 3 min 22 s, dentro de los 2 a 5 min esperados para la regla (14,4× en las ventanas de 1 h y 5 m, con `for: 2m`).
- Se encendió en Payment, el origen, y en Transaction. Así se ve la causa y también su efecto en la Saga.
- `SloBurnRateSlow` también pasó a Firing. Por su ventana de 6 h siguió activa más de una hora después de la recuperación. Es esperado: es la alerta de degradación sostenida, no la de incidente activo.

## Evidencia
- Capturas pendientes de Grafana para la ventana 10:30–10:42:
  - *Bank USAC - SLO Account y Payment*: burn rate, presupuesto y tasa de error;
  - *Bank USAC - Transferencias y API Gateway*: p50/p95/p99 de la Saga y disponibilidad del Gateway;
  - Prometheus → *Alerts*.
- **Traza en Tempo** `006ce85890f4d9e08197a422bfe7d75d` (152 spans, raíz en `api-gateway`):
  - `transaction.saga.start` → `payment.process` → `publish payment.rejected` → `transaction.saga.compensate` (`bank.transaction.state` COMPENSATING → COMPENSATED, `failure_reason` `PAYMENT_EXTERNAL_FAILURE`, estado público `FAILED`).
  - La traza también muestra eventos desordenados entre réplicas de Transaction: `payment.rejected` llegó antes que `account.funds.reserved` y falló con `Expected transaction status PROCESSING, current status is PENDING`. El reintento de 3 s lo resolvió y la compensación terminó bien.
  - Búsqueda: `{ resource.service.name = "transaction-service" && name = "transaction.saga.compensate" }`.
- **Loki:**
  - `{service_name="payment-service"} | json | event=~"payment.simulation.(changed|reset)"` muestra la inyección y la recuperación.
  - `{service_name=~"payment-service|transaction-service"} | json | traceId="006ce85890f4d9e08197a422bfe7d75d"` muestra los logs de la Saga con el mismo `traceId`.
- **Saldos** por el Gateway (`GET /api/accounts/{id}`) antes y después: Q4796 + Q289 y Q4783 + Q302, ambos con total Q5085.

## Causa raíz
La causa fue la inyección: el procesador externo simulado de Payment rechazó el 60 % de los pagos y dejó vencer el 20 % (timeout de 3 s). El sistema reaccionó como está diseñado:
1. Payment publicó `payment.rejected` con un motivo técnico.
2. Transaction marcó la transferencia `COMPENSATING` y Account liberó la reserva (`account.funds.released`).
3. Transaction cerró la transferencia en `COMPENSATED` con `outcome="technical_error"`, que es lo que cuenta contra el SLO.

Como el procesamiento es asíncrono, el Gateway siguió aceptando con `202`.

## Qué funcionó / qué no
- **Funcionó:**
  - la compensación de la Saga en el 100 % de los casos, sin fondos bloqueados ni duplicados;
  - la alerta de burn rate detectó la falla en 3 min 22 s;
  - la clasificación de los motivos de fallo como `technical_error` (solo esos consumen presupuesto);
  - la inyección y recuperación por el endpoint admin del Gateway, sin port-forward;
  - la traza única de punta a punta para seguir una transferencia fallida;
  - los reintentos ante eventos desordenados.
- **No funcionó o fue lento:**
  - la simulación vive en memoria por pod, y hubo que fijar Payment a 1 réplica para que aplicara a todo el tráfico;
  - el cliente solo ve el fallo al consultar el estado, no al enviar;
  - el p95 de la Saga superó los 5 s por los timeouts de 3 s del procesador, sin corte anticipado.

## Acciones
| Acción | Responsable | Fecha |
|---|---|---|
| Guardar la configuración de simulación de Payment en un ConfigMap o en la base, para que aplique a todas las réplicas sin fijar el HPA | Ale (I1, dueña de Payment) | 23 oct |
| Circuit breaker en Payment hacia el procesador externo: tras N fallos seguidos, rechazar rápido durante un intervalo y bajar la latencia de las Sagas compensadas | Ale (I1) | Fase 4 / mejora |
| Mostrar en el frontend, en el historial, el motivo `PAYMENT_*` con el mensaje de "fondos devueltos" (ya existe en *Transferir*) | Nufio | 23 oct |
| Agregar a `docs/pruebas/escenarios-de-fallo.md` el paso de fijar Payment a 1 réplica y usar el endpoint del Gateway | Nufio | 22 oct |
