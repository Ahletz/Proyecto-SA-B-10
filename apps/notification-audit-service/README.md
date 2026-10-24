# Notification & Audit Service

Microservicio (Spring Boot) que consume los eventos del broker, los audita con idempotencia, los clasifica (`INFO`, `WARNING`, `ERROR`) y entrega las notificaciones (correo de activación, transferencia recibida, anomalías y alertas de SLO). Es el dueño de la base `bank_notification`.

## Flujo

- Consume la cola `notification-audit.events` (DLQ: `notification-audit.events.dlq`).
- Escucha `customer.#`, `transaction.#`, `account.#`, `payment.#` e `interbank.#`. No consume `notification.classified`, para evitar bucles.
- La auditoría y las tareas de entrega se guardan en una sola transacción (`ON CONFLICT DO NOTHING` por `eventId`) y el `ack` llega después del commit.
- Un worker entrega las tareas del outbox (SMTP y `notification.classified` con confirmaciones) con reintentos; tras 10 fallos la tarea queda `FAILED`. SMTP es "al menos una vez".
- Reintenta tres veces con backoff y envía fallos permanentes a la DLQ.

## Endpoints

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| GET | `/api/audit/events` | ADMIN (por el Gateway) | Auditoría. Filtros `correlationId`, `traceId`, `service`, `level`, `q`, `page`, `size` y `paged=true` (ver [referencia API](../../docs/08-manuales/02-referencia-api.md#auditoría-filtros-y-paginación)) |
| POST | `/internal/alerts/slo` | Alertmanager (Bearer desde Secret) | Recibe las alertas de SLO, las deduplica y las notifica. Falla cerrado (`503`) sin token configurado |

La NetworkPolicy solo permite este webhook desde el pod `alertmanager` del namespace `observability`. El contacto de cada cliente se proyecta desde los eventos de Customer; no hay HTTP hacia Customer.

## Variables de entorno

```bash
DB_HOST=localhost
DB_PORT=5435
DB_DATABASE=bank_notification
DB_USERNAME=notification_user
DB_PASSWORD=notification_password
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_DEFAULT_USER=rabbit_user
RABBITMQ_DEFAULT_PASS=rabbit_password
SMTP_HOST=localhost
SMTP_PORT=1025
```

`.env.example` lista además el resto (frontend, OpenTelemetry). Con `OTEL_SDK_DISABLED=true` la telemetría queda apagada en local.

## Ejecutar localmente

```bash
cd apps/notification-audit-service
mvn spring-boot:run
```

## Verificar consumo

1. Levantar infraestructura y servicios con Docker Compose desde `infrastructure/`.
2. Registrar un cliente en Customer Service.
3. Consultar `http://localhost:8082/api/audit/events` (en el sistema completo, `/api/audit/events` del Gateway con un ADMIN).
4. Revisar la cola `notification-audit.events` en la interfaz de RabbitMQ y el correo en MailHog.

La respuesta sin paginar se limita a los 200 eventos más recientes e incluye `eventId`, `eventType`, `version`, `correlationId`, `eventTimestamp`, `processedAt`, `traceId`, `spanId`, `serviceName` y un `payload` saneado (lista permitida de campos; sin tokens, correos ni fotografías).

## Observabilidad

OpenTelemetry con contexto AMQP continuado, logs JSON y métricas de entrega. La readiness depende de la aplicación y su base, no del broker. Ver [Implementación de Customer y Notification](../../docs/observabilidad/alex-fase3.md) y el [runbook de entrega](../../observability/runbooks/notification-delivery.md).

## Pruebas

```bash
mvn -B clean test
```
