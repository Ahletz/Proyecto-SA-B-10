# CI/CD — Fase 2

Pipeline en GitHub Actions que sigue la convención de ramas y tags del enunciado. Las imágenes se publican en **GitHub Container Registry (GHCR)** como `ghcr.io/<owner>/bank-usac/<servicio>:<tag>` y **nunca** se usa el tag `latest`.

## Flujo por rama

| Evento | Workflow | Qué hace |
| ------ | -------- | -------- |
| Push a `feature/**` | `integrante1-ci.yml`, `integrante3-ci.yml` | Build + test (+ lint) de los servicios que cambiaron, prueba de `docker build` y validación de manifiestos |
| Pull request `feature/*` → `develop` | Los mismos | Repite build + test; si pasa, se puede hacer merge |
| Merge a `develop` | `cd-dev.yml` | Construye y publica las 7 imágenes con tag `sha-<commit>`, las despliega en el namespace `dev` y corre el smoke test end-to-end |
| Push a `release/X.Y.Z` | `release.yml` | Publica las imágenes finales `vX.Y.Z` y crea el tag git `vX.Y.Z` |
| Merge a `main` | *pendiente* | CD a producción con rolling update usando las imágenes `vX.Y.Z` (depende del Terraform/cluster de producción) |

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

`integrante3-ci.yml` cubre Transaction Service, API Gateway y los manifiestos de `k8s/`. Los manifiestos se renderizan con Kustomize, se validan con kubeconform y se rechaza cualquier imagen `:latest`.

## Manifiestos Kubernetes (Kustomize)

```
k8s/
├── <servicio>/deployment.yaml     # manifiestos originales (los usa start-k8s.sh)
├── <servicio>/kustomization.yaml
├── base/                          # agrupa todos los servicios
├── components/autoscaling/        # CPU requests/limits, rolling update, HPA 80 %
└── overlays/dev/                  # namespace dev + versión de imágenes
```

- **Local (`scripts/project/start-k8s.sh`)** sigue aplicando los `deployment.yaml` directamente en el namespace `bank-usac`, sin cambios.
- **`overlays/dev`** reutiliza la base y la despliega en el namespace `dev` con el componente de autoscaling. El pipeline fija el tag de cada imagen con `kustomize edit set image`.
- **Autoscaling:** los cinco microservicios tienen `requests.cpu: 100m`, `limits.cpu: 500m`, `RollingUpdate` con `maxUnavailable: 0` / `maxSurge: 1` y un HPA (`minReplicas: 1`, `maxReplicas: 5`, 80 % de CPU). El HPA necesita `metrics-server` en el cluster.

Renderizar el ambiente dev localmente:

```bash
kubectl kustomize k8s/overlays/dev
```

## Ambiente dev

Mientras no exista un cluster persistente, `cd-dev.yml` crea un cluster **kind efímero** en el runner. Las cinco PostgreSQL se levantan con Docker Compose **fuera del cluster**, igual que en local. Luego el workflow carga las imágenes publicadas, aplica `overlays/dev`, espera los rollouts, ejecuta `tests/e2e/smoke.sh` contra el Gateway (`:30080`) y muestra el estado de los HPA. Si algo falla, el job imprime pods y logs.

## Releases

1. Crear la rama `release/X.Y.Z` desde `develop` (por ejemplo `release/2.0.0`).
2. El workflow valida el formato, publica las 7 imágenes `:vX.Y.Z` y crea el tag `vX.Y.Z`.
3. Un tag publicado no se reescribe. Si hace falta un fix después, se abre `release/X.Y.(Z+1)`.

La URL pública del Gateway que se compila en el frontend se toma de la variable del repositorio `PROD_API_BASE_URL` (Settings → Secrets and variables → Actions → Variables).

## Pendiente (depende de la infraestructura de producción)

- Workflow `cd-prod.yml` (merge a `main` → rolling update con `vX.Y.Z`) y `overlays/prod`, con las variables de base de datos provistas por Terraform.
- Credenciales del cluster como secret del repositorio.
- Despliegue del frontend en Cloud Run/VM.

## Configuración del repositorio (una vez, requiere admin)

- **Branch protection** en `main` y `develop`: exigir pull request y los checks de CI en verde.
- **Settings → Actions → General → Workflow permissions:** "Read and write permissions", para que los workflows publiquen en GHCR y creen tags.
