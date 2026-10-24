# Catálogo de diagramas

Todos los PNG están en `docs/assets/diagramas/`. Las fuentes editables son los archivos Mermaid de `docs/01-arquitectura/c4-src/` (y, para algunos diagramas de fases anteriores, los `.drawio` del paquete de entrega).

| Diagrama | Evidencia |
|---|---|
| C4 Nivel 1 | `c4-context.png` |
| C4 Nivel 2 (con observabilidad e interbancario) | `c4-container-fase3.png` |
| C4 Nivel 3 Customer | `c4-component-customer.png` |
| C4 Nivel 3 Account | `c4-component-account.png` |
| C4 Nivel 3 Transaction | `c4-component-transaction.png` |
| C4 Nivel 3 Payment | `c4-component-payment.png` |
| C4 Nivel 3 Notification/Audit | `c4-component-notification-audit.png` |
| ER por base de datos | `er-databases.png` |
| Bounded contexts | `bounded-contexts.png` |
| Data ownership | `data-ownership.png` |
| Topología RabbitMQ | `event-topology.png` |
| Seguridad/JWT | `auth-security-flow.png` |
| Saga happy path | `saga-success.png` |
| Saga compensación | `saga-compensation.png` |
| Secuencia transferencia | `sequence-transfer.png` |
| Secuencia transferencia fallida / compensación | `sequence-transfer-failure.png` |
| Secuencia creación cuenta | `sequence-create-account.png` |
| Secuencias del depósito interbancario (saliente, timeout, entrante) | `sequence-interbank-outgoing.png`, `sequence-interbank-timeout.png`, `sequence-interbank-incoming.png` |
| Retry/DLQ | `retry-dlq-flow.png` |
| Observabilidad | `observability-correlation.png` |
| Despliegue en producción (GKE `prod` y `observability`, Cloud Run, Cloud SQL) | `deployment-fase3.png` (fuente: [`c4-src/deployment-fase3.mmd`](c4-src/deployment-fase3.mmd)) |
| UML Deployment (kind local) | `uml-deployment.png` |
| UML casos de uso | `uml-use-cases.png` |
| Arranque | `startup-flow.png` |
| Flujo de demostración | `demo-flow.png` |
| E2E | `e2e-test-flow.png` |

## Galería rápida
![C4 L1](../assets/diagramas/c4-context.png)

![C4 L2](../assets/diagramas/c4-container-fase3.png)

![Eventos](../assets/diagramas/event-topology.png)

![Despliegue](../assets/diagramas/deployment-fase3.png)

## Documentación detallada de los diagramas

### Contexto, Customer y Notification & Audit

- [C4 Nivel 1 — Contexto](07-c4-contexto-fase2.md)
- [C4 Nivel 3 — Customer y Notification & Audit](08-c4-componentes-integrante1-fase2.md)

### Contenedores, despliegue, Transaction, Account y Payment, ER y secuencias

- [C4 Nivel 2 — Contenedores](09-c4-contenedores.md) (`c4-container-fase3.png`): aplicación, stack de observabilidad, Ingress HTTPS, banco pareja BANK13, simulador BANK99 y agente de logs.
- [Despliegue](../04-despliegue/07-despliegue-fase3.md) (`deployment-fase3.png`): namespaces `prod` y `observability`, Cloud Run, Cloud SQL, IP estática y Secrets.
- [C4 Nivel 3 — Transaction Service](../assets/diagramas/c4-component-transaction.png): historial por cuenta, proyección KYC, `transaction.status.changed`, idempotencia con `eventId` determinista.
- [C4 Nivel 3 — Account Service](../assets/diagramas/c4-component-account.png): tipos `MONETARY`/`SAVINGS`, saldo mínimo, comisión, reserva/liberación de fondos y desactivación de cuentas inactivas.
- [C4 Nivel 3 — Payment Service](../assets/diagramas/c4-component-payment.png): validación de monto y límite, procesador externo simulado (`SUCCESS`/`FAILURE`/`TIMEOUT`) y motivos de `payment.rejected`.
- [ER por base de datos](../assets/diagramas/er-databases.png): las cinco bases con sus tablas y columnas (ver [Modelo de dominio](02-modelo-dominio.md#diagrama-entidad-relación)).
- Secuencias de transferencia en [Saga de transferencia](../03-saga/01-saga-transferencia.md): `sequence-transfer.png` (éxito con KYC y pago simulado) y `sequence-transfer-failure.png` (KYC, fondos insuficientes y compensación).
- [Depósito interbancario](../03-saga/02-deposito-interbancario.md): `sequence-interbank-outgoing.png` (saliente aceptado), `sequence-interbank-timeout.png` (TIMEOUT → consulta → cancelación → REVERSED) y `sequence-interbank-incoming.png` (entrante con idempotencia).

Fuentes Mermaid: `c4-src/c4-container-fase3.mmd`, `c4-src/deployment-fase3.mmd`, `c4-src/c4-component-{transaction,account,payment}.mmd`, `c4-src/er-databases.mmd`, `c4-src/sequence-transfer.mmd`, `c4-src/sequence-transfer-failure.mmd` y `c4-src/sequence-interbank-{outgoing,timeout,incoming}.mmd`.

Las fuentes Mermaid reproducibles se conservan en `c4-src/`.
