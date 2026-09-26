# SLO - Account Service y Payment Service

## Objetivo

Este documento define los objetivos de nivel de servicio (SLO) asociados a los SLI de Account Service y Payment Service.

## 1. Disponibilidad del servicio

**SLO:** 99% de disponibilidad mensual.

**Error budget:** 1% equivale a un máximo de ~7 horas 18 minutos de indisponibilidad acumulada por mes (contando solo errores `5xx` y fallos de conexión, según el SLI corregido).

## 2. Éxito de operaciones (reserva de fondos y procesamiento de pagos)

**SLO:** 98% de operaciones procesadas sin error interno (`INTERNAL_ERROR`).

## 3. Latencia de procesamiento de eventos

**SLO:** 95% de los eventos procesados en menos de 2 segundos.

![Latencia de procesamiento de eventos](grafica1.png)

*Figura 1. Ejemplo ilustrativo de latencia de procesamiento de eventos de Account Service a lo largo de 7 días, comparado contra el SLO de 2 segundos. Los valores son simulados para fines de documentación; se recomienda reemplazarlos con datos reales una vez el sistema cuente con monitoreo en producción.*

## 4. Consumo de eventos sin pérdida (idempotencia)

**SLO:** 99.95% de los eventos procesados exactamente una vez (equivalente a máximo 1 evento duplicado o perdido por cada 2,000 procesados al mes).

> **Nota de revisión (Fase 2):** en la Fase 1 este SLO se definió como 100%. Se corrigió porque un objetivo de 100% no deja margen de error estadístico (*error budget* de cero) y es considerado un antipatrón en la práctica de SRE — un solo evento duplicado en todo un periodo de medición dejaría el objetivo permanentemente incumplido, sin poder demostrarse de forma realista. El nuevo valor sigue siendo el más estricto de los cuatro SLO, dado el impacto directo en la integridad de los saldos.

![Disponibilidad del servicio](grafica2.png)

*Figura 2. Ejemplo ilustrativo del comportamiento de disponibilidad de Account Service a lo largo de 7 días, comparado contra el SLO de 99%. Los valores son simulados para fines de documentación; se recomienda reemplazarlos con datos reales una vez el sistema cuente con monitoreo en producción.*
