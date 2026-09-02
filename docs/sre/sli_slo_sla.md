# SLI, SLO y SLA - Account Service y Payment Service

## Objetivo

Este documento define los indicadores de confiabilidad (SLI), los objetivos de nivel de servicio (SLO) y los acuerdos de nivel de servicio (SLA) para Account Service y Payment Service, cubriendo disponibilidad, éxito de operaciones, latencia de procesamiento y consumo de eventos.

## 1. Disponibilidad del servicio

| SLI | SLO | SLA |
|---|---|---|
| Porcentaje de peticiones HTTP respondidas exitosamente (código 2xx) sobre el total de peticiones recibidas, medido en ventanas de 5 minutos | 99% de disponibilidad mensual | Si la disponibilidad cae por debajo del 95% durante un mes, se documenta como incidente y se revisa la causa raíz antes del siguiente despliegue |

![Disponibilidad del servicio](grafica2.png)

*Figura 1. Ejemplo ilustrativo del comportamiento de disponibilidad de Account Service a lo largo de 7 días, comparado contra el SLO de 99%. Los valores son simulados para fines de documentación; se recomienda reemplazarlos con datos reales una vez el sistema cuente con monitoreo en producción.*

## 2. Éxito de operaciones (reserva de fondos y procesamiento de pagos)

| SLI | SLO | SLA |
|---|---|---|
| Porcentaje de eventos `transaction.created` que resultan en `account.funds.reserved` publicado sin error, y porcentaje de eventos `account.funds.reserved` que resultan en `payment.approved` o `payment.rejected` publicado correctamente | 98% de operaciones procesadas sin error interno (`INTERNAL_ERROR`) | Si el porcentaje de éxito cae por debajo del 90% en un día, se prioriza la corrección antes de continuar con nuevas funcionalidades |

## 3. Latencia de procesamiento de eventos

| SLI | SLO | SLA |
|---|---|---|
| Tiempo transcurrido entre el `timestamp` de un evento recibido y el momento en que su procesamiento se registra en `processed_events` | 95% de los eventos procesados en menos de 2 segundos | Si el percentil 95 supera los 5 segundos de forma sostenida, se evalúa el dimensionamiento del servicio |

![Latencia de procesamiento de eventos](grafica1.png)

*Figura 2. Ejemplo ilustrativo de latencia de procesamiento de eventos de Account Service a lo largo de 7 días, comparado contra el SLO de 2 segundos. Los valores son simulados para fines de documentación; se recomienda reemplazarlos con datos reales una vez el sistema cuente con monitoreo en producción.*
## 4. Consumo de eventos sin pérdida (idempotencia)

| SLI | SLO | SLA |
|---|---|---|
| Porcentaje de eventos recibidos que quedan registrados en `processed_events` exactamente una vez, sin duplicados ni pérdidas | 100% de los eventos procesados exactamente una vez | Cualquier evento procesado más de una vez o no procesado se documenta como incidente crítico, dado que compromete la integridad de los saldos |

## Notas

- Las métricas de disponibilidad y latencia se pueden obtener a partir de los logs de Spring Boot y las consultas a la tabla `processed_events`.
- El SLO de idempotencia es más estricto (100%) porque un evento duplicado en un sistema bancario puede causar una transferencia o un pago duplicado.
- Estos indicadores aplican a Account Service y Payment Service; los demás microservicios definen los suyos según su propio dominio.