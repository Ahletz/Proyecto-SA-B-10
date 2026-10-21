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

## Pendiente 4: pruebas con el banco socio (Ale coordina, Nufio configura)
Nosotros somos `BANK08`; el grupo 13 (contacto: Ángel) es `BANK13`. Ale es el único punto de contacto con Ángel.

Orden:
1. **Ángel entrega** (Ale lo recibe): formato de número de cuenta, `baseUrl` de su banco, su API key para que nosotros lo llamemos, una cuenta de prueba (número y titular) y la ventana de pruebas.
2. **Ale pasa a Nufio** lo anterior. Nufio guarda la `baseUrl` y la API key de `BANK13` en el Secret `bank-interbank-secret`, clave `INTERBANK_PARTNERS`:
   `{"BANK13":{"baseUrl":"https://HOST/interbank/v1","apiKey":"..."}}`
   y reinicia Payment: `kubectl -n prod rollout restart deploy/payment-service`.
3. **Nufio entrega a Ale** (para dársela a Ángel): la URL pública del Gateway (`https://<gateway>/interbank/v1`) y una API key nueva para `BANK13`, que el Gateway valida en `X-Api-Key` y asocia a `BANK13` al reescribir `X-Caller-Bank-Code` (ver diseño, sección Gateway). **Ale la pasa a Ángel por un canal privado.**
4. **Prueba conjunta** (Ale + Ángel, en la ventana acordada): depósito saliente, depósito entrante, timeout, reversa y conciliación. Ver `diseno-interbancario.md` para los estados esperados.
5. **Escenario de fallo con banco socio** (postmortem de Ale): con carga corriendo, el banco socio deja de responder o responde lento. Debe verse `partner_unreachable` o `TIMEOUT`, la alerta `InterbankPartnerUnreachable`, la resolución tras `expiresAt + 300 s` y la conciliación final sin diferencias. Documentar con `docs/postmortems/plantilla.md`.

Si el formato de cuenta del banco 13 no es el nuestro (UUID sin guiones, 32 hex), avisar a Ale: se ajusta en un solo punto del código de Payment/Account.

## Si algo falla
- Alertas: cada una enlaza su runbook en `observability/runbooks/`.
- Simulación de fallos de Payment: `GET/POST/DELETE /internal/payment-simulation` (port-forward a `payment-service:3005`, header `X-Admin-Token`).
- Dudas de código de Account/Payment/interbancario: el diseño en `docs/interbank/diseno-interbancario.md` explica estados, eventos y decisiones.
