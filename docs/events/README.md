# Convenciones de mensajería (Broker) — v1

Este documento define el estándar mínimo para eventos en RabbitMQ dentro del proyecto.

## Resumen

- Exchange principal: `bank.events` (tipo `topic`, durable)
- Routing key recomendada: `customer.*` o `entity.action`
- Queue patrón: `svc.<consumer>.<env>.<entity>`
- DLQ patrón: `svc.<consumer>.<env>.<entity>.dlq`
- Encabezados recomendados: `eventId`, `correlationId`, `version`
- Mensajes JSON con `Content-Type: application/json`

## 1) Exchange y routing

- El exchange global de la plataforma es `bank.events`.
- Los productores publican con routing key basada en el dominio.
- Para Customer, el patrón actual es `customer.*`.
- Ejemplos:
  - `customer.registered`
  - `customer.registration.rejected`
  - `customer.activated`
  - `customer.updated`

## 2) Colas y bindings

- Cada consumidor debe tener su propia cola durable.
- Ejemplo actual:
  - cola: `svc.notification.dev.audit`
  - bindings: `customer.#`, `transaction.#`, `account.#`, `payment.#`
- Cuando un consumidor falle, el mensaje pasa a la DLQ asociada.

## 3) Retries y DLQ

- Los mensajes deben ser persistentes.
- Los consumidores deben reintentar localmente con backoff.
- Si falla definitivamente, el mensaje se mueve a la DLQ.
- DLQ actual:
  - `svc.notification.dev.audit.dlq`

## 4) Idempotencia

- Todo evento debe incluir `eventId`.
- Los consumidores deben guardar ese `eventId` para ignorar duplicados.
- La tabla recomendada es `processed_events` con `event_id` como PK.

## 5) Tracing y correlación

- `correlationId` debe propagase por todo el flujo distribuido.
- Se debe conservar tanto en el envelope del evento como en headers AMQP.

## 6) Versionado

- El envelope incluye `version`.
- Si cambia el payload, se incrementa la versión.
- Los consumidores deben tolerar campos adicionales.

## 7) Gobernanza

- Cualquier cambio en las convenciones debe revisarse por al menos otro integrante.
- La referencia viva es este documento y los contratos de `docs/events/`.

## 8) Ejemplo de flujo actual

- Productor: Customer Service
- Exchange: `bank.events`
- Routing key: `customer.registered`
- Cola consumida: `svc.notification.dev.customer`
- DLQ: `svc.notification.dev.customer.dlq`

