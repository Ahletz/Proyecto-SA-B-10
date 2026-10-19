# Escenarios de fallo (Fase 3)

Cada escenario se ejecuta con carga corriendo (ver `carga.md`), se documenta con capturas y termina en un postmortem (`docs/postmortems/`). Namespace en GKE: `prod`. Accede a Grafana con `kubectl -n observability port-forward svc/grafana 3000:3000`.

**Antes de empezar:** anota la hora de inicio (UTC), abre el dashboard *Bank USAC - SLO Account y Payment* y deja correr 5 min de carga normal como línea base (captura de pantalla).

## Escenario 1: procesador externo de pagos degradado (Payment)
- **Inyección:** `POST /internal/payment-simulation` con `{"failureRate":0.6,"timeoutRate":0.2}` (port-forward a `svc/payment-service 3005`, header `X-Admin-Token`).
- **Esperado:** sube `technical_error` en `payment.process`; se consume presupuesto de error; dispara `SloBurnRateFast` (≈2 a 5 min con carga sostenida); las transferencias fallan y la Saga compensa (fondos liberados).
- **Evidencia:** burn rate y presupuesto en el dashboard; alerta en Prometheus (`Alerts`); traza fallida en Tempo con `status = error`; logs `payment.rejected` en Loki con el mismo `traceId`; saldos intactos tras compensar.
- **Recuperación:** `DELETE /internal/payment-simulation`. Anota cuánto tardó el burn rate en bajar de 1.

## Escenario 2: latencia sobre el SLO (Payment)
- **Inyección:** `POST /internal/payment-simulation` con `{"latencyMs":6000}`.
- **Esperado:** p95 > 5 s; tras 10 min dispara `HighLatencyP95`. Para el informe basta mostrar el p95 cruzando la línea roja de 5 s; la alerta aparece en `Pending` y luego `Firing`.
- **Evidencia:** panel de latencia p50/p95/p99, traza lenta donde el span de Payment domina la duración, alerta.
- **Recuperación:** `DELETE /internal/payment-simulation`.

## Escenario 3: caída de Account (dependencia de la Saga)
- **Inyección:** `kubectl -n prod scale deploy/account-service --replicas=0` durante 5 min con carga; luego `--replicas=1`.
- **Esperado:** dispara `ServiceUnavailable` (2 min); las transferencias quedan `PENDING` y los mensajes se acumulan en la cola `account-service.events`; al volver Account se consumen, sin duplicar movimientos (idempotencia por `eventId`; revisar `bank_events_duplicate_total`).
- **Evidencia:** cola en RabbitMQ, alerta, trazas completas de la Saga tras la recuperación, saldos consistentes (suma de saldos antes = después, menos comisiones).
- **Nota:** HPA/autoscaling del overlay `prod` puede volver a levantar réplicas; si ocurre, fíjalo antes (`kubectl -n prod get hpa`).

## Escenario 4 (con banco socio): requiere coordinar con Ángel
Banco socio caído o con latencia durante un depósito saliente: debe verse `partner_unreachable`/`TIMEOUT`, la alerta `InterbankPartnerUnreachable`, la resolución por consulta tras `expiresAt + 300 s` y la conciliación final sin diferencias. Se agenda con el equipo del banco socio (ver mensaje a Ángel).

## Qué incluir en cada postmortem
Usa `docs/postmortems/plantilla.md`: cronología con horas, impacto en el SLO (presupuesto consumido, % de errores, alerta que saltó y cuánto tardó), evidencia (capturas, `traceId`), causa raíz, qué funcionó, qué falló y acciones.
