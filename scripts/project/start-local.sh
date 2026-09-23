#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$ROOT/infrastructure"
[[ -f .env ]] || cp .env.example .env
# Remove old manual containers that used the same project names before Compose existed.
for c in bank-rabbitmq bank-transaction-db; do docker inspect "$c" >/dev/null 2>&1 && docker rm -f "$c" >/dev/null 2>&1 || true; done
docker compose up -d --build
printf '\nEsperando servicios...\n'
for i in $(seq 1 60); do if curl -fsS http://localhost:8080/health/ready >/dev/null 2>&1; then break; fi; sleep 2; done
curl -fsS http://localhost:8080/health/ready >/dev/null || { echo 'Los servicios no alcanzaron estado READY'; docker compose ps; exit 1; }
docker compose ps
printf '\nURLs:\n  Frontend: http://localhost:3000\n  API Gateway: http://localhost:8080\n  RabbitMQ: http://localhost:15672 (rabbit_user/rabbit_password)\n  MailHog: http://localhost:8025\n'
