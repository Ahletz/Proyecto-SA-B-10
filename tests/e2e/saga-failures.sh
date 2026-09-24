#!/usr/bin/env bash
set -Eeuo pipefail
API_BASE="${API_BASE:-http://localhost:8080}"
req(){ curl -fsS -H 'Content-Type: application/json' "$@"; }
STAMP="$(date +%s%N | tail -c 10)"; USER="saga.$STAMP"; EMAIL="$USER@bankusac.local"; PASS='Demo123!'
REG=$(req -X POST "$API_BASE/api/customers/register" -d "{\"email\":\"$EMAIL\",\"username\":\"$USER\",\"password\":\"$PASS\",\"fullName\":\"Saga Demo $STAMP\",\"documentNumber\":\"SAGA-$STAMP\",\"documentPhoto\":\"demo.png\",\"birthDate\":\"1990-01-01\",\"address\":\"Guatemala\"}")
CUSTOMER=$(printf '%s' "$REG"|python3 -c 'import sys,json;print(json.load(sys.stdin)["customerId"])')
ACT=$(printf '%s' "$REG"|python3 -c 'import sys,json;print(json.load(sys.stdin)["activationToken"])'); req "$API_BASE/api/customers/activate/$ACT" >/dev/null
JWT=$(req -X POST "$API_BASE/api/customers/login" -d "{\"username\":\"$USER\",\"password\":\"$PASS\"}"|python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])'); AUTH=(-H "Authorization: Bearer $JWT")
mkacc(){ req "${AUTH[@]}" -X POST "$API_BASE/api/accounts" -d "{\"type\":\"MONETARY\",\"initialBalance\":$1}"|python3 -c 'import sys,json;print(json.load(sys.stdin)["accountId"])'; }
poll(){ local cid="$1" want="$2" status=''; for i in $(seq 1 25); do sleep 1; status=$(req "${AUTH[@]}" "$API_BASE/api/transfers/$cid"|python3 -c 'import sys,json;print(json.load(sys.stdin).get("status",""))' 2>/dev/null||true); echo "  $cid -> $status"; [[ "$status" == "$want" ]]&&return 0; done; return 1; }
# Espera un estado final y devuelve "STATUS REASON".
settle(){ local cid="$1" out=''; for i in $(seq 1 25); do sleep 1; out=$(req "${AUTH[@]}" "$API_BASE/api/transfers/$cid"|python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("status",""), d.get("failureReason") or "")' 2>/dev/null||true); case "$out" in COMPLETED*|FAILED*|COMPENSATED*) echo "$out"; return 0;; esac; done; echo "$out"; return 1; }
reason(){ req "${AUTH[@]}" "$API_BASE/api/transfers/$1"|python3 -c 'import sys,json;print(json.load(sys.stdin).get("failureReason") or "")'; }
expect_reason(){ local got; got=$(reason "$1"); [[ "$got" == "$2" ]] || { echo "  motivo esperado $2, recibido '$got'"; exit 1; }; echo "  motivo: $got"; }

echo '[failure 0] Cliente sin KYC VERIFIED -> FAILED (KYC_NOT_VERIFIED)'
SRC0=$(mkacc 1000); TARGET0=$(mkacc 0)
CID0=$(req "${AUTH[@]}" -X POST "$API_BASE/api/transfers" -d "{\"sourceAccount\":\"$SRC0\",\"targetAccount\":\"$TARGET0\",\"amount\":100}"|python3 -c 'import sys,json;print(json.load(sys.stdin)["correlationId"])')
poll "$CID0" FAILED || { echo 'No llegó a FAILED'; exit 1; }
expect_reason "$CID0" KYC_NOT_VERIFIED

echo '[setup] ADMIN verifica KYC para los escenarios siguientes'
ADMIN_JWT=$(req -X POST "$API_BASE/api/customers/login" -d '{"username":"admin","password":"Admin123!"}'|python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
req -H "Authorization: Bearer $ADMIN_JWT" -X PATCH "$API_BASE/api/customers/$CUSTOMER/kyc" -d '{"status":"VERIFIED"}' >/dev/null
sleep 2 # Transaction actualiza su proyección KYC de forma asíncrona

echo '[failure 1] Fondos insuficientes -> FAILED'
LOW=$(mkacc 10); TARGET=$(mkacc 0)
CID=$(req "${AUTH[@]}" -X POST "$API_BASE/api/transfers" -d "{\"sourceAccount\":\"$LOW\",\"targetAccount\":\"$TARGET\",\"amount\":100}"|python3 -c 'import sys,json;print(json.load(sys.stdin)["correlationId"])')
poll "$CID" FAILED || { echo 'No llegó a FAILED'; exit 1; }
expect_reason "$CID" INSUFFICIENT_FUNDS

echo '[failure 2] Rechazo Payment posterior a reserva -> COMPENSATED'
HIGH=$(mkacc 2000000); TARGET2=$(mkacc 0)
CID2=$(req "${AUTH[@]}" -X POST "$API_BASE/api/transfers" -d "{\"sourceAccount\":\"$HIGH\",\"targetAccount\":\"$TARGET2\",\"amount\":1500000}"|python3 -c 'import sys,json;print(json.load(sys.stdin)["correlationId"])')
poll "$CID2" COMPENSATED || { echo 'No llegó a COMPENSATED'; exit 1; }
expect_reason "$CID2" PAYMENT_LIMIT_EXCEEDED
BAL=$(req "${AUTH[@]}" "$API_BASE/api/accounts/$HIGH"|python3 -c 'import sys,json;print(float(json.load(sys.stdin)["balance"]))')
python3 - "$BAL" <<'PYVERIFY'
import sys
b=float(sys.argv[1])
assert b==2000000.0, f'El saldo no fue compensado: {b}'
PYVERIFY

# Payment simula FAILURE (10 %) y TIMEOUT (5 %) al azar: se hacen transferencias
# pequeñas hasta observarlos. Si no aparecen en N intentos no se falla la prueba,
# solo se avisa. Toda compensación observada debe dejar el saldo intacto.
echo '[failure 3] Fallas simuladas de Payment (FAILURE/TIMEOUT) -> COMPENSATED'
MAX_RANDOM_ATTEMPTS="${MAX_RANDOM_ATTEMPTS:-30}"
SRC3=$(mkacc 100000); TARGET3=$(mkacc 0); EXPECTED3=100000
SEEN_FAILURE=''; SEEN_TIMEOUT=''
for attempt in $(seq 1 "$MAX_RANDOM_ATTEMPTS"); do
  CID3=$(req "${AUTH[@]}" -X POST "$API_BASE/api/transfers" -d "{\"sourceAccount\":\"$SRC3\",\"targetAccount\":\"$TARGET3\",\"amount\":10}"|python3 -c 'import sys,json;print(json.load(sys.stdin)["correlationId"])')
  read -r STATUS3 REASON3 < <(settle "$CID3") || { echo "  $CID3 no llegó a un estado final"; exit 1; }
  echo "  intento $attempt -> $STATUS3 $REASON3"
  case "$STATUS3:$REASON3" in
    COMPLETED:) EXPECTED3=$((EXPECTED3 - 10)) ;;
    COMPENSATED:PAYMENT_EXTERNAL_FAILURE) SEEN_FAILURE=1 ;;
    COMPENSATED:PAYMENT_TIMEOUT) SEEN_TIMEOUT=1 ;;
    *) echo "  resultado inesperado: $STATUS3 $REASON3"; exit 1 ;;
  esac
  [[ -n "$SEEN_FAILURE" && -n "$SEEN_TIMEOUT" ]] && break
done
BAL3=$(req "${AUTH[@]}" "$API_BASE/api/accounts/$SRC3"|python3 -c 'import sys,json;print(float(json.load(sys.stdin)["balance"]))')
python3 - "$BAL3" "$EXPECTED3" <<'PYVERIFY3'
import sys
b, expected = float(sys.argv[1]), float(sys.argv[2])
# La cuenta se crea sin comisión: solo las transferencias COMPLETED descuentan saldo.
assert b == expected, f'Saldo {b}, esperado {expected}: una compensación no restauró el saldo'
PYVERIFY3
[[ -n "$SEEN_FAILURE" ]] && echo '  OK: PAYMENT_EXTERNAL_FAILURE compensada' || echo "  AVISO: no se observó FAILURE en $MAX_RANDOM_ATTEMPTS intentos (azar)"
[[ -n "$SEEN_TIMEOUT" ]] && echo '  OK: PAYMENT_TIMEOUT compensada' || echo "  AVISO: no se observó TIMEOUT en $MAX_RANDOM_ATTEMPTS intentos (azar)"

echo 'SAGA FAILURE TEST OK: KYC_NOT_VERIFIED + INSUFFICIENT_FUNDS + PAYMENT_LIMIT_EXCEEDED (compensada) + fallas simuladas de Payment'

