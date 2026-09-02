# Convenciones de mensajería (Broker) — v1 (borrador)

Este documento establece las convenciones mínimas para publicar/consumir eventos en RabbitMQ dentro del proyecto.

Resumen rápido
- Exchange principal: `bank.events` (tipo: `topic`, durable)
- Routing key: `customer.<action>` o `customer.<entity>.<action>` (p.ej. `customer.registered`, `customer.profile.updated`)
- Queues: `svc.<consumer>.<env>.customer` (p.ej. `svc.notification.dev.customer`)
- Mensajes: JSON, `Content-Type: application/json; charset=utf-8`, delivery_mode=2 (persistente)
- Headers recomendados: `correlationId`, `eventId`, `version`

1) Exchanges y routing
- Usar un único exchange lógico `bank.events` de tipo `topic` para eventos del dominio.
- Las routing keys siguen la convención: `<bounded_context>.<entity>.<action>` o `<bounded_context>.<action>` si aplica. Para Customer preferir `customer.<action>`.

2) Queues y binding
- Cada servicio consumidor crea su propia queue durable y la bindea al exchange con la routing key necesaria.
- Nombre de queue: `svc.<consumer>.<env>.<entity>` donde `env` es `dev|stg|prod`.

3) Delivery, retries y DLQ
- Mensajes persistentes (delivery_mode=2).
- Implementar retry por consumidor con backoff exponencial. Reintentos locales preferibles a republish centralizado.
- En caso de fallos permanentes, mover el mensaje a una Dead Letter Queue (DLQ) específica: `dlq.svc.<consumer>.<env>.<entity>`.
- Es recomendable usar TTL + requeue pattern para retrasar reintentos en vez de bloquear el consumer.

4) Idempotencia y deduplicación
- Todo consumidor debe ser idempotente usando `eventId` como clave de deduplicación. Mantener una tabla simple `processed_events(event_id, consumed_at, status)` o cache con TTL.

5) Metadata y tracing
- El `correlationId` lo genera el API Gateway y debe enviarse en los headers AMQP y en el body del evento.
- Incluir `eventId` y `version` en headers para facilitar filtros y tracing en tooling.

6) Versionado de eventos
- Incrementar `version` en el envelope cuando cambie la estructura del `payload`.
- Mantener compatibilidad hacia atrás cuando sea posible: consumidores deben ignorar campos desconocidos.

7) Esquema y validación
- Los contratos (JSON Schema) deben almacenarse junto a `docs/events/` y ser la referencia para validación en productores y consumidores.

8) Ejemplo básico de binding (RabbitMQ CLI / definitions)

	- Exchange: `bank.events` (topic)
	- Queue: `svc.notification.dev.customer`
	- Binding key: `customer.*`

9) Cambios y gobernanza
- Cualquier cambio a estas convenciones debe revisarse con al menos otro integrante y registrarse en control de versiones en `docs/events/`.

Notas
- Estas convenciones son un punto de partida; adaptarlas si se acuerda otra estrategia (p.ej. event mesh, broker por ambiente, o uso de headers más ricos).

