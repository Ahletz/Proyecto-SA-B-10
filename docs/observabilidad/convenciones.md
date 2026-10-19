# Convenciones de observabilidad — Bank USAC (Fase 3)

Versión 1, propuesta por Ale (Integrante 1). Destino en el repo: `docs/observabilidad/convenciones.md`. Si algo cambia, se anota aquí y se avisa a los demás antes de tocar código dependiente.

Aplica a los 5 microservicios y al API Gateway. Nombres de servicio (`serviceName`, `OTEL_SERVICE_NAME`): `customer-service`, `account-service`, `transaction-service`, `payment-service`, `notification-audit-service`, `api-gateway`.

---

## 1. Variables de entorno (todos los servicios)

| Variable | Valor |
|---|---|
| `OTEL_SERVICE_NAME` | el `serviceName` de la lista de arriba |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://otel-collector.observability.svc.cluster.local:4318` (OTLP/HTTP; el Collector también escucha gRPC en `:4317`) |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | `http/protobuf` |
| `OTEL_RESOURCE_ATTRIBUTES` | `deployment.environment=<dev\|prod>,service.version=<tag de la imagen>` |
| `OTEL_TRACES_SAMPLER` | `parentbased_always_on` (el sistema es pequeño y los postmortems necesitan evidencia completa) |
| `OTEL_SDK_DISABLED` | `true` solo en `docker-compose` local sin Collector; nunca en K8s |
| `OTEL_SEMCONV_STABILITY_OPT_IN` | `http` (solo Node: las métricas HTTP salen como `http_server_request_duration_seconds` con la etiqueta `http_response_status_code`) |

El namespace `observability` y el nombre del Service `otel-collector` los crea el stack que despliega Ale. Los servicios no cambian estos nombres.

## 2. Logs: JSON por stdout

Los servicios escriben **solo a stdout, una línea JSON por evento**. Nunca a archivos ni por el broker; el agente de Alex los recoge desde los pods hacia Loki.

| Campo | Obligatorio | Descripción |
|---|---|---|
| `timestamp` | sí | ISO-8601 en UTC |
| `level` | sí | `DEBUG`, `INFO`, `WARN`, `ERROR` |
| `serviceName` | sí | nombre de la lista de arriba |
| `environment` | sí | `dev` o `prod` |
| `version` | sí | tag de la imagen |
| `correlationId` | sí | el que ya maneja el middleware del Gateway (Fase 2); no se cambia el nombre ni el formato |
| `traceId` | sí | `trace_id` del span activo (32 hex); vacío si no hay span |
| `spanId` | sí | `span_id` del span activo (16 hex); vacío si no hay span |
| `message` | sí | texto corto |
| `event` | no | nombre del evento de negocio, por ejemplo `account.reserved` |
| `durationMs` | no | duración de la operación |
| `error` | no | objeto `{type, message, stack}` solo en `ERROR` |

Campos de detalle (`accountId`, `transactionId`, `interbankTransferId`, etc.) van en el JSON del log como campos extra. Nunca como etiqueta de métrica.

**Datos sensibles (siempre enmascarados):**
- Documento de identidad: solo los últimos 4 dígitos (`****1234`).
- Correo: `a***@dominio.com`.
- Contraseñas, JWT, `X-Api-Key`, fotos y cualquier secreto: nunca se escriben, ni siquiera enmascarados.
- Al banco pareja solo se envían números de cuenta, sin datos personales (lo exige el contrato).

**Etiquetas de Loki (poca cardinalidad):** solo `serviceName`, `environment` y `level`. `correlationId` y `traceId` se buscan dentro del JSON, no como etiquetas.

## 3. Trazas

- HTTP: el contexto viaja en el header `traceparent` (W3C). Las librerías de OTel lo propagan solas.
- **RabbitMQ:** al publicar, se inyecta `traceparent` (y `tracestate` si existe) en los headers del mensaje AMQP; al consumir, se extrae y el span del consumidor queda como hijo. El envelope del evento (`correlationId`, `eventId`) no cambia.
- Interbancario: toda llamada al banco pareja lleva `traceparent`, como pide el contrato.
- **Nombres de spans:**
  - Mensajería: `publish <routing key>` y `process <routing key>`, por ejemplo `publish account.reserved`.
  - Lógica de negocio: `<dominio>.<operación>`, por ejemplo `account.reserve`, `payment.simulate`, `transaction.saga.start`, `interbank.send`.
  - HTTP: los genera la instrumentación automática.
- **Atributos de negocio** con prefijo `bank.`: `bank.transaction.id`, `bank.account.id`, `bank.interbank.transfer_id`, `bank.interbank.state`, `bank.operation.outcome`. En trazas sí se permiten identificadores; nunca datos personales.
- El estado de la Saga (`PENDING`, `APPROVED`, `FAILED`, `SENT`, `REVERSED`, ...) se registra como evento del span o atributo, y las compensaciones deben verse como spans.

## 4. Métricas

Prefijo `bank_` y unidad al final. **En el código** se declaran en la notación de OTel (con puntos y sin sufijos); el exportador de Prometheus agrega `_total` y `_seconds`.

| En el código (OTel) | Se consulta en Prometheus | Tipo | Etiquetas permitidas |
|---|---|---|---|
| `bank.operations` | `bank_operations_total` | contador | `operation`, `outcome` |
| `bank.operation.duration` (unidad `s`) | `bank_operation_duration_seconds_bucket` | histograma | `operation` |
| `bank.events.processed` | `bank_events_processed_total` | contador | `event_type`, `outcome` |
| `bank.events.duplicate` | `bank_events_duplicate_total` | contador | `event_type` |
| `bank.interbank.transfers` | `bank_interbank_transfers_total` | contador | `role` (`sender`/`receiver`), `state` |

El Collector agrega solo las etiquetas `service_name` y `deployment_environment` a toda métrica; no se declaran a mano.

- `outcome` toma uno de tres valores: `success`, `business_rejection` o `technical_error`. Un rechazo de negocio (fondos insuficientes, fallo externo simulado de Payment, saldo mínimo) **no** cuenta como error técnico, igual que en el SLO.
- Latencia siempre en histograma y se consulta con percentiles (p50, p95, p99); nunca promedios. Buckets: `0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10` segundos (incluye el 5 s del SLO de latencia).
- Las métricas HTTP automáticas de OTel (`http_server_request_duration_seconds`) se usan para la disponibilidad (% sin 5xx; los 4xx legítimos no cuentan).
- **Prohibido como etiqueta:** `accountId`, `customerId`, `transactionId`, `correlationId`, `traceId`, correo, montos. Eso va en logs o trazas.

## 5. Dónde vive cada cosa en el repo

Todo el stack vive bajo `observability/` y se despliega con `kubectl apply -k observability` desde el pipeline `.github/workflows/deploy-observability.yml`.

| Qué | Ruta |
|---|---|
| Manifiestos (Collector, Prometheus, kube-state-metrics, Tempo, Loki, Grafana) | `observability/k8s/` |
| Dashboards (JSON) | `observability/dashboards/` |
| Reglas de alerta (YAML) | `observability/alerts/` |
| Runbooks, uno por alerta | `observability/runbooks/` |
| Postmortems | `docs/postmortems/` |

Para agregar un dashboard o un archivo de alertas, además de crear el archivo hay que listarlo en `observability/kustomization.yaml`. Acceso a Grafana: `kubectl -n observability port-forward svc/grafana 3000:3000`.

## 6. Notas por tecnología

- **Node/NestJS** (Account, Payment, Transaction, Gateway): SDK de OpenTelemetry cargado antes que el resto de la app (ejemplo en `docs/observabilidad/ejemplos/tracing.ts`), y logger JSON que agregue `traceId` y `spanId` al log. Si el servicio publica con `amqplib`, la instrumentación automática ya inyecta y extrae `traceparent` en los mensajes; se verifica en Tempo que el consumidor aparezca como hijo del publicador.
- **Java/Spring Boot** (Customer, Notification): agente de OpenTelemetry para Java y encoder JSON de logback con `traceId`/`spanId` desde MDC. El agente solo no basta: la rúbrica penaliza instrumentación superficial, así que hay que agregar spans y métricas manuales en la lógica de negocio.
