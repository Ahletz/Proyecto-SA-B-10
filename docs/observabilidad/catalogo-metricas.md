# Catálogo de métricas — Bank USAC (Fase 3)

Todas las métricas de negocio se declaran **en el código** con la API de OpenTelemetry (`metrics.getMeter('bank-usac')`), salen por OTLP al Collector y Prometheus las lee del exportador del Collector. El Collector agrega a toda serie `service_name` y `deployment_environment`. Convenciones de nombres y etiquetas en [convenciones.md](convenciones.md) §4.

**Reglas que cumple el catálogo:**
- latencia siempre en **histograma**, consultada por percentiles (p50/p95/p99), nunca promedio;
- `outcome` con tres valores (`success`, `business_rejection`, `technical_error`), y **solo `technical_error` consume presupuesto de error**;
- ninguna etiqueta de alta cardinalidad. Los ids (`accountId`, `transactionId`, `correlationId`, `traceId`) van en trazas y logs.

## 1. Métricas de negocio

| Métrica (Prometheus) | Tipo | Etiquetas | Servicios | Qué mide |
|---|---|---|---|---|
| `bank_transfer_duration_seconds` | histograma | `type` (`internal`, `interbank`), `outcome` | Transaction | **Latencia de punta a punta de la transferencia**: de la creación a su estado final en la Saga (`COMPLETED`, `FAILED` o `COMPENSATED`) |
| `bank_operations_total` | contador | `operation`, `outcome` | Transaction, Account, Payment | Operaciones de negocio por resultado. Es el SLI de disponibilidad del SLO |
| `bank_operation_duration_seconds` | histograma | `operation` | Transaction, Account, Payment | Duración de cada operación y del consumo de cada evento (`consume <routing key>`) |
| `bank_events_processed_total` | contador | `event_type`, `outcome` | Transaction, Account, Payment | Eventos consumidos de RabbitMQ por resultado |
| `bank_events_duplicate_total` | contador | `event_type` | Transaction, Account, Payment | Eventos descartados por idempotencia (`processed_events`). Prueba que un reintento o un reprocesamiento de la DLQ no duplica movimientos |
| `bank_interbank_transfers_total` | contador | `role` (`emisor`, `receptor`), `state` | Payment | Depósitos interbancarios por estado (`PENDING`, `SENT`, `TIMEOUT`, `ACCEPTED`, `REJECTED`, `REVERSED`, `late_accepted`, `partner_unreachable`, `callback_failed`) |
| `bank_interbank_reconciliation_mismatches_total` | contador | — | Payment | Diferencias encontradas en la conciliación diaria con el banco pareja |
| `bank_anomalies_detected_total` | contador | — | Account | Anomalías de saldo detectadas (evento `account.anomaly.detected`) |

### Valores de `operation`

| Servicio | `operation` |
|---|---|
| Transaction | `transaction.transfer.internal`, `transaction.transfer.interbank` (una por transferencia al cerrar la Saga) |
| Account | `account.reserve`, `account.complete`, `account.release`, `account.interbank.{reserve,debit,release,credit,reversal}` |
| Payment | `payment.process`, `interbank.send`, `interbank.receive`, `interbank.status`, `interbank.cancel`, `interbank.callback.send`, `interbank.callback.receive`, `interbank.timeout.query`, `interbank.timeout.cancel` |

En `bank_operation_duration_seconds` también aparece `consume <routing key>` (por ejemplo `consume payment.approved`) para cada evento consumido.

### Cómo se clasifica `outcome` en Transaction

`transferOutcome()` en `apps/transaction-service/src/common/telemetry.ts`:
- `COMPLETED` cuenta como `success`;
- los motivos técnicos cuentan como `technical_error`: `PAYMENT_EXTERNAL_FAILURE`, `PAYMENT_TIMEOUT`, `INTERBANK_TIMEOUT`, `INTERBANK_TIMEOUT_NO_RESPONSE` e `INTERBANK_PROCESSING_ERROR`. Son fallas del procesador externo o del banco pareja;
- cualquier otro motivo cuenta como `business_rejection`: fondos insuficientes, KYC no verificado, rechazo del otro banco, límite, etc.

Así el mismo criterio vale en Transaction, Account y Payment, y el SLO no castiga un rechazo legítimo.

## 2. Buckets y por qué

| Histograma | Buckets (s) | Justificación |
|---|---|---|
| `bank_operation_duration_seconds` | 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10 | Operaciones locales (base de datos y un evento). Incluye el **5 s del SLO de latencia**, así que el SLI "bajo 5 s" es exacto (`le="5"`) |
| `bank_transfer_duration_seconds` | 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300 | Una transferencia interna termina en menos de 1 s. Un depósito interbancario puede esperar el vencimiento de **180 s** más la consulta y la cancelación del contrato. Sin buckets hasta 300 s, el p95/p99 interbancario quedaría truncado en `+Inf` |

**Trade-off:** cada bucket es una serie por combinación de etiquetas. `bank_transfer_duration_seconds` tiene 13 buckets × 2 `type` × 3 `outcome` = 78 series por servicio, aceptable. Por eso `operation` **no** lleva `outcome` en el histograma de duración: duplicaría las series sin aportar al SLO.

## 3. Métricas HTTP (instrumentación automática)

| Métrica | Etiquetas usadas | Uso |
|---|---|---|
| `http_server_request_duration_seconds` | `service_name`, `http_route`, `http_request_method`, `http_response_status_code` | **Disponibilidad del Gateway** = 1 − (5xx / total). Los 4xx legítimos no cuentan. También da la latencia p95 por ruta. Se activa con `OTEL_SEMCONV_STABILITY_OPT_IN=http` |

`http_route` es la plantilla de la ruta (`/api/transfers/:correlationId`), nunca el id concreto, así que no genera alta cardinalidad.

## 4. Infraestructura (Prometheus scrapea directo)

| Origen | Métricas usadas | Para qué |
|---|---|---|
| RabbitMQ `:15692/metrics/detailed` | `rabbitmq_detailed_queue_messages_ready`, `rabbitmq_detailed_queue_messages_unacked`, `rabbitmq_detailed_queue_consumers`, `rabbitmq_detailed_queue_messages_acked_total`, `rabbitmq_detailed_exchange_messages_published_total` | **Consumer lag** por cola (listos + sin confirmar), consumidores y throughput |
| kube-state-metrics | `kube_horizontalpodautoscaler_status_current_replicas`, `…_desired_replicas`, `kube_deployment_status_replicas_available`, `kube_pod_container_status_restarts_total`, `kube_deployment_status_observed_generation`, `kube_pod_container_resource_requests` | Réplicas del HPA, alerta `ServiceUnavailable`, reinicios y **anotaciones de despliegue** |
| cAdvisor (kubelet) | `container_cpu_usage_seconds_total`, `container_memory_working_set_bytes` | CPU y memoria por pod contra sus requests |

## 5. Reglas de registro y alertas

| Regla | Expresión (resumen) |
|---|---|
| `bank:error_ratio:rate{5m,30m,1h,6h}` | `technical_error` / total de `bank_operations_total` por `service_name` |
| `bank:burn_rate:{1h,6h}` | `error_ratio` / 0.001 (SLO de 99,9 %) |
| `bank:latency_p95_seconds:5m` | p95 de `bank_operation_duration_seconds` por servicio |

| Alerta | Condición | Runbook |
|---|---|---|
| `SloBurnRateFast` | burn rate > 14,4 en 1 h y en 5 m, durante 2 min | `observability/runbooks/slo-burn-rate.md` |
| `SloBurnRateSlow` | burn rate > 6 en 6 h y en 30 m | `observability/runbooks/slo-burn-rate.md` |
| `HighLatencyP95` | p95 > 5 s | `observability/runbooks/high-latency.md` |
| `ServiceUnavailable` | un deployment con 0 réplicas disponibles | `observability/runbooks/service-unavailable.md` |
| `InterbankPartnerUnreachable` | más de 3 `TIMEOUT` o `partner_unreachable` del emisor en 10 min | `observability/runbooks/interbank-partner.md` |
| `InterbankReconciliationMismatch` | alguna diferencia de conciliación en 15 min | `observability/runbooks/interbank-reconciliation.md` |
| `OtelCollectorDown` | el Collector no responde al scrape | `observability/runbooks/otel-collector-down.md` |

Comportamiento real de estas alertas en carga y fallos: [postmortems](../postmortems/).

## 6. Dashboards (como código en `observability/dashboards/`)

| Dashboard | Contenido |
|---|---|
| *Bank USAC - Visión general* (`bank-overview.json`) | Latencia p95, peticiones/s y % 5xx por servicio; operaciones por resultado |
| *Bank USAC - SLO Account y Payment* (`bank-slo.json`) | SLI de 30 días, presupuesto restante, burn rate, error y latencia p50/p95/p99, panel interbancario, conciliación y duplicados |
| *Bank USAC - Transferencias y API Gateway* (`bank-transactions.json`) | p50/p95/p99 de la transferencia de punta a punta, resultados, error técnico frente a rechazo, disponibilidad del Gateway, latencia por ruta, compensaciones y depósitos interbancarios |
| *Bank USAC - Infraestructura, HPA y broker* (`bank-infra.json`) | Nodos, pods, reinicios, réplicas del HPA, CPU y memoria contra requests, consumer lag, consumidores y throughput por cola. Incluye anotaciones de despliegue |

## 7. Servicios Java

Customer y Notification & Audit (Spring Boot) todavía **no exportan métricas a Prometheus**: no aparecen en `http_server_request_duration_seconds` ni en `bank_*`. Su instrumentación es parte del trabajo de Integrante 2; cuando llegue, sus métricas deben seguir este mismo catálogo.
