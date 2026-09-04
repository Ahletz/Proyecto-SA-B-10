# SLI - Account Service y Payment Service

## Objetivo

Este documento define los indicadores de nivel de servicio (SLI) para Account Service y Payment Service, cubriendo disponibilidad, éxito de operaciones, latencia de procesamiento y consumo de eventos.

## 1. Disponibilidad del servicio

**SLI:** Porcentaje de peticiones HTTP respondidas exitosamente (código 2xx) sobre el total de peticiones recibidas, medido en ventanas de 5 minutos.

## 2. Éxito de operaciones (reserva de fondos y procesamiento de pagos)

**SLI:** Porcentaje de eventos `transaction.created` que resultan en `account.funds.reserved` publicado sin error, y porcentaje de eventos `account.funds.reserved` que resultan en `payment.approved` o `payment.rejected` publicado correctamente.

## 3. Latencia de procesamiento de eventos

**SLI:** Tiempo transcurrido entre el `timestamp` de un evento recibido y el momento en que su procesamiento se registra en `processed_events`.

## 4. Consumo de eventos sin pérdida (idempotencia)

**SLI:** Porcentaje de eventos recibidos que quedan registrados en `processed_events` exactamente una vez, sin duplicados ni pérdidas.