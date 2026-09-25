# CI/CD — Fase 2

Pipeline en GitHub Actions que sigue la convención de ramas y tags del enunciado. Las imágenes se publican en **GitHub Container Registry (GHCR)** como `ghcr.io/<owner>/bank-usac/<servicio>:<tag>` y **nunca** se usa el tag `latest`.

## Flujo por rama

| Evento | Workflow | Qué hace |
| ------ | -------- | -------- |
| Push a `feature/**` | `integrante1-ci.yml`, `integrante2-ci.yml`, `integrante3-ci.yml` | Build + test (+ lint) de los servicios que cambiaron, prueba de `docker build` y validación de manifiestos |
| Pull request `feature/*` → `develop` | Los mismos | Repite build + test; si pasa, se puede hacer merge |
| Merge a `develop` | `cd-dev.yml` | Construye y publica las 7 imágenes con tag `sha-<commit>`, las despliega en el namespace `dev` y corre el smoke test end-to-end |
| Push a `release/X.Y.Z` | `release.yml` | Publica imágenes candidatas, las valida con el smoke test y solo entonces publica las imágenes finales `vX.Y.Z` y crea el tag git `vX.Y.Z` |
| Merge a `main` | *pendiente* | CD a producción con rolling update usando las imágenes `vX.Y.Z` (depende del Terraform/cluster de producción) |

### Workflows

| Archivo | Tipo | Uso |
| ------- | ---- | --- |
| `integrante1-ci.yml` | CI | Customer, Notification & Audit y Frontend |
| `integrante2-ci.yml` | CI | Account y Payment (NestJS) |
| `integrante3-ci.yml` | CI | Transaction, API Gateway y manifiestos `k8s/` |
| `reusable-node-ci.yml` | Reutilizable | Build + test (+ lint) de un servicio Node/NestJS |
| `cd-dev.yml` | CD | Imágenes `sha-<commit>` + despliegue en `dev` |
| `release.yml` | CD | Imágenes `vX.Y.Z` + tag git |
| `reusable-kind-smoke.yml` | Reutilizable | Cluster kind efímero + overlay `dev` + smoke test (lo usan `cd-dev.yml` y `release.yml`) |

## CI por integrante

Cada integrante tiene su workflow, filtrado por `paths`, para que un cambio solo dispare los jobs de los servicios afectados. Los servicios Node/NestJS reutilizan `reusable-node-ci.yml`:

```yaml
jobs:
  account-service:
    name: Account - Build and Test
    uses: ./.github/workflows/reusable-node-ci.yml
    with:
      service: account-service   # carpeta dentro de apps/
      lint: false                # true si el servicio tiene script "lint"
      test: true                 # requiere al menos un archivo *.spec.ts
```

El workflow reutilizable instala con `npm ci`, ejecuta lint/test según los inputs, compila con `npm run build` y, en los push, verifica que la imagen Docker construya.

`integrante2-ci.yml` cubre Account y Payment con el mismo workflow reutilizable (solo el código NestJS que se despliega; el código Java paralelo de esas carpetas no se compila). `integrante3-ci.yml` cubre Transaction Service, API Gateway y los manifiestos de `k8s/`. Los manifiestos se renderizan con Kustomize, se validan con kubeconform y se rechaza cualquier imagen `:latest`.

## Manifiestos Kubernetes (Kustomize)

```
k8s/
├── config/                        # namespace, secretos compartidos, bank-db-config/bank-db-secret, NetworkPolicy
├── broker/                        # RabbitMQ
├── <servicio>/deployment.yaml     # manifiestos de cada servicio (los usa start-k8s.sh)
├── <servicio>/kustomization.yaml
├── base/                          # agrupa config, broker y todos los servicios
├── components/autoscaling/        # CPU requests/limits, rolling update, HPA 80 %
└── overlays/dev/                  # namespace dev + versión de imágenes
```

- **Local (`scripts/project/start-k8s.sh`)** aplica los `deployment.yaml` y `config/` directamente en el namespace `bank-usac`, con imágenes `:local`.
- **`overlays/dev`** reutiliza la base y la despliega en el namespace `dev` con el componente de autoscaling. El pipeline fija el tag de cada imagen con `kustomize edit set image`.
- **Configuración de DB:** host, puerto, nombre y usuario de cada base están en el ConfigMap `bank-db-config` y las contraseñas en el Secret `bank-db-secret`, con los nombres de variable de la sección 2.4 del plan (`TRANSACTION_DB_HOST`, …). En producción estos valores vendrán de los outputs de Terraform.
- **Probes HTTP:** los 7 Deployments tienen `readinessProbe` y `livenessProbe`. Los servicios Node usan `/health` y los Spring Boot (Customer, Notification & Audit) `/actuator/health` y `/actuator/health/liveness`; el frontend usa `/`. Los seis servicios de backend tienen además `startupProbe` (150 s en Node, 180 s en Spring Boot) para esperar a RabbitMQ y la DB. Si un servicio Node pierde la conexión con RabbitMQ, el proceso termina y Kubernetes lo reinicia.
- **Autoscaling:** los cinco microservicios tienen `requests.cpu: 100m`, `limits.cpu: 500m`, `RollingUpdate` con `maxUnavailable: 0` / `maxSurge: 1` y un HPA (`minReplicas: 1`, `maxReplicas: 5`, 80 % de CPU). Los HPA de los servicios Spring Boot (Customer, Notification & Audit) tienen `scaleUp.stabilizationWindowSeconds: 120` para no escalar por el pico de CPU del arranque. El HPA necesita `metrics-server` en el cluster; ver la [prueba de carga](06-prueba-hpa.md).

Renderizar el ambiente dev localmente:

```bash
kubectl kustomize k8s/overlays/dev
```

## Ambiente dev

Mientras no exista un cluster persistente, `reusable-kind-smoke.yml` crea un cluster **kind efímero** en el runner. Las cinco PostgreSQL se levantan con Docker Compose **fuera del cluster**, igual que en local. Luego el workflow carga las imágenes publicadas, instala `metrics-server`, aplica `overlays/dev`, espera los rollouts, ejecuta `tests/e2e/smoke.sh` contra el Gateway (`:30080`) y muestra el estado de los HPA. Si algo falla, el job imprime pods y logs.

## Releases

1. Crear la rama `release/X.Y.Z` desde `develop` (por ejemplo `release/2.0.0`) y hacer push.
2. `release.yml` ejecuta, en orden:
   1. **version:** valida que la rama se llame `release/X.Y.Z` y que el tag `vX.Y.Z` no exista. Avisa si falta la variable `PROD_API_BASE_URL`.
   2. **images:** construye y publica las 7 imágenes candidatas `:vX.Y.Z-rc.<n>` (`n` = número de ejecución del workflow).
   3. **smoke:** despliega las candidatas en kind y corre el smoke test (`reusable-kind-smoke.yml`).
   4. **promote:** copia cada candidata a `:vX.Y.Z` con `docker buildx imagetools create`. No recompila: la imagen final tiene el mismo digest que la que pasó el smoke test.
   5. **tag:** crea y publica el tag git `vX.Y.Z` sobre el commit de la rama.
3. Si el workflow falla antes de **promote**, `:vX.Y.Z` no existe: se corrige en la misma rama `release/X.Y.Z` y el push vuelve a ejecutarlo.
4. Un tag publicado no se reescribe. Si hace falta un fix después, se abre `release/X.Y.(Z+1)`.

La URL pública del Gateway que se compila en el frontend se toma de la variable del repositorio `PROD_API_BASE_URL` (Settings → Secrets and variables → Actions → Variables). Si no está definida, el frontend apunta a `http://localhost:8080` y el workflow lo avisa.

## Rollback

- **dev:** el cluster es efímero, así que no hay nada que revertir en él. Se revierte el commit en `develop` (`git revert <commit>`, por PR) y el merge vuelve a desplegar.
- **Release fallida:** si falla antes de **promote** no se publicó ninguna versión final; las imágenes `-rc.<n>` solo son candidatas y no se despliegan en producción.
- **Producción** (cuando exista `cd-prod.yml`): se vuelve a la versión anterior, que sigue publicada porque las imágenes `vX.Y.Z` nunca se sobrescriben.
  - Inmediato: `kubectl -n prod rollout undo deployment/<servicio>` regresa al ReplicaSet anterior con rolling update.
  - Definitivo: volver a desplegar la versión anterior (`kustomize edit set image bank-usac/<servicio>=ghcr.io/<owner>/bank-usac/<servicio>:v<anterior>`), y corregir con una `release/X.Y.(Z+1)`.

## Pendiente (depende de la infraestructura de producción)

- Workflow `cd-prod.yml` (merge a `main` → rolling update con `vX.Y.Z`) y `overlays/prod`, con las variables de base de datos provistas por Terraform.
- Credenciales del cluster como secret del repositorio y acceso del cluster a GHCR (los paquetes son privados por defecto: hacerlos públicos o usar un `imagePullSecret`).
- Despliegue del frontend en Cloud Run/VM.

## Configuración del repositorio (una vez, requiere admin)

- **Branch protection** en `main` y `develop`: exigir pull request y los checks de CI en verde.
- **Settings → Actions → General → Workflow permissions:** "Read and write permissions", para que los workflows publiquen en GHCR y creen tags.
