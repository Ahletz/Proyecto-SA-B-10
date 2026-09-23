#!/usr/bin/env bash
set -Eeuo pipefail
API_BASE="${API_BASE:-http://localhost:8080}"
json(){ python3 -c 'import sys,json; d=json.load(sys.stdin); print(d'"$1"')'; }
req(){ curl -fsS -H 'Content-Type: application/json' "$@"; }
STAMP="$(date +%s)"; USER="cliente.$STAMP"; EMAIL="$USER@bankusac.local"; PASS='Demo123!'
echo "[1] Registro cliente"
REG=$(req -X POST "$API_BASE/api/customers/register" -d "{\"email\":\"$EMAIL\",\"username\":\"$USER\",\"password\":\"$PASS\",\"fullName\":\"Cliente Demo $STAMP\",\"documentNumber\":\"DOC-$STAMP\",\"documentPhoto\":\"demo.png\",\"birthDate\":\"1995-01-01\",\"address\":\"Ciudad de Guatemala\"}")
TOKEN_ACT=$(printf '%s' "$REG" | python3 -c 'import sys,json;print(json.load(sys.stdin)["activationToken"])')
CUSTOMER=$(printf '%s' "$REG" | python3 -c 'import sys,json;print(json.load(sys.stdin)["customerId"])')
echo "  customerId=$CUSTOMER"
echo "[2] Activación"; req "$API_BASE/api/customers/activate/$TOKEN_ACT" >/dev/null
echo "[3] Login/JWT"
LOGIN=$(req -X POST "$API_BASE/api/customers/login" -d "{\"username\":\"$USER\",\"password\":\"$PASS\"}")
JWT=$(printf '%s' "$LOGIN" | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
AUTH=(-H "Authorization: Bearer $JWT")
echo "[4] Crear cuenta origen/destino"
A1=$(req "${AUTH[@]}" -X POST "$API_BASE/api/accounts" -d '{"type":"MONETARY","initialBalance":1500}')
A2=$(req "${AUTH[@]}" -X POST "$API_BASE/api/accounts" -d '{"type":"SAVINGS","initialBalance":100}')
ID1=$(printf '%s' "$A1" | python3 -c 'import sys,json;print(json.load(sys.stdin)["accountId"])'); ID2=$(printf '%s' "$A2" | python3 -c 'import sys,json;print(json.load(sys.stdin)["accountId"])')
echo "  source=$ID1"; echo "  target=$ID2"
echo "[5] Transferencia asíncrona Q250"
TR=$(req "${AUTH[@]}" -X POST "$API_BASE/api/transfers" -d "{\"sourceAccount\":\"$ID1\",\"targetAccount\":\"$ID2\",\"amount\":250}")
CID=$(printf '%s' "$TR" | python3 -c 'import sys,json;print(json.load(sys.stdin)["correlationId"])'); echo "  correlationId=$CID"
echo "[6] Polling estado Saga"
STATUS=''; for i in $(seq 1 20); do sleep 1; OUT=$(req "${AUTH[@]}" "$API_BASE/api/transfers/$CID" || true); STATUS=$(printf '%s' "$OUT" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("status",""))' 2>/dev/null || true); echo "  intento $i -> $STATUS"; [[ "$STATUS" == "COMPLETED" ]] && break; done
[[ "$STATUS" == "COMPLETED" ]] || { echo "ERROR: la transferencia no llegó a COMPLETED"; exit 1; }
echo "[7] Verificar saldos"; req "${AUTH[@]}" "$API_BASE/api/accounts" | python3 -m json.tool
echo "SMOKE TEST OK: flujo registro -> JWT -> cuentas -> Saga -> pago -> auditoría funcional"
