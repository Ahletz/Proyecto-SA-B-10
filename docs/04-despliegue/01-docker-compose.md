# 10. Despliegue local con Docker Compose

## Comando
```bash
./scripts/project/start-local.sh
```

## Servicios publicados
| Recurso | URL / puerto host |
|---|---|
| Frontend | `http://localhost:3000` |
| API Gateway | `http://localhost:8080` |
| RabbitMQ AMQP | `localhost:5672` |
| RabbitMQ Management | `http://localhost:15672` |
| MailHog | `http://localhost:8025` |
| Customer DB | 5433 |
| Transaction DB | 5434 |
| Notification DB | 5435 |
| Account DB | 5436 |
| Payment DB | 5437 |

Los cinco microservicios solo usan `expose` y no publican sus puertos al host. El frontend consume el Gateway.

## Arranque
Los servicios dependen del healthcheck de su base y RabbitMQ. Las imágenes se construyen desde `apps/<service>/Dockerfile`.

## Detención
```bash
./scripts/project/stop-local.sh
```

Para conservar datos no usar `docker compose down -v`.
