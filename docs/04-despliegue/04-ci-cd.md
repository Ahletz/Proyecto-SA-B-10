# CI/CD — Fase 2

Pipeline en GitHub Actions que sigue la convención de ramas y tags del enunciado. Las imágenes se publican en **GitHub Container Registry (GHCR)** como `ghcr.io/<owner>/bank-usac/<servicio>:<tag>` y **nunca** se usa el tag `latest`.

## Flujo por rama

| Evento | Workflow | Qué hace |
| ------ | -------- | -------- |
| Push a `feature/**` | `integrante1-ci.yml`, `integrante2-ci.yml`, `integrante3-ci.yml` | Build + test (+ lint) de los servicios que cambiaron, prueba de `docker build` y validación de manifiestos |
| Pull request `feature/*` → `develop` | Los mismos | Repite build + test; si pasa, se puede hacer merge |
| Merge a `develop` | `cd-dev.yml` | Construye solo las imágenes de los servicios que cambiaron, reutiliza las demás (ver [Build selectivo](#build-selectivo-monorepo)), publica las 7 con tag `sha-<commit>`, las despliega en el namespace `dev` y corre el smoke test end-to-end |
| Push a `release/X.Y.Z` | `release.yml` | Publica imágenes candidatas, las valida con el smoke test y solo entonces publica las imágenes finales `vX.Y.Z` y crea el tag git `vX.Y.Z` |
| Merge a `main` | `cd-prod.yml` | Despliega en GKE (namespace `prod`) las imágenes `vX.Y.Z` del último tag, con rolling update. Se omite mientras no exista el cluster (`vars.GKE_CLUSTER`) |

### Workflows

| Archivo | Tipo | Uso |
| ------- | ---- | --- |
| `integrante1-ci.yml` | CI | Customer, Notification & Audit y Frontend |
| `integrante2-ci.yml` | CI | Account y Payment (NestJS) |
| `integrante3-ci.yml` | CI | Transaction, API Gateway y manifiestos `k8s/` |
| `reusable-node-ci.yml` | Reutilizable | Build + test (+ lint) de un servicio Node/NestJS |
| `cd-dev.yml` | CD | Imágenes `sha-<commit>` + despliegue en `dev` |
| `release.yml` | CD | Imágenes `vX.Y.Z` + tag git |
| `cd-prod.yml` | CD | Despliegue en GKE (namespace `prod`) |
| `reusable-kind-smoke.yml` | Reutilizable | Cluster kind efímero + overlay `dev` + smoke test (lo usan `cd-dev.yml` y `release.yml`) |

## CI por integrante

Cada integrante tiene su workflow, filtrado por `paths`: un cambio fuera de sus carpetas no lo dispara. Dentro de cada workflow, un job `changes` (`dorny/paths-filter`, comparando contra `develop`) decide qué jobs corren, así que tocar un servicio no compila los otros del mismo integrante. Si cambia el propio workflow, corren todos sus jobs. Los servicios Node/NestJS reutilizan `reusable-node-ci.yml`:

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

En `integrante1-ci.yml`, el job de Frontend corre `type-check`, `lint` (ESLint con `--max-warnings 0`: cualquier aviso falla el job), `test` (Vitest: filtros del historial, mapeo de estados de la Saga y manejo de errores del cliente HTTP) y `build`.

`integrante2-ci.yml` cubre Account y Payment con el mismo workflow reutilizable (NestJS). `integrante3-ci.yml` cubre Transaction Service, API Gateway y los manifiestos de `k8s/`. Los overlays `dev` y `prod` se renderizan con Kustomize, se validan con kubeconform y se rechaza cualquier imagen `:latest`.

**Optimización del pipeline:**
- Caché de dependencias: `actions/setup-node` (`cache: npm`, por `package-lock.json`) y `actions/setup-java` (`cache: maven`, por `pom.xml`).
- Caché de capas Docker `type=gha` con Buildx en todos los builds: el chequeo de imagen del CI (scope `ci-<servicio>`, que también lee la caché de `cd-dev`), `cd-dev.yml` y `release.yml`.
- Jobs en paralelo: cada servicio es un job independiente dentro de su workflow, y los tres workflows de integrante corren a la vez; `cd-dev.yml` y `release.yml` construyen con una matriz por servicio.
- Build selectivo: solo corren los jobs de los servicios que cambiaron (ver [Build selectivo](#build-selectivo-monorepo)).

## Manifiestos Kubernetes (Kustomize)

```
k8s/
├── config/                        # namespace, secretos compartidos, bank-db-config/bank-db-secret, NetworkPolicy
├── broker/                        # RabbitMQ
├── <servicio>/deployment.yaml     # manifiestos de cada servicio (los usa start-k8s.sh)
├── <servicio>/kustomization.yaml
├── base/                          # agrupa config, broker y todos los servicios
├── components/autoscaling/        # CPU requests/limits, rolling update, HPA 80 %
├── overlays/dev/                  # namespace dev + versión de imágenes
└── overlays/prod/                 # namespace prod, Cloud SQL, Gateway LoadBalancer, sin frontend
```

- **Local (`scripts/project/start-k8s.sh`)** aplica los `deployment.yaml` y `config/` directamente en el namespace `bank-usac`, con imágenes `:local`.
- **`overlays/dev`** reutiliza la base y la despliega en el namespace `dev` con el componente de autoscaling. El pipeline fija el tag de cada imagen con `kustomize edit set image`.
- **Configuración de DB:** host, puerto, nombre y usuario de cada base están en el ConfigMap `bank-db-config` y las contraseñas en el Secret `bank-db-secret`, con los nombres de variable de la sección 2.4 del plan (`TRANSACTION_DB_HOST`, …). En producción estos valores vendrán de los outputs de Terraform.
- **Probes HTTP:** los 7 Deployments tienen `readinessProbe` y `livenessProbe`. Los servicios Node usan `/health` y los Spring Boot (Customer, Notification & Audit) `/actuator/health` y `/actuator/health/liveness`; el frontend usa `/`. Los seis servicios de backend tienen además `startupProbe` (150 s en Node, 180 s en Spring Boot) para esperar a RabbitMQ y la DB. Si un servicio Node pierde la conexión con RabbitMQ, el proceso termina y Kubernetes lo reinicia.
- **Recursos:** todos los contenedores tienen requests y limits de CPU y memoria, ajustados al uso medido con `docker stats` después del smoke test:

  | Contenedor | Requests | Limits |
  | ---------- | -------- | ------ |
  | Account, Transaction, Payment, API Gateway (NestJS, ~45 MiB en uso) | `100m` / `96Mi` | `500m` / `256Mi` |
  | Customer, Notification & Audit (Spring Boot) | `100m` / `384Mi` | `500m` / `768Mi` |
  | RabbitMQ (~218 MiB en uso) | `100m` / `256Mi` | `500m` / `1Gi` |
  | Frontend / MailHog | `10m` / `48Mi` · `10m` / `32Mi` | `200m` / `128Mi` · `100m` / `64Mi` |

  Los servicios Spring Boot llevan `JAVA_TOOL_OPTIONS=-XX:MaxRAMPercentage=70`: la JVM limita el heap a ~537 MiB y deja margen para metaspace e hilos dentro de los 768 MiB. RabbitMQ tiene 1Gi de límite porque su alarma de memoria bloquea a los publicadores al 40 % del límite. Los valores de los cinco microservicios están en `components/autoscaling` (`resources-node.yaml`, `resources-spring.yaml`); los de Gateway, RabbitMQ, MailHog y frontend, en su `deployment.yaml`.
- **Autoscaling:** los cinco microservicios tienen `RollingUpdate` con `maxUnavailable: 0` / `maxSurge: 1` y un HPA (`minReplicas: 1`, `maxReplicas: 5`, 80 % de CPU). Los HPA de los servicios Spring Boot (Customer, Notification & Audit) tienen `scaleUp.stabilizationWindowSeconds: 120` para no escalar por el pico de CPU del arranque. El HPA necesita `metrics-server` en el cluster; ver la [prueba de carga](06-prueba-hpa.md).

Renderizar el ambiente dev localmente:

```bash
kubectl kustomize k8s/overlays/dev
```

## Estructura del monorepo

Todo el sistema vive en un solo repositorio. Cada microservicio tiene su código y su `Dockerfile` en `apps/<servicio>/`, sus manifiestos en `k8s/<servicio>/` y su job de CI en el workflow de su dueño:

| Servicio | Código + `Dockerfile` | Manifiestos | Pipeline (CI) |
| -------- | --------------------- | ----------- | ------------- |
| Customer | `apps/customer-service/` | `k8s/customer-service/` | `integrante1-ci.yml` → job `customer-service` |
| Notification & Audit | `apps/notification-audit-service/` | `k8s/notification-audit-service/` | `integrante1-ci.yml` → job `notification-audit-service` |
| Frontend | `apps/frontend/` | `k8s/frontend/` | `integrante1-ci.yml` → job `frontend` |
| Account | `apps/account-service/` | `k8s/account-service/` | `integrante2-ci.yml` → job `account-service` |
| Payment | `apps/payment-service/` | `k8s/payment-service/` | `integrante2-ci.yml` → job `payment-service` |
| Transaction | `apps/transaction-service/` | `k8s/transaction-service/` | `integrante3-ci.yml` → job `transaction-service` |
| API Gateway | `apps/api-gateway/` | `k8s/api-gateway/` | `integrante3-ci.yml` → job `api-gateway` |

Lo compartido va aparte: `k8s/{config,broker,base,components,overlays}` (configuración común, RabbitMQ y ambientes), `infrastructure/` (Docker Compose local, SQL de cada base y Terraform), `tests/` (E2E y carga) y `scripts/` (arranque local).

**Por qué los manifiestos van en `k8s/<servicio>/` y no dentro de `apps/<servicio>/`:** separa lo que se construye (código e imagen) de cómo se despliega. Toda la configuración de Kubernetes queda en un solo árbol: `k8s/base` agrupa los servicios, los overlays `dev`/`prod` los reutilizan sin copiarlos, `scripts/project/start-k8s.sh` los aplica en local y el job `k8s-manifests` de `integrante3-ci.yml` valida todo con un solo filtro (`k8s/**`). Cada servicio sigue teniendo su propio directorio de manifiestos.

**Por qué un workflow por integrante y no uno por servicio:** cada integrante es dueño de sus servicios y de su pipeline, pero dentro de cada workflow los jobs son por servicio y solo corren si cambió su carpeta (ver abajo). El resultado es el mismo que un pipeline por servicio, con menos archivos que mantener. `cd-dev.yml` también decide por servicio.

## Build selectivo (monorepo)

Todos los servicios viven en un solo repositorio, pero solo se construye lo que cambió:

| Etapa | Cómo decide |
| ----- | ----------- |
| CI (`integrante1/2/3-ci.yml`) | `paths` del workflow + job `changes`; cada job de servicio tiene `if:` con su salida. Los jobs omitidos cuentan como exitosos para los checks obligatorios |
| CD dev (`cd-dev.yml`) | El job `plan` compara el push con el commit anterior (`github.event.before`) por carpeta `apps/<servicio>/**` |

En `cd-dev.yml`:

1. `plan` arma dos listas: servicios a **construir** (cambió su carpeta, o no existe su imagen `sha-<commit anterior>`) y servicios a **reutilizar**. Con `workflow_dispatch` o en el primer push se construye todo. El resumen del run muestra ambas listas.
2. `images` construye solo la primera lista (matriz dinámica).
3. `reuse-images` copia la imagen anterior al tag nuevo con `docker buildx imagetools create`: no recompila y conserva el mismo digest.
4. `deploy-dev` corre si ninguno de los anteriores falló. Cada commit sigue teniendo las 7 imágenes con el mismo tag, así que el smoke test en kind despliega el sistema completo; los servicios reutilizados solo se descargan.

`release.yml` construye siempre los 7 servicios: una versión `vX.Y.Z` etiqueta el sistema completo.

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

## Producción

`overlays/prod` reutiliza la base con el componente de autoscaling en el namespace `prod`:

- Imágenes `ghcr.io/<owner>/bank-usac/<servicio>:vX.Y.Z`; `cd-prod.yml` fija la versión con `kustomize edit set image`.
- Bases de datos en Cloud SQL por IP privada, puerto 5432 y los nombres de `infrastructure/terraform/cloudsql.tf`. Los hosts salen de `terraform output -json db_private_ips` y el Secret `bank-db-secret` lo crea el workflow; en git no hay credenciales.
- El Gateway se publica con un Service `LoadBalancer`. El frontend no corre en el cluster: va en Cloud Run/VM y su URL del Gateway es la variable `PROD_API_BASE_URL` de `release.yml`.

`cd-prod.yml` (merge a `main`): toma el último tag `vX.Y.Z` alcanzable desde `main`, verifica que las 6 imágenes existan en GHCR, se autentica en GCP, crea el namespace, el Secret de DB y el acceso a GHCR (`ghcr-pull`), aplica el overlay y espera cada rollout. Si algo falla, imprime pods y logs.

Configuración del repositorio (Settings → Secrets and variables → Actions):

| Tipo | Nombre | Valor |
| ---- | ------ | ----- |
| Secret | `GCP_SA_KEY` | JSON de una service account con rol Kubernetes Engine Developer |
| Secret | `PROD_DB_PASSWORD` | `db_password` de Terraform |
| Secret | `GHCR_PULL_TOKEN` | Token con `read:packages` para que GKE descargue las imágenes |
| Variable | `GKE_CLUSTER` / `GKE_LOCATION` | Nombre y zona del cluster |
| Variable | `PROD_DB_PRIVATE_IPS` | Salida de `terraform output -json db_private_ips` |

## Rollback

- **dev:** el cluster es efímero, así que no hay nada que revertir en él. Se revierte el commit en `develop` (`git revert <commit>`, por PR) y el merge vuelve a desplegar.
- **Release fallida:** si falla antes de **promote** no se publicó ninguna versión final; las imágenes `-rc.<n>` solo son candidatas y no se despliegan en producción.
- **Producción:** se vuelve a la versión anterior, que sigue publicada porque las imágenes `vX.Y.Z` nunca se sobrescriben.
  - Inmediato: `kubectl -n prod rollout undo deployment/<servicio>` regresa al ReplicaSet anterior con rolling update.
  - Definitivo: volver a desplegar la versión anterior (`kustomize edit set image bank-usac/<servicio>=ghcr.io/<owner>/bank-usac/<servicio>:v<anterior>`), y corregir con una `release/X.Y.(Z+1)`.

## Pendiente (depende de la infraestructura de producción)

- `terraform apply` de `infrastructure/terraform` (red, Cloud SQL y GKE; ver [Terraform](05-terraform-cloud-sql.md)) y la configuración de la tabla anterior. Hasta entonces `cd-prod.yml` se omite.
- Despliegue del frontend en Cloud Run/VM.

## Configuración del repositorio (una vez, requiere admin)

- **Branch protection** en `main` y `develop`: exigir pull request y los checks de CI en verde. Un workflow que no se dispara por su filtro `paths` deja su check pendiente para siempre, así que antes de exigir checks hay que quitar el `paths` a nivel de workflow en `integrante1/2/3-ci.yml` (el job `changes` ya filtra por servicio) y exigir los checks `Detect changes` más los de cada servicio (un job omitido por `if:` cuenta como exitoso).
- **Settings → Actions → General → Workflow permissions:** "Read and write permissions", para que los workflows publiquen en GHCR y creen tags.
