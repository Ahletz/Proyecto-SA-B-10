# Broker local (RabbitMQ)

## Estado

RabbitMQ corre como el servicio `rabbitmq` de `infrastructure/docker-compose.yml` (imagen `rabbitmq:4.3.6-management`, credenciales por `.env`). **Cada servicio declara al arrancar sus propias colas y bindings** (`bank.events`, `.retry` y `.dlx`); la topología real está en [Topología RabbitMQ](../../docs/02-eventos/02-topologia-rabbitmq.md). En Kubernetes lo despliega `k8s/broker/rabbitmq.yaml`, con el puerto de métricas `15692`.

`rabbitmq/definitions.json` es un resto de la Fase 1 (cola `svc.notification.dev.audit`): Compose no lo carga y ningún servicio lo usa.

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

## Reglas de uso

- Exchange principal: `bank.events` (topic)
- Routing key = `eventType`, con la forma `dominio.accion` (por ejemplo `customer.registered` o `account.interbank.funds.reserved`)
- Todas las queues deben ser durables
- Todo consumidor debe manejar idempotencia con `eventId`
- Los fallos permanentes deben ir a la DLQ
- Cada servicio define su propia queue y binding

## Limpieza

```bash
cd infrastructure
docker compose down -v
```
