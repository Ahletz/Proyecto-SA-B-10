# Pruebas de sistema

Las pruebas unitarias de cada servicio viven en su carpeta `apps/<servicio>` ([evidencia](../docs/testing/README.md)). Aquí están las de sistema.

| Ruta | Qué hace |
|---|---|
| `e2e/smoke.sh` | Humo end-to-end: registro, activación, login, cuentas, transferencia y saldos finales. Lo invocan `scripts/project/smoke-*.sh` |
| `e2e/roles.sh` | Valida ADMIN en auditoría, CASHIER en pagos y la denegación de auditoría al cajero |
| `e2e/saga-failures.sh` | Fondos insuficientes (`FAILED`) y pago rechazado tras la reserva (`COMPENSATED`) |
| `load/transfers.js` | k6: recorre la Saga completa con los perfiles `smoke`, `load` y `stress` ([pruebas de carga](../docs/pruebas/carga.md)) |
| `load/hpa-load.js` | k6: carga de lectura para evidenciar el HPA ([prueba del HPA](../docs/04-despliegue/06-prueba-hpa.md)) |
| `observability/` | Verificaciones aisladas de Customer y Notification & Audit (ciclo de vida, Alertmanager, auditoría y fallo del broker); ver su [README](observability/README.md) |

Los escenarios de fallo en producción se ejecutan con la carga de `transfers.js` corriendo ([escenarios de fallo](../docs/pruebas/escenarios-de-fallo.md)).
