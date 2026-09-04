# SLA - Account Service y Payment Service

## Objetivo

Este documento define los acuerdos de nivel de servicio (SLA) y las consecuencias asociadas al incumplimiento de los SLO de Account Service y Payment Service.

## 1. Disponibilidad del servicio

**SLA:** Si la disponibilidad cae por debajo del 95% durante un mes, se documenta como incidente y se revisa la causa raíz antes del siguiente despliegue.

## 2. Éxito de operaciones (reserva de fondos y procesamiento de pagos)

**SLA:** Si el porcentaje de éxito cae por debajo del 90% en un día, se prioriza la corrección antes de continuar con nuevas funcionalidades.

## 3. Latencia de procesamiento de eventos

**SLA:** Si el percentil 95 supera los 5 segundos de forma sostenida, se evalúa el dimensionamiento del servicio.

## 4. Consumo de eventos sin pérdida (idempotencia)

**SLA:** Cualquier evento procesado más de una vez o no procesado se documenta como incidente crítico, dado que compromete la integridad de los saldos.

## Notas generales

- Las métricas de disponibilidad y latencia se pueden obtener a partir de los logs de Spring Boot y las consultas a la tabla `processed_events`.
- El SLO de idempotencia es más estricto (100%) porque un evento duplicado en un sistema bancario puede causar una transferencia o un pago duplicado.
- Estos indicadores aplican a Account Service y Payment Service; los demás microservicios definen los suyos según su propio dominio.# SLA - Account Service y Payment Service

## Objetivo

Este documento define los acuerdos de nivel de servicio (SLA) y las consecuencias asociadas al incumplimiento de los SLO de Account Service y Payment Service.

## 1. Disponibilidad del servicio

**SLA:** Si la disponibilidad cae por debajo del 95% durante un mes, se documenta como incidente y se revisa la causa raíz antes del siguiente despliegue.

## 2. Éxito de operaciones (reserva de fondos y procesamiento de pagos)

**SLA:** Si el porcentaje de éxito cae por debajo del 90% en un día, se prioriza la corrección antes de continuar con nuevas funcionalidades.

## 3. Latencia de procesamiento de eventos

**SLA:** Si el percentil 95 supera los 5 segundos de forma sostenida, se evalúa el dimensionamiento del servicio.

## 4. Consumo de eventos sin pérdida (idempotencia)

**SLA:** Cualquier evento procesado más de una vez o no procesado se documenta como incidente crítico, dado que compromete la integridad de los saldos.

## Notas generales

- Las métricas de disponibilidad y latencia se pueden obtener a partir de los logs de Spring Boot y las consultas a la tabla `processed_events`.
- El SLO de idempotencia es más estricto (100%) porque un evento duplicado en un sistema bancario puede causar una transferencia o un pago duplicado.
- Estos indicadores aplican a Account Service y Payment Service; los demás microservicios definen los suyos según su propio dominio.