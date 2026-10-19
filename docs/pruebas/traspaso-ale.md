# Traspaso de Ale (Account, Payment, observabilidad e interbancario)

Rama: `feature/fase3-observabilidad`. Todo lo de Ale está implementado, probado con tests y subido. Lo que sigue es **ejecutar y documentar**, y puede hacerlo cualquiera del equipo con estas instrucciones.

## Qué hay y dónde
| Tema | Ruta |
|---|---|
| Instrumentación y contratos de Account/Payment (métricas, anomalías, simulación de fallos) | `docs/observabilidad/contratos-account-payment.md` |
| Convenciones de observabilidad | `docs/observabilidad/convenciones.md` |
| Stack (Collector, Prometheus, Tempo, Loki, Grafana) | `observability/` (se despliega con el workflow `deploy-observability`) |
| Dashboard de SLO y error budget | `observability/dashboards/bank-slo.json` |
| Alertas (2 de burn rate) y runbooks | `observability/alerts/slo-alerts.yaml`, `observability/runbooks/` |
| Interbancario: diseño, eventos, Gateway, configuración | `docs/interbank/diseno-interbancario.md` |
| Pruebas de carga (k6) | `tests/load/transfers.js`, `docs/pruebas/carga.md` |
| Escenarios de fallo y plantilla de postmortem | `docs/pruebas/escenarios-de-fallo.md`, `docs/postmortems/plantilla.md` |

Grafana: `kubectl -n observability port-forward svc/grafana 3000:3000` (usuario `admin`, contraseña en el Secret `grafana-admin`).

## Pendiente 1: desplegar la aplicación (Nufio)
Hoy el clúster solo tiene `observability`. Falta desplegar la app (merge a `main` o `release.yml` + `cd-prod.yml`). Además:
- Crear el Secret `bank-interbank-secret` en `prod` (claves `INTERBANK_BANK_CODE`, `INTERBANK_PARTNERS`, `ADMIN_TOKEN`); lo referencia `k8s/payment-service/deployment.yaml` como opcional. Formato de `INTERBANK_PARTNERS`: `{"BANKnn":{"baseUrl":"https://host/interbank/v1","apiKey":"..."}}`.
- Gateway: exponer `/interbank/v1/*` hacia Payment, reescribir `X-Caller-Bank-Code`, reenviar `Idempotency-Key` y `traceparent`, y **no** exponer `/internal/*` (ver diseño, secciones de Gateway y Saga).

## Pendiente 2: carga y escenarios de fallo (Nufio)
1. Crear un cliente activo con dos cuentas propias y saldo (≥ Q500).
2. Correr k6 en los perfiles `smoke`, `load` y `stress` (comandos en `docs/pruebas/carga.md`; guardar la salida).
3. Con la carga corriendo, ejecutar los escenarios 1 a 3 de `escenarios-de-fallo.md`, guardando capturas del dashboard, de la alerta y de una traza en Tempo.
4. Escribir un postmortem por escenario con `docs/postmortems/plantilla.md`. Cada integrante entrega los que le asigna el plan.
Si el script de login de k6 falla, ajustar los campos de `setup()` en `transfers.js` al formato real de `/api/customers/login`.

## Pendiente 3: eventos de Account/Payment hacia Notification y Audit (Alex)
Bindear colas al routing key `account.anomaly.detected` (payload en `contratos-account-payment.md`). Notification avisa al cliente, Audit lo guarda; enmascarar el correo en logs. Audit puede registrar también `interbank.*` y `account.interbank.*`.

## Pendiente 4: pruebas con el banco socio (Ale + Ángel)
Depende de que Ángel confirme formato de cuenta, `baseUrl`, API keys y horario. Ahí se prueban depósito entrante y saliente, timeout, reversa y conciliación, y se hace el escenario de banco socio caído. Este es el único punto que sigue con Ale, por ser quien coordina con Ángel.

## Si algo falla
- Alertas: cada una enlaza su runbook en `observability/runbooks/`.
- Simulación de fallos de Payment: `GET/POST/DELETE /internal/payment-simulation` (port-forward a `payment-service:3005`, header `X-Admin-Token`).
- Dudas de código de Account/Payment/interbancario: el diseño en `docs/interbank/diseno-interbancario.md` explica estados, eventos y decisiones.
