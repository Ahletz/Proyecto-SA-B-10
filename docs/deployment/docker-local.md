# Despliegue local Docker Compose

Ejecute desde la raíz:

```bash
./scripts/project/start-local.sh
```

Servicios visibles:
- Frontend `http://localhost:3000`
- Gateway `http://localhost:8080`
- RabbitMQ UI `http://localhost:15672`
- MailHog `http://localhost:8025`

Las BD publican 5433–5437 únicamente para desarrollo. Los microservicios se comunican por la red interna de Compose.

Detener: `./scripts/project/stop-local.sh`. Reinicio destructivo: `./scripts/project/reset-local.sh`.
