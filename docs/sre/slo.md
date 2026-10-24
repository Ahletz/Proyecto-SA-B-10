# SLO - Account Service y Payment Service

## Objetivo

Este documento define los objetivos de nivel de servicio (SLO) asociados a los SLI de Account Service y Payment Service.

## SLO vigentes en Fase 3 (los que se miden y alertan)

Este es el documento de referencia. Las reglas de `observability/alerts/slo-alerts.yaml`, el dashboard `bank-slo.json`, el runbook `slo-burn-rate.md` y los postmortems usan estos valores.

| Indicador | Objetivo | Ventana | Cómo se mide | Error budget |
|---|---|---|---|---|
| Operaciones sin error técnico | 99.9 % | 30 días | `bank_operations_total`; solo `outcome="technical_error"` consume presupuesto, los rechazos de negocio no | 0.1 %: en 1 000 000 de operaciones, 1 000 pueden fallar |
| Latencia de operación | p95 < 5 s | 5 min | `bank_operation_duration_seconds` (bucket `le="5"`) | Alerta `HighLatencyP95` si se supera 10 min |
| Eventos procesados exactamente una vez | 99.95 % | 30 días | `bank_events_duplicate_total` frente a `bank_events_processed_total` | 0.05 % |

Alertas de consumo del presupuesto: `SloBurnRateFast` (burn rate > 14.4 en 1 h y 5 min) y `SloBurnRateSlow` (> 6 en 6 h y 30 min). Detalle en el [catálogo de métricas](../observabilidad/catalogo-metricas.md).

**Relación con Fase 1/2.** Las secciones 1 a 4 siguientes conservan la definición original (99 %, 98 %, 2 s, 99.95 %). Para disponibilidad y éxito de operaciones, la Fase 3 las unifica en un solo SLO más estricto (99.9 %), porque `bank_operations_total` ya separa el error técnico del rechazo de negocio. Para latencia, el umbral medido y alertado es 5 s (el bucket de 5 s del histograma), no los 2 s originales. La idempotencia se mantiene en 99.95 %. Estos valores se endurecieron o se afinaron por la forma de medirlos; no se relajó ningún objetivo para ocultar fallos.

> Limitación conocida: las reglas de grabación agrupan por `service_name`, así que si dev y prod envían al mismo Prometheus sus series se mezclan. Separar por entorno requiere verificar primero el nombre real de la etiqueta de entorno en Prometheus; queda como mejora.

## 1. Disponibilidad del servicio (definición de Fase 1/2)

**SLO original:** 99% de disponibilidad mensual. En Fase 3 lo reemplaza el 99.9 % de operaciones sin error técnico de la tabla anterior.

**Error budget:** 1% equivale a un máximo de ~7 horas 18 minutos de indisponibilidad acumulada por mes (contando solo errores `5xx` y fallos de conexión, según el SLI corregido).

## 2. Éxito de operaciones (reserva de fondos y procesamiento de pagos)

**SLO original (Fase 1/2; en Fase 3 lo cubre el 99.9 % de la tabla inicial):** 98% de operaciones procesadas sin error interno (`INTERNAL_ERROR`).

## 3. Latencia de procesamiento de eventos

**SLO original (Fase 1/2):** 95% de los eventos procesados en menos de 2 segundos. En Fase 3 se mide y alerta con p95 < 5 s (ver tabla inicial).

Evidencia real de la latencia: el panel de p50/p95/p99 del dashboard *Bank USAC - Transferencias y API Gateway* y el [postmortem del escenario 1](../postmortems/2026-10-21-escenario1-payment-degradado.md), donde el p95 de la Saga llegó a 6,34 s con el procesador externo degradado.

## 4. Consumo de eventos sin pérdida (idempotencia)

**SLO:** 99.95% de los eventos procesados exactamente una vez (equivalente a máximo 1 evento duplicado o perdido por cada 2,000 procesados al mes).

> **Nota de revisión (Fase 2):** en la Fase 1 este SLO se definió como 100%. Se corrigió porque un objetivo de 100% no deja margen de error estadístico (*error budget* de cero) y es considerado un antipatrón en la práctica de SRE — un solo evento duplicado en todo un periodo de medición dejaría el objetivo permanentemente incumplido, sin poder demostrarse de forma realista. El nuevo valor sigue siendo el más estricto de los cuatro SLO, dado el impacto directo en la integridad de los saldos.

## Medición real del presupuesto de error

El dashboard *Bank USAC - SLO Account y Payment* muestra el SLI de 30 días, el presupuesto de error restante y el burn rate a partir de `bank_operations_total`. Ejemplo medido: en el [escenario 1](../postmortems/2026-10-21-escenario1-payment-degradado.md), 983 operaciones con `technical_error` consumieron cerca del 8,4 % del presupuesto mensual (con el supuesto de tráfico que explica el postmortem) y `SloBurnRateFast` pasó a Firing 3 min 22 s después de inyectar la falla.
