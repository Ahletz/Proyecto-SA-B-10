#!/usr/bin/env bash
set -Eeuo pipefail
API_BASE="${API_BASE:-http://localhost:8080}"
req(){ curl -fsS -H 'Content-Type: application/json' "$@"; }
STAMP="$(date +%s%N | tail -c 10)"; USER="saga.$STAMP"; EMAIL="$USER@bankusac.local"; PASS='Demo123!'
REG=$(req -X POST "$API_BASE/api/customers/register" -d "{\"email\":\"$EMAIL\",\"username\":\"$USER\",\"password\":\"$PASS\",\"fullName\":\"Saga Demo $STAMP\",\"documentNumber\":\"SAGA-$STAMP\",\"documentPhoto\":\"demo.png\",\"birthDate\":\"1990-01-01\",\"address\":\"Guatemala\"}")
ACT=$(printf '%s' "$REG"|python3 -c 'import sys,json;print(json.load(sys.stdin)["activationToken"])'); req "$API_BASE/api/customers/activate/$ACT" >/dev/null
JWT=$(req -X POST "$API_BASE/api/customers/login" -d "{\"username\":\"$USER\",\"password\":\"$PASS\"}"|python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])'); AUTH=(-H "Authorization: Bearer $JWT")
mkacc(){ req "${AUTH[@]}" -X POST "$API_BASE/api/accounts" -d "{\"type\":\"MONETARY\",\"initialBalance\":$1}"|python3 -c 'import sys,json;print(json.load(sys.stdin)["accountId"])'; }
poll(){ local cid="$1" want="$2" status=''; for i in $(seq 1 25); do sleep 1; status=$(req "${AUTH[@]}" "$API_BASE/api/transfers/$cid"|python3 -c 'import sys,json;print(json.load(sys.stdin).get("status",""))' 2>/dev/null||true); echo "  $cid -> $status"; [[ "$status" == "$want" ]]&&return 0; done; return 1; }

echo '[failure 1] Fondos insuficientes -> FAILED'
LOW=$(mkacc 10); TARGET=$(mkacc 0)
CID=$(req "${AUTH[@]}" -X POST "$API_BASE/api/transfers" -d "{\"sourceAccount\":\"$LOW\",\"targetAccount\":\"$TARGET\",\"amount\":100}"|python3 -c 'import sys,json;print(json.load(sys.stdin)["correlationId"])')
poll "$CID" FAILED || { echo 'No llegó a FAILED'; exit 1; }

echo '[failure 2] Rechazo Payment posterior a reserva -> COMPENSATED'
HIGH=$(mkacc 2000000); TARGET2=$(mkacc 0)
CID2=$(req "${AUTH[@]}" -X POST "$API_BASE/api/transfers" -d "{\"sourceAccount\":\"$HIGH\",\"targetAccount\":\"$TARGET2\",\"amount\":1500000}"|python3 -c 'import sys,json;print(json.load(sys.stdin)["correlationId"])')
poll "$CID2" COMPENSATED || { echo 'No llegó a COMPENSATED'; exit 1; }
BAL=$(req "${AUTH[@]}" "$API_BASE/api/accounts/$HIGH"|python3 -c 'import sys,json;print(float(json.load(sys.stdin)["balance"]))')
python3 - "$BAL" <<'PYVERIFY'
import sys
b=float(sys.argv[1])
assert b==2000000.0, f'El saldo no fue compensado: {b}'
PYVERIFY
echo 'SAGA FAILURE TEST OK: FAILED + COMPENSATED y saldo restaurado'
