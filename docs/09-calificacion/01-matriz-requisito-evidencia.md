# Matriz requisito - evidencia

Cruza la hoja de calificación del Proyecto 3 (requisitos 8.1, rúbrica 8.2 y penalizaciones 8.3) con la evidencia documental y ejecutable del repositorio. La columna *Pendiente* indica lo que todavía requiere ejecución o evidencia; el detalle de cada pendiente está en [pendientes compartidos](../observabilidad/pendientes-compartidos-fase3.md).

## Requisitos para optar a la calificación (8.1)

| # | Requisito | Evidencia documental | Evidencia ejecutable | Pendiente |
|---|---|---|---|---|
| 1 | Despliegue en nube | [Despliegue](../04-despliegue/07-despliegue-fase3.md), `deployment-fase3.png` | `kubectl -n prod get pods,hpa`; Cloud Run `bank-usac-frontend` | Confirmar la versión desplegada antes de calificar |
| 2 | OpenTelemetry | [Convenciones](../observabilidad/convenciones.md), `apps/*/src/tracing.ts` y `observability/` de los servicios Java | Trazas y métricas de los 5 servicios y el Gateway en Tempo y Prometheus | — |
| 3 | Trazabilidad distribuida | [Contratos de eventos](../02-eventos/01-contratos-eventos.md) (`traceparent` en headers AMQP) | TraceQL `{ span.bank.correlation_id = "<id>" }` | Workers diferidos de Payment: persistir el contexto original |
| 4 | Logging centralizado | `observability/k8s/loki.yaml`, `otel-logs-agent.yaml` | Consulta en Loki por `traceId` | — |
| 5 | Logs estructurados | [Convenciones](../observabilidad/convenciones.md) | `kubectl -n prod logs <pod>` (JSON con servicio, nivel, `correlationId` y `traceId`) | — |
| 6 | Dashboards | `observability/dashboards/*.json` (5, versionados) | Grafana | — |
| 7 | Métricas SRE | [Catálogo de métricas](../observabilidad/catalogo-metricas.md), [SLI](../sre/sli.md) | p50/p95/p99, error rate, throughput, consumer lag y disponibilidad en los dashboards | Métrica de movimientos de Account con tipo de cuenta y débito/crédito |
| 8 | Integración con Saga | [Saga de transferencia](../03-saga/01-saga-transferencia.md#observabilidad-de-la-saga), [Saga interbancaria](../03-saga/02-deposito-interbancario.md) | Una traza por transferencia con `transaction.saga.start` y `transaction.saga.compensate` | — |
| 9 | Nuevas funcionalidades en los 5 servicios | [Customer y Notification](../observabilidad/alex-fase3.md), [contenedores](../01-arquitectura/09-c4-contenedores.md) | KYC, anomalías, auditoría filtrable, interbancario y métricas por servicio | Validar el receptor de alertas de Notification en prod |
| 10 | Simulación de fallos | [Escenarios de fallo](../pruebas/escenarios-de-fallo.md), [interbank-mock](../../apps/interbank-mock/README.md) | `POST /api/admin/payment-simulation`, modos de `interbank-mock` | — |
| 11 | Consistencia arquitectónica | [Visión general](../01-arquitectura/01-vision-general.md), [Gateway](../01-arquitectura/03-api-gateway-seguridad.md) | `rabbitmqctl list_bindings` | HTTP interno Payment → Account (`cancelAtAccount`): pasarlo al broker o justificarlo |
| 12 | Documentación actualizada | Este árbol y el [catálogo de diagramas](../01-arquitectura/06-catalogo-diagramas.md) | Markdown + PNG | — |
| 13 | Sistema funcional | [Guía de demostración](../07-pruebas/02-guia-demostracion.md) | `tests/e2e/smoke.sh`, Tempo y Loki | — |
| 14 | Stack de observabilidad | [Despliegue](../04-despliegue/07-despliegue-fase3.md), ADR-014 | `deploy-observability.yml` (`kubectl apply -k observability`) | Aceptación del auxiliar sobre Kustomize en lugar de Terraform/Helm |
| 15 | SLO y alertas | [SLO](../sre/slo.md), `observability/alerts/`, `observability/runbooks/` | 7 alertas; `SloBurnRateFast` disparó en el escenario 1 | Separar dev y prod en las reglas |
| 16 | Postmortems | [docs/postmortems](../postmortems/): 4, con cronología, impacto, causa raíz y acciones | Trazas y logs citados en cada uno | Capturas de Grafana de los postmortems del 21 oct |
| 17 | Integración interbancaria | [Diseño](../interbank/diseno-interbancario.md), [acuerdo con BANK13](../interbank/acuerdo-integracion.md), [Saga interbancaria](../03-saga/02-deposito-interbancario.md) | Mock BANK99 en prod: aceptado, `TIMEOUT` → `REVERSED` y entrante idempotente | Prueba conjunta con BANK13 y su postmortem |
| 18 | UEDI | — | — | Entrega en la fecha |
| 19 | Repositorio | `git log` | Auxiliar agregado como colaborador | Confirmar el colaborador |

## Rúbrica (8.2)

| Criterio | Evidencia |
|---|---|
| 1.1 Trabajo en equipo | `git shortlog -sn`, PRs por integrante y ramas `feature/*` |
| 1.2 Documentación técnica | C4 niveles 1, 2 y 3, [despliegue](../04-despliegue/07-despliegue-fase3.md), [catálogo de métricas](../observabilidad/catalogo-metricas.md) y runbooks en `observability/runbooks/` |
| 1.3 Análisis de fallos | [docs/postmortems](../postmortems/) |
| 1.4 Justificación de decisiones | [ADR](../01-arquitectura/05-decisiones-arquitectura.md), [decisiones de Customer y Notification](../observabilidad/decisiones-alex-fase3.md), [SLO](../sre/slo.md) |
| 2.1 OpenTelemetry | Requisito 2 |
| 2.2 Trazas distribuidas | Requisito 3 |
| 2.3 Logging centralizado y estructurado | Requisitos 4 y 5 |
| 2.4 Métricas (SLI) | [Catálogo](../observabilidad/catalogo-metricas.md) y [SLI](../sre/sli.md) |
| 2.5 SLO, error budget y alertas | [SLO](../sre/slo.md); presupuesto consumido en los [postmortems](../postmortems/) |
| 2.6 Dashboards | `observability/dashboards/` |
| 2.7 Funcionalidades nuevas | Requisito 9 |
| 2.8 Pruebas de carga y fallos | [Carga](../pruebas/carga.md), [HPA](../04-despliegue/06-prueba-hpa.md), [escenarios](../pruebas/escenarios-de-fallo.md) |
| 2.9 Integración interbancaria | Requisito 17 |

## Penalizaciones (8.3) que conviene descartar

| Penalización | Cómo se descarta |
|---|---|
| Contexto no cruza el broker | Una traza por transferencia: `traceparent` viaja en los headers AMQP |
| OpenTelemetry no integrado | SDK dentro del código de los servicios |
| Métricas fijas o simuladas | Métricas `bank_*` calculadas por cada operación real |
| Se rompe la asincronía | Ver el pendiente del requisito 11 (HTTP interno Payment → Account) |
| Logs no centralizados | Loki con el agente `otel-logs-agent` |
| Despliegue manual de la observabilidad | `deploy-observability.yml` |
| Datos sensibles en logs o trazas | Logs con redacción; auditoría con lista permitida de campos |
| Depósito duplicado, monto perdido o reembolso sin verificar | Idempotencia por `interbankTransferId`; consulta y cancelación al banco pareja antes de liberar la reserva |

## Requisitos de las fases anteriores

| Requisito | Evidencia documental | Evidencia ejecutable |
|---|---|---|
| 5 microservicios | C4 nivel 2 | `ls apps` / `kubectl get pods` |
| Gateway único | C4 nivel 2, API Gateway | `curl <gateway>/health/ready` |
| Asincronía real | [Topología RabbitMQ](../02-eventos/02-topologia-rabbitmq.md), Saga | `rabbitmqctl list_bindings` |
| 5 BD independientes y externas al cluster | [Data ownership](../01-arquitectura/04-persistencia-data-ownership.md) | Cloud SQL ×5; sin pods de Postgres |
| Customer, JWT y correo | Flujo de autenticación | Registro + MailHog + login |
| Account | C4 nivel 3 Account | Cuentas Q1500/Q100 y saldos |
| Transaction y Saga | Saga y secuencias | smoke `COMPLETED`/`FAILED`/`COMPENSATED` |
| Payment separado | C4 nivel 3 Payment | Auditoría `payment.approved/rejected` |
| Notification y auditoría | C4 nivel 3 Notification | `/api/audit/events` y MailHog |
| Idempotencia, retry y DLQ | [Resiliencia](../05-operacion/01-resiliencia-observabilidad.md) | `processed_events`, colas `.retry` y `.dlq` |
| Roles | [Casos de uso](../uml/use-cases.md) | `smoke-roles-*.sh` |
| Aislamiento de red | [NetworkPolicy](../04-despliegue/03-network-policy.md) | `kubectl describe networkpolicy` |
