#!/usr/bin/env bash
set -Eeuo pipefail
kind delete cluster --name bank-usac || true
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$ROOT/infrastructure"; docker compose stop customer-db account-db transaction-db payment-db notification-db
