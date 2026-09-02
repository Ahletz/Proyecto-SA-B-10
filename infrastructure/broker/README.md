# Broker local (RabbitMQ)

## Estado

El broker queda definido de forma reproducible para el proyecto, con:
- exchange principal `bank.events`
- queue del consumidor `svc.notification.dev.customer`
- DLQ `svc.notification.dev.customer.dlq`
- binding `customer.*`
- credenciales inicializadas por `.env`

## Preparación

```bash
cp infrastructure/broker/.env.example infrastructure/broker/.env
```

Editar credenciales si hace falta.

## Levantar infraestructura

```bash
cd infrastructure
docker compose up -d
```

Acceder a la UI:

```text
http://localhost:15672
```

Usuario/contraseña por defecto:

```text
rabbit_user / rabbit_password
```

## Definiciones cargadas

El archivo [infrastructure/broker/rabbitmq/definitions.json](infrastructure/broker/rabbitmq/definitions.json) monta el estado inicial del broker al arrancar el contenedor.

## Reglas de uso

- Exchange principal: `bank.events` (topic)
- Routing key: `customer.*` para eventos de Customer y `entity.action` cuando aplique
- Todas las queues deben ser durables
- Todo consumidor debe manejar idempotencia con `eventId`
- Los fallos permanentes deben ir a la DLQ
- Cada servicio define su propia queue y binding

## Limpieza

```bash
cd infrastructure
docker compose down -v
```
