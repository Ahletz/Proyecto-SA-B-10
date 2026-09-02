# Notification & Audit Service

Este servicio consume eventos del broker RabbitMQ y registra la recepción para auditoría e idempotencia.

## Flujo esperado

- Consume la queue `svc.notification.dev.audit`
- Escucha eventos `customer.#`, `transaction.#`, `account.#` y `payment.#`
- Guarda el envelope y el `eventId` para evitar duplicados
- Reintenta tres veces con backoff y envía fallos permanentes a la DLQ
- Expone `GET /api/audit/events` en el puerto `8082`

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
```

## Ejecutar localmente

```bash
cd apps/notification-audit-service
mvn spring-boot:run
```

## Verificar consumo

1. Levantar infraestructura y servicios con Docker Compose desde `infrastructure/`
2. Registrar un cliente en Customer Service
3. Consultar `http://localhost:8082/api/audit/events`
4. Revisar la queue `svc.notification.dev.audit` en RabbitMQ UI
5. Confirmar que el servicio procesa el evento y guarda el registro en PostgreSQL

La respuesta de auditoría está limitada a los 200 eventos más recientes y contiene `eventId`,
`eventType`, `version`, `correlationId`, `eventTimestamp`, `processedAt` y `payload`.
