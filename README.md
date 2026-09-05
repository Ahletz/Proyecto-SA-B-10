# Proyecto-SA-B-10 — Bank USAC

Monorepo académico de Software Avanzado, Fase I.

## Arquitectura
Exactamente cinco microservicios: Customer, Account, Transaction, Payment y Notification & Audit. API Gateway como único punto de entrada. RabbitMQ para comunicación asíncrona entre microservicios. Una PostgreSQL independiente por microservicio.

## Inicio rápido
```bash
./scripts/project/start-local.sh
./scripts/project/smoke-local.sh
```

Frontend: `http://localhost:3000`
Gateway: `http://localhost:8080`
RabbitMQ: `http://localhost:15672`
MailHog: `http://localhost:8025`

Kubernetes:
```bash
./scripts/project/start-k8s.sh
./scripts/project/smoke-k8s.sh
```

Documentación técnica: [`docs/README.md`](docs/README.md).
