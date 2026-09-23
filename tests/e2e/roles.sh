#!/usr/bin/env bash
set -Eeuo pipefail
API_BASE="${API_BASE:-http://localhost:8080}"
login(){ curl -fsS -H 'Content-Type: application/json' -X POST "$API_BASE/api/customers/login" -d "{\"username\":\"$1\",\"password\":\"$2\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])'; }
echo '[roles] ADMIN login + audit'
ADMIN=$(login admin 'Admin123!')
curl -fsS -H "Authorization: Bearer $ADMIN" "$API_BASE/api/audit/events" >/dev/null
echo '[roles] CASHIER login + payments'
CASHIER=$(login cashier 'Cashier123!')
curl -fsS -H "Authorization: Bearer $CASHIER" "$API_BASE/api/payments" >/dev/null
CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $CASHIER" "$API_BASE/api/audit/events")
[[ "$CODE" == "403" ]] || { echo "Esperaba 403 para CASHIER en auditoría, obtuvo $CODE"; exit 1; }
echo 'ROLE TEST OK: ADMIN y CASHIER aplican autorización esperada'
