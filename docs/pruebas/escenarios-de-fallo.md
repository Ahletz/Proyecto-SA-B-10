# Escenarios de fallo (Fase 3)

Cada escenario se ejecuta con carga corriendo (ver `carga.md`), se documenta con capturas y termina en un postmortem (`docs/postmortems/`). Namespace en GKE: `prod`. Accede a Grafana con `kubectl -n observability port-forward svc/grafana 3000:3000`.

**Antes de empezar:** anota la hora de inicio (UTC), abre el dashboard *Bank USAC - SLO Account y Payment* y deja correr 5 min de carga normal como línea base (captura de pantalla).

## Escenario 1: procesador externo de pagos degradado (Payment)
- **Antes:** fija Payment a 1 réplica, porque la simulación vive en la memoria de cada pod: `kubectl -n prod patch hpa payment-service -p '{"spec":{"maxReplicas":1}}'`. Al terminar, vuelve a `5`.
- **Inyección:** por el API Gateway con un usuario ADMIN, sin port-forward: `POST /api/admin/payment-simulation` con `{"failureRate":0.6,"timeoutRate":0.2}` (`Authorization: Bearer <token ADMIN>`). `GET` muestra la configuración vigente. El Gateway reenvía a Payment `/internal/payment-simulation` con el `X-Admin-Token` del Secret.
- **Esperado:** sube `technical_error` en `payment.process`; se consume presupuesto de error; dispara `SloBurnRateFast` (≈2 a 5 min con carga sostenida); las transferencias fallan y la Saga compensa (fondos liberados).
- **Evidencia:** burn rate y presupuesto en el dashboard; alerta en Prometheus (`Alerts`); traza fallida en Tempo con `status = error`; logs `payment.rejected` en Loki con el mismo `traceId`; saldos intactos tras compensar.
- **Recuperación:** `DELETE /api/admin/payment-simulation`. Anota cuánto tardó el burn rate en bajar de 1.
- **Resultado (21 oct):** ver `docs/postmortems/2026-10-21-escenario1-payment-degradado.md`.

## Escenario 2: latencia sobre el SLO (Payment)
- **Inyección:** `POST /api/admin/payment-simulation` con `{"latencyMs":6000}` (Payment fijado a 1 réplica, como en el escenario 1).
- **Esperado:** p95 > 5 s; tras 10 min dispara `HighLatencyP95`. Para el informe basta mostrar el p95 cruzando la línea roja de 5 s; la alerta aparece en `Pending` y luego `Firing`.
- **Evidencia:** panel de latencia p50/p95/p99, traza lenta donde el span de Payment domina la duración, alerta.
- **Recuperación:** `DELETE /api/admin/payment-simulation`.

## Escenario 3: caída de Account (dependencia de la Saga)
- **Inyección:** `kubectl -n prod scale deploy/account-service --replicas=0` durante 5 min con carga; luego `--replicas=1`.
- **Esperado:** dispara `ServiceUnavailable` (2 min); las transferencias quedan `PENDING` y los mensajes se acumulan en la cola `account-service.events`; al volver Account se consumen, sin duplicar movimientos (idempotencia por `eventId`; revisar `bank_events_duplicate_total`).
- **Evidencia:** cola en RabbitMQ, alerta, trazas completas de la Saga tras la recuperación, saldos consistentes (suma de saldos antes = después, menos comisiones).
- **Nota:** con `--replicas=0` el HPA deja de actuar (no escala desde 0); al volver a `--replicas=1` retoma el control.
- **Resultado (21 oct, 10:54:58–10:58:59 UTC):** `ServiceUnavailable` en Firing a los 2 min 17 s; las Sagas ya aceptadas terminaron sin duplicados y los saldos cuadraron. Pero las transferencias **nuevas no quedaron `PENDING`**: el Gateway valida en línea con Account que la cuenta origen sea del cliente, así que respondió 500 tras ~10 s. Desde `v0.5.4` responde **503** a los 5 s (PR #54).

## Escenario 4 (con banco socio): requiere coordinar con Ángel
Banco socio caído o con latencia durante un depósito saliente: debe verse `partner_unreachable`/`TIMEOUT`, la alerta `InterbankPartnerUnreachable`, la resolución por consulta tras `expiresAt + 300 s` y la conciliación final sin diferencias. Se agenda con el equipo del banco socio (ver mensaje a Ángel).

## Qué incluir en cada postmortem
Usa `docs/postmortems/plantilla.md`: cronología con horas, impacto en el SLO (presupuesto consumido, % de errores, alerta que saltó y cuánto tardó), evidencia (capturas, `traceId`), causa raíz, qué funcionó, qué falló y acciones.
