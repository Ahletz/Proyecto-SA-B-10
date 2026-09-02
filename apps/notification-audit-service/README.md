# Notification & Audit Service

Este servicio consume eventos del broker RabbitMQ y registra la recepción para auditoría e idempotencia.

## Flujo esperado

- Consume la queue `svc.notification.dev.customer`
- Escucha eventos del tipo `customer.*`
- Guarda el `eventId` para evitar duplicados
- Loguea eventType, correlationId y payload

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

1. Levantar infraestructura con Docker Compose
2. Registrar un cliente en Customer Service
3. Revisar la queue `svc.notification.dev.customer` en RabbitMQ UI
4. Confirmar que el servicio procesa el evento y guarda el registro en PostgreSQL
