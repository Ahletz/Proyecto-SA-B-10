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
echo "[3b] ADMIN verifica KYC del cliente"
ADMIN_JWT=$(req -X POST "$API_BASE/api/customers/login" -d '{"username":"admin","password":"Admin123!"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
req -H "Authorization: Bearer $ADMIN_JWT" -X PATCH "$API_BASE/api/customers/$CUSTOMER/kyc" -d '{"status":"VERIFIED"}' >/dev/null
sleep 2 # Transaction actualiza su proyección KYC de forma asíncrona
echo "[4] Crear cuenta origen/destino"
A1=$(req "${AUTH[@]}" -X POST "$API_BASE/api/accounts" -d '{"type":"MONETARY","initialBalance":1500}')
A2=$(req "${AUTH[@]}" -X POST "$API_BASE/api/accounts" -d '{"type":"SAVINGS","initialBalance":100}')
ID1=$(printf '%s' "$A1" | python3 -c 'import sys,json;print(json.load(sys.stdin)["accountId"])'); ID2=$(printf '%s' "$A2" | python3 -c 'import sys,json;print(json.load(sys.stdin)["accountId"])')
echo "  source=$ID1"; echo "  target=$ID2"
# Payment simula fallas externas al azar (FAILURE/TIMEOUT). Si la Saga termina
# compensada por un motivo de pago, se reintenta con una transferencia nueva.
MAX_TRANSFER_ATTEMPTS="${MAX_TRANSFER_ATTEMPTS:-5}"
STATUS=''
for attempt in $(seq 1 "$MAX_TRANSFER_ATTEMPTS"); do
  echo "[5] Transferencia asíncrona Q250 (intento $attempt/$MAX_TRANSFER_ATTEMPTS)"
  TR=$(req "${AUTH[@]}" -X POST "$API_BASE/api/transfers" -d "{\"sourceAccount\":\"$ID1\",\"targetAccount\":\"$ID2\",\"amount\":250}")
  CID=$(printf '%s' "$TR" | python3 -c 'import sys,json;print(json.load(sys.stdin)["correlationId"])'); echo "  correlationId=$CID"
  echo "[6] Polling estado Saga"
  STATUS=''; REASON=''
  for i in $(seq 1 20); do
    sleep 1
    OUT=$(req "${AUTH[@]}" "$API_BASE/api/transfers/$CID" || true)
    read -r STATUS REASON < <(printf '%s' "$OUT" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("status",""), d.get("failureReason") or "")' 2>/dev/null || true)
    echo "  intento $i -> $STATUS $REASON"
    [[ "$STATUS" == "COMPLETED" || "$STATUS" == "FAILED" || "$STATUS" == "COMPENSATED" ]] && break
  done
  [[ "$STATUS" == "COMPLETED" ]] && break
  if [[ "$STATUS" == "COMPENSATED" && "$REASON" == PAYMENT_* ]]; then
    echo "  Payment simuló una falla externa ($REASON); se reintenta"
    continue
  fi
  echo "ERROR: la transferencia terminó en '$STATUS' ${REASON:+($REASON)}"; exit 1
done
[[ "$STATUS" == "COMPLETED" ]] || { echo "ERROR: ninguna transferencia llegó a COMPLETED en $MAX_TRANSFER_ATTEMPTS intentos"; exit 1; }
echo "[7] Verificar saldos"; req "${AUTH[@]}" "$API_BASE/api/accounts" | python3 -m json.tool
echo "SMOKE TEST OK: flujo registro -> JWT -> KYC -> cuentas -> Saga -> pago -> auditoría funcional"
