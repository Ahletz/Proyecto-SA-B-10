# Runbook: HighLatencyP95

**Alerta:** p95 de operaciones de un servicio > 5 s durante 10 min (SLO de latencia).

## Diagnóstico
1. Dashboard *SLO Account y Payment*, panel de latencia p50/p95/p99: ¿un servicio o todos?
2. Trazas lentas en Tempo: `{ resource.service.name = "payment-service" && duration > 5s }`; el span más largo indica la causa (DB, RabbitMQ, banco socio).
3. Simulación activa: `GET /internal/payment-simulation` (`latencyMs`, `timeoutRate`).
4. Recursos: `kubectl -n prod top pods`; throttling de CPU en cAdvisor.
5. Llamadas al banco socio lentas: revisar `INTERBANK_HTTP_TIMEOUT_MS` y trazas del cliente HTTP.

## Mitigación
- Quitar latencia simulada (`DELETE /internal/payment-simulation`).
- Subir réplicas/CPU si hay saturación.
- Si es el banco socio, ver `interbank-partner.md`.

## Verificación
`bank:latency_p95_seconds:5m` < 5 s sostenido 10 min.
