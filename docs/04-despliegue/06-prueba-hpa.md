# Prueba de carga del HPA

Evidencia de que el HPA (`autoscaling/v2`, 80 % de CPU, 1–5 réplicas) escala los microservicios bajo carga y vuelve a bajar sin ella. Se corrió en un cluster kind local con el overlay `dev` (el mismo que despliega `cd-dev.yml`) y `metrics-server`. En producción (GKE) se repetirá cuando exista el cluster.

## Configuración

- Overlay `k8s/overlays/dev` con el componente `k8s/components/autoscaling`: `requests.cpu: 100m`, `limits.cpu: 500m`, HPA al 80 % (80m por pod), `minReplicas: 1`, `maxReplicas: 5`.
- PostgreSQL fuera del cluster (Docker Compose), igual que en `dev`.
- Carga: [`tests/load/hpa-load.js`](../../tests/load/hpa-load.js) con k6, 40 usuarios virtuales durante 4 min (30 s de subida, 3 min sostenidos, 30 s de bajada). Cada iteración consulta historial (`GET /api/transactions`), cuentas (`GET /api/accounts`) y perfil (`GET /api/customers/me`) a través del Gateway.

```bash
API=http://localhost:30080 USERNAME=<cliente> PASSWORD=<clave> ACCOUNT_ID=<uuid> k6 run tests/load/hpa-load.js
kubectl -n dev get hpa -w
```

## Resultado (2026-09-24)

| Métrica k6 | Valor |
| ---------- | ----- |
| Solicitudes | 149 608 (≈ 623/s) |
| Errores | 0 % |
| Latencia | promedio 56 ms · p95 180 ms · máx 3,98 s |

| Servicio | CPU máx. (de 80 %) | Réplicas |
| -------- | ------------------ | -------- |
| Customer | 500 % | 1 → 5 |
| Account | 169 % | 1 → 5 |
| Transaction | 167 % | 1 → 3 |
| Payment | 5 % (no participa en consultas) | 1 |
| Notification & Audit | 12 % (no participa en consultas) | 1 |

Customer y Account llegaron al máximo de 5 réplicas en el primer minuto y medio; Transaction subió a 3. Durante todo el escalado no hubo errores: el rolling update con `maxUnavailable: 0` y las readiness probes evitan enviar tráfico a pods que todavía arrancan.

## Ajuste tras medir: arranque de Spring Boot

Sin carga, Notification & Audit escaló de 1 a 2 réplicas justo después de desplegarse. Customer y Notification & Audit (Spring Boot) usan 130–250m de CPU durante 1–2 minutos al arrancar (compilación JIT) y luego bajan a unos 5m; con `requests` de 100m eso supera el 80 %.

Como pide la sección 2.5 del plan ("ajustar tras medir consumo real"), sus dos HPA tienen `behavior.scaleUp.stabilizationWindowSeconds: 120`: solo escalan si la CPU sigue alta durante 2 minutos. Los servicios NestJS no lo necesitan.

Verificación del ajuste: tras reiniciar Customer y Notification & Audit sin carga, ninguno escaló durante 4 minutos (CPU observada 3–12 %).

## Bajada sin carga

Al terminar la carga la CPU cayó a 1–9 %. Pasada la ventana de estabilización de bajada por defecto (5 min), el HPA empezó a quitar réplicas de forma gradual: a los 5–6 minutos Account estaba en 3, Customer en 2 y Transaction en 2, bajando hacia `minReplicas: 1`.
