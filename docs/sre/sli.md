# SLI - Account Service y Payment Service

## Objetivo

Este documento define los indicadores de nivel de servicio (SLI) para Account Service y Payment Service, cubriendo disponibilidad, éxito de operaciones, latencia de procesamiento y consumo de eventos.

## 1. Disponibilidad del servicio

**SLI:** Porcentaje de peticiones HTTP que **no** retornan error de servidor (`5xx`) ni fallan por conexión (timeout, conexión rechazada), sobre el total de peticiones recibidas, medido en ventanas de 5 minutos.

Los errores `4xx` (ej. cuenta no encontrada, monto inválido, saldo mínimo no alcanzado) se excluyen de este SLI porque representan validaciones correctas del sistema, no una falla de disponibilidad.

## 2. Éxito de operaciones (reserva de fondos y procesamiento de pagos)

**SLI:** Porcentaje de eventos `transaction.created` que resultan en `account.funds.reserved` o `account.funds.rejected` publicado sin error interno, y porcentaje de eventos `account.funds.reserved` que resultan en `payment.approved` o `payment.rejected` publicado correctamente.

**Nota importante (Fase 2):** este SLI mide el éxito **técnico** de publicar el evento resultante, no el resultado de negocio. Un rechazo por fondos insuficientes, por saldo mínimo, o por un fallo simulado del procesador de pago externo (`EXTERNAL_FAILURE`, `TIMEOUT`) cuenta como operación **exitosa**, siempre que el evento correspondiente se haya publicado sin error interno (`INTERNAL_ERROR`). La simulación de fallos externos en Payment Service es un comportamiento esperado del sistema, no una falla del servicio.

## 3. Latencia de procesamiento de eventos

**SLI:** Tiempo transcurrido entre el `timestamp` de un evento recibido y el momento en que su procesamiento se registra en `processed_events`.

## 4. Consumo de eventos sin pérdida (idempotencia)

**SLI:** Porcentaje de eventos recibidos que quedan registrados en `processed_events` exactamente una vez, sin duplicados ni pérdidas.
