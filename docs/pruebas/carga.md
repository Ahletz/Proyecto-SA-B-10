# Pruebas de carga (Fase 3)

Herramienta: [k6](https://k6.io) por Docker. Script: `tests/load/transfers.js`. Recorre la Saga completa: Gateway → Transaction → Account → Payment.

## Preparación (una vez)
1. Un cliente activo (KYC aprobado) con **dos cuentas propias** y saldo suficiente (≥ Q500 en la cuenta origen; la prueba alterna el sentido y solo se pierde la comisión).
2. URL del Gateway: `kubectl -n prod get svc api-gateway -o jsonpath='{.status.loadBalancer.ingress[0].ip}'`.

## Ejecución
```bash
export BASE_URL=http://<ip-del-gateway>
export EMAIL=... PASSWORD=... SOURCE_ACCOUNT=<uuid> TARGET_ACCOUNT=<uuid>

# 1) humo (30 s)
docker run --rm -i -e BASE_URL -e EMAIL -e PASSWORD -e SOURCE_ACCOUNT -e TARGET_ACCOUNT -e PROFILE=smoke grafana/k6 run - < tests/load/transfers.js
# 2) carga nominal (~7 min, 5 transferencias/s)
docker run --rm -i ... -e PROFILE=load   grafana/k6 run - < tests/load/transfers.js
# 3) estrés (~6 min, hasta 25/s)
docker run --rm -i ... -e PROFILE=stress grafana/k6 run - < tests/load/transfers.js
```
(`...` = los mismos `-e` de arriba.)

## Qué observar y guardar como evidencia
- Salida de k6 (guárdala con `| tee resultados-<perfil>.txt`): tasa de errores, p95 de `create_transfer`, transferencias aceptadas y terminadas.
- Dashboard *Bank USAC - SLO Account y Payment* durante la prueba: operaciones por resultado, latencia p50/p95/p99, burn rate.
- En el perfil de estrés, el punto donde el p95 cruza 5 s o aparecen `technical_error` es el límite del sistema; anótalo y los recursos del pod (`kubectl -n prod top pods`).

## Notas
- Account emite `account.anomaly.detected` cuando una cuenta supera 5 operaciones en 10 min (`ANOMALY_MAX_OPS`): durante la carga se dispara una vez por ventana y cuenta, es esperado y sirve como evidencia de esa función.
- Los escenarios de fallo (`escenarios-de-fallo.md`) se ejecutan con este mismo script corriendo.
