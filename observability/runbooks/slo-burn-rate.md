# Runbook: SloBurnRateFast / SloBurnRateSlow

**SLO:** 99.9 % de operaciones sin error técnico en 30 días (presupuesto de error 0.1 %). Solo `outcome="technical_error"` lo consume.
**Fast:** burn rate > 14.4 (1 h y 5 m) → crítico. **Slow:** burn rate > 6 (6 h y 30 m) → advertencia.

## Diagnóstico
1. Grafana → dashboard *SLO Account y Payment*: ¿qué servicio y desde cuándo sube el burn rate?
2. Tipo de error: `sum by (operation) (rate(bank_operations_total{outcome="technical_error"}[5m]))`.
3. Trazas fallidas: Grafana → Explore → Tempo: `{ resource.service.name = "payment-service" && status = error }`.
4. Logs: Loki `{service_name="payment-service"} | json | level="error"`; seguir un `traceId` desde la traza.
5. Dependencias: `kubectl -n prod get pods`, `kubectl -n prod logs deploy/<servicio> --tail=100`, RabbitMQ y base de datos.
6. ¿Hubo despliegue reciente? Revisar el último run de Actions.

## Mitigación
- Despliegue reciente: revertir el commit y dejar que el pipeline redespliegue.
- Dependencia caída (RabbitMQ, DB): restaurarla; el servicio se reconecta o se reinicia (`rollout restart`).
- Fallos simulados activos: `GET /internal/payment-simulation`; restablecer con `DELETE /internal/payment-simulation` (header `x-admin-token`).
- Saturación: subir réplicas o límites en el manifiesto y desplegar.

## Verificación
`bank:burn_rate:1h` por debajo de 1 y la alerta resuelta.

## Escalamiento
Fast sin mitigar en 15 min: avisar a todo el equipo. Registrar el presupuesto consumido y abrir postmortem si pasó del 10 % mensual.
