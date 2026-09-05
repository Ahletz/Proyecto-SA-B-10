#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
echo '1. Estado de contenedores'; (cd "$ROOT/infrastructure" && docker compose ps)
echo '2. Ejecutando prueba funcional E2E'; "$ROOT/scripts/project/smoke-local.sh"
echo '2b. Validando roles ADMIN/CASHIER'; "$ROOT/scripts/project/smoke-roles-local.sh"
echo '2c. Validando fallos y compensación Saga'; "$ROOT/scripts/project/smoke-saga-failures-local.sh"
echo '3. RabbitMQ queues'; docker exec bank-rabbitmq rabbitmqctl list_queues name messages_ready messages_unacknowledged 2>/dev/null || true
echo '4. El frontend queda disponible en http://localhost:3000 y MailHog en http://localhost:8025'
