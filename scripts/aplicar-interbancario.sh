#!/usr/bin/env bash
# Agrega pg-mem (pruebas con base en memoria) como devDependency de Account y Payment.
# Se corre una vez, desde la raíz del repo: bash scripts/aplicar-interbancario.sh
set -euo pipefail
cd "$(dirname "$0")/.."
for svc in account-service payment-service; do
  python3 - "$svc" <<'PY'
import json, sys
p = f"apps/{sys.argv[1]}/package.json"
d = json.load(open(p, encoding="utf-8"))
dev = d.setdefault("devDependencies", {})
dev["pg-mem"] = "^3.0.5"
d["devDependencies"] = dict(sorted(dev.items()))
with open(p, "w", encoding="utf-8") as f:
    json.dump(d, f, indent=2, ensure_ascii=False)
    f.write("\n")
PY
done
grep -c '"pg-mem"' apps/account-service/package.json apps/payment-service/package.json
