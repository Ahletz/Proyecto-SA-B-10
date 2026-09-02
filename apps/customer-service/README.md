Customer Service (scaffold)

Endpoints:
- POST /api/customers/register
- POST /api/customers/login
- POST /api/customers/activate/{customerId}

Run locally (requires Java + Maven and access to PostgreSQL and RabbitMQ):

```bash
cd apps/customer-service
mvn spring-boot:run
```

Or build Docker image and run (example):

```bash
docker build -t customer-service:local .
docker run --rm -p 8081:8081 \
  -e DB_HOST=host.docker.internal -e DB_PORT=5433 -e DB_DATABASE=bank_customer \
  -e DB_USERNAME=customer_user -e DB_PASSWORD=customer_password \
  -e RABBITMQ_HOST=host.docker.internal -e RABBITMQ_PORT=5672 -e RABBITMQ_DEFAULT_USER=rabbit_user \
  -e RABBITMQ_DEFAULT_PASS=rabbit_password \
  customer-service:local
```

Notes:
- JWT issuance is stubbed with a UUID token in this scaffold; replace with a proper JWT generator in production.
- Event publishing uses the `bank.events` exchange and routing key equal to the eventType.

Tests and quick checks
----------------------

1) Prepare env and infra

```bash
# copy template env and edit secrets
cp apps/customer-service/.env.example apps/customer-service/.env
# (edit apps/customer-service/.env to set JWT_SECRET and other values)

# start infrastructure (Postgres + RabbitMQ)
cd infrastructure
docker compose up -d
```

2) Start the service (Maven)

```bash
cd apps/customer-service
mvn spring-boot:run
```

3) Register a user (returns status and customerId)

```bash
curl -s -X POST http://localhost:8081/api/customers/register \
  -H "Content-Type: application/json" \
  -d '{"email":"a@b.com","username":"user1","password":"secret123"}' | jq
```

Expected: JSON with `status` and `customerId` when successful.

4) Login to receive JWT

```bash
curl -s -X POST http://localhost:8081/api/customers/login \
  -H "Content-Type: application/json" \
  -d '{"username":"user1","password":"secret123"}' | jq
```

Expected: JSON with `token` (JWT). Save this token for authenticated requests.

5) Call a protected endpoint (activate) using the JWT

```bash
TOKEN=<paste-token-here>
curl -s -X POST http://localhost:8081/api/customers/activate/CUST-1 \
  -H "Authorization: Bearer $TOKEN"
```

6) Check health (Actuator)

```bash
curl -s http://localhost:8081/actuator/health | jq
```

7) Docker run example (service + env)

```bash
docker build -t customer-service:local apps/customer-service
docker run --rm -p 8081:8081 \
  --env-file apps/customer-service/.env \
  -e DB_HOST=host.docker.internal -e DB_PORT=5433 -e DB_DATABASE=bank_customer \
  -e DB_USERNAME=customer_user -e DB_PASSWORD=customer_password \
  -e RABBITMQ_HOST=host.docker.internal -e RABBITMQ_PORT=5672 \
  customer-service:local
```

Notes (updated)
- JWT creation is implemented using `apps/customer-service/.env` `JWT_SECRET` and `JWT_EXPIRATION_MS`.
- Use the commands in `apps/customer-service/.env.example` to generate a secure secret (OpenSSL or /dev/urandom).
- The service publishes events to the `bank.events` exchange; verify them via RabbitMQ management UI at `http://localhost:15672`.
