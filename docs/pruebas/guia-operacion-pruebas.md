# Guía de operación: carga, fallos y pruebas con el banco pareja

Cómo ejecutar y documentar las pruebas de la Fase 3 sobre producción, y en qué estado está cada una. La aplicación y el stack de observabilidad ya están desplegados por pipeline ([Despliegue](../04-despliegue/07-despliegue-fase3.md)).

## Dónde está cada cosa
| Tema | Ruta |
|---|---|
| Instrumentación y contratos de Account y Payment (métricas, anomalías, simulación de fallos) | [`contratos-account-payment.md`](../observabilidad/contratos-account-payment.md) |
| Convenciones de observabilidad | [`convenciones.md`](../observabilidad/convenciones.md) |
| Stack (Collector, Prometheus, Tempo, Loki, Grafana) | `observability/`, desplegado por `deploy-observability.yml` |
| Dashboard de SLO y presupuesto de error | `observability/dashboards/bank-slo.json` |
| Alertas y runbooks | `observability/alerts/`, `observability/runbooks/` |
| Interbancario: diseño, eventos, Gateway y configuración | [`diseno-interbancario.md`](../interbank/diseno-interbancario.md) |
| Pruebas de carga (k6) | `tests/load/transfers.js`, [`carga.md`](carga.md) |
| Escenarios de fallo y plantilla de postmortem | [`escenarios-de-fallo.md`](escenarios-de-fallo.md), [`plantilla.md`](../postmortems/plantilla.md) |

Grafana: `kubectl -n observability port-forward svc/grafana 3000:3000` (usuario `admin`, contraseña en el Secret `grafana-admin`).

## Estado

| Prueba | Estado |
|---|---|
| Despliegue de la aplicación en GKE y humo en producción | Hecho: `cd-prod.yml`, transferencia de humo `COMPLETED` |
| Gateway interbancario (`/interbank/v1`, HTTPS, API key por banco, `traceparent`) | Hecho |
| Carga nominal y de estrés (k6) | Hecho: [postmortem de estrés](../postmortems/2026-10-21-estres-account-concurrencia.md) |
| Escenario 1, procesador de pagos degradado | Hecho: [postmortem](../postmortems/2026-10-21-escenario1-payment-degradado.md) |
| Escenario 3, caída de Account | Hecho: [postmortem](../postmortems/2026-10-21-escenario3-account-caido.md) |
| Fallo del broker en la ingestión de Notification | Hecho en local: [postmortem](../postmortems/2026-10-23-alex-broker-local.md) |
| Escenario 2, latencia sobre el SLO | Sin postmortem propio |
| Depósitos contra `interbank-mock` (aceptado, `TIMEOUT` → `REVERSED`, entrante idempotente) | Hecho en producción |
| Pruebas conjuntas con BANK13 y escenario de fallo con el banco pareja | **Pendiente**: ver [acuerdo de integración](../interbank/acuerdo-integracion.md#5-ventana-de-pruebas-conjuntas) |

## Carga y escenarios de fallo
1. Crear un cliente activo con KYC verificado y dos cuentas propias con saldo (≥ Q500).
2. Correr k6 en los perfiles `smoke`, `load` y `stress` ([comandos](carga.md)); guardar la salida.
3. Con la carga corriendo, ejecutar los escenarios de [`escenarios-de-fallo.md`](escenarios-de-fallo.md) y guardar capturas del dashboard, de la alerta y de una traza en Tempo.
4. Escribir un postmortem por escenario con la [plantilla](../postmortems/plantilla.md).

Si el login de k6 falla, ajustar los campos de `setup()` en `transfers.js` al formato real de `/api/customers/login`.

## Pruebas con el banco pareja
Somos `BANK08`; el grupo 13 (contacto: Ángel) es `BANK13`. Los datos acordados (URL, claves y cuentas de prueba) están en el [acuerdo de integración](../interbank/acuerdo-integracion.md).

1. Cada banco entrega al otro, por un canal privado, su URL base, su API key y una cuenta de prueba. Las claves viven solo en Secrets: `bank-interbank-secret` (`INTERBANK_PARTNERS`, salientes) y `gateway-interbank-keys` (`INTERBANK_API_KEYS`, entrantes). Tras cambiar un Secret: `kubectl -n prod rollout restart deploy/payment-service` (o `api-gateway`).
2. Prueba conjunta en la ventana acordada: conectividad (`/health` y clave inválida → `401`), depósito saliente, depósito entrante con reenvío idéntico, timeout, reverso y conciliación. Estados esperados en el [diseño](../interbank/diseno-interbancario.md).
3. Capturar Tempo de ambos lados con el mismo `traceId`.
4. Escenario de fallo con el banco pareja: con carga corriendo, el banco socio deja de responder o responde lento. Debe verse `partner_unreachable` o `TIMEOUT`, la alerta `InterbankPartnerUnreachable`, la resolución tras `expiresAt + 300 s` y la conciliación final sin diferencias. Los fallos se inyectan con `interbank-mock`, nunca alterando el sistema del otro grupo.

Si el formato de cuenta del banco 13 no es el nuestro (UUID sin guiones, 32 hex), se ajusta en un solo punto del código de Payment y Account.

## Si algo falla
- Cada alerta enlaza su runbook en `observability/runbooks/`.
- Simulación de fallos de Payment: `GET/POST/DELETE /api/admin/payment-simulation` con un ADMIN. Con más de una réplica, fijar Payment a 1 réplica para que el cambio aplique ([escenarios](escenarios-de-fallo.md)).
- Dudas sobre estados, eventos y decisiones interbancarias: [`diseno-interbancario.md`](../interbank/diseno-interbancario.md).
