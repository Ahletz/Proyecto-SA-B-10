#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
command -v kind >/dev/null || { echo 'Falta kind'; exit 1; }; command -v kubectl >/dev/null || { echo 'Falta kubectl'; exit 1; }
cd "$ROOT/infrastructure"; [[ -f .env ]] || cp .env.example .env
# Databases intentionally OUTSIDE the Kubernetes cluster.
docker compose up -d customer-db account-db transaction-db payment-db notification-db
if ! kind get clusters | grep -qx bank-usac; then kind create cluster --config "$ROOT/k8s/config/kind-config.yaml"; fi
NODE=bank-usac-control-plane
HOST_GATEWAY=$(docker inspect "$NODE" -f '{{(index .NetworkSettings.Networks "kind").Gateway}}')
echo "External DB host from kind = $HOST_GATEWAY"
# Build local images and load them into kind.
docker build -t bank-usac/customer-service:local "$ROOT/apps/customer-service"
docker build -t bank-usac/account-service:local "$ROOT/apps/account-service"
docker build -t bank-usac/transaction-service:local "$ROOT/apps/transaction-service"
docker build -t bank-usac/payment-service:local "$ROOT/apps/payment-service"
docker build -t bank-usac/notification-audit-service:local "$ROOT/apps/notification-audit-service"
docker build -t bank-usac/api-gateway:local "$ROOT/apps/api-gateway"
docker build --build-arg VITE_API_BASE_URL=http://localhost:30080 -t bank-usac/frontend:local "$ROOT/apps/frontend"
kind load docker-image --name bank-usac bank-usac/customer-service:local bank-usac/account-service:local bank-usac/transaction-service:local bank-usac/payment-service:local bank-usac/notification-audit-service:local bank-usac/api-gateway:local bank-usac/frontend:local
TMP=$(mktemp -d); cp -a "$ROOT/k8s/." "$TMP/"; grep -RIl '__HOST_GATEWAY__' "$TMP" | xargs -r sed -i "s/__HOST_GATEWAY__/$HOST_GATEWAY/g"
kubectl apply -f "$TMP/config/namespace.yaml"; kubectl apply -f "$TMP/config/shared-secret.yaml"; kubectl apply -f "$TMP/broker/rabbitmq.yaml"
for d in customer-service account-service transaction-service payment-service notification-audit-service api-gateway frontend; do kubectl apply -f "$TMP/$d/deployment.yaml"; done
kubectl apply -f "$TMP/config/network-policy.yaml" || true
for d in rabbitmq customer-service account-service transaction-service payment-service notification-audit-service api-gateway frontend; do kubectl -n bank-usac rollout status deployment/$d --timeout=240s; done
kubectl -n bank-usac get pods -o wide
printf '\nFrontend K8s: http://localhost:30000\nGateway K8s: http://localhost:30080\n'
