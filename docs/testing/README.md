# Evidencia de pruebas

Pruebas automáticas de cada servicio. Corren en CI en cada push a `feature/**` y en cada pull request hacia `develop` (`integrante1-ci.yml`, `integrante2-ci.yml` e `integrante3-ci.yml`; ver [CI/CD](../04-despliegue/04-ci-cd.md)). Estrategia general, humo end-to-end y carga en [Estrategia de pruebas](../07-pruebas/01-estrategia-pruebas.md).

## Resultado por servicio

Ejecución del 23 de octubre de 2026 en `develop`.

| Servicio | Herramienta | Comando | Archivos | Pruebas | Resultado |
|---|---|---|---:|---:|---|
| Account | Vitest | `npm test` | 7 | 58 | 58 passed |
| Payment | Vitest | `npm test` | 8 | 90 | 90 passed |
| Transaction | Vitest | `npm test` | 8 | 63 | 63 passed |
| API Gateway | Vitest | `npm test` | 9 | 33 | 33 passed |
| Customer | JUnit | `mvn -B clean test` | — | 13 | según CI |
| Notification & Audit | JUnit | `mvn -B clean test` | — | 19 | según CI |
| Frontend | Vitest | `npm test` | — | 7 | según CI |
| `interbank-mock` | Vitest | `npm test` | 1 | 3 | según CI |

Los conteos de Customer, Notification y Frontend son los que reporta [la validación de Fase 3](../observabilidad/alex-fase3.md); el de `interbank-mock` es el número de casos declarados en su archivo de pruebas.

## Qué cubren

- **Account:** creación por tipo (saldo mínimo y comisión), reserva y liberación de fondos (Saga), idempotencia, operaciones interbancarias (reserva, débito, crédito y reversos con bloqueo de fila), detector de anomalías, correlación, logs JSON, telemetría y reconexión a RabbitMQ.
- **Payment:** validación de monto y límite, idempotencia por `transactionId`, simulación del procesador externo (`SUCCESS`, `FAILURE`, `TIMEOUT`), reglas y servicio interbancario (envío, consulta, cancelación, callbacks, reversos y conciliación), configuración de la simulación, correlación, logs JSON y telemetría.
- **Transaction:** consumidor de la Saga (éxito, fondos insuficientes, compensación, eventos fuera de orden y duplicados), proyección KYC, historial, publicación de eventos y estados interbancarios que no retroceden.
- **API Gateway:** guards de JWT y roles, contrato `/interbank/v1` con API keys por banco y `traceparent` obligatorio, `503` rápido ante un servicio caído (`proxy.util`), reenvío de filtros de auditoría y controladores de transferencias, historial y clientes.
- **Customer y Notification:** ciclo de vida y KYC con telemetría, ingestión atómica de auditoría con idempotencia, outbox de entrega, entrega de alertas y filtros de auditoría.
- **Frontend:** filtros del historial, mapeo de estados de la Saga y errores del cliente HTTP.

Las verificaciones de observabilidad de Customer y Notification contra un stack local (ciclo de vida, Alertmanager, auditoría y entrega) están en `tests/observability/` y su evidencia en [`docs/pruebas/evidencia-alex-2026-10-23/`](../pruebas/evidencia-alex-2026-10-23/README.md).

## Cómo correrlas

```bash
cd apps/<servicio>   # account-service, payment-service, transaction-service, api-gateway, interbank-mock
npm test

cd apps/customer-service   # o notification-audit-service
mvn -B clean test
```
