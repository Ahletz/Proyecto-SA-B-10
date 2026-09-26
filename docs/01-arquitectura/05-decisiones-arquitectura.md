# 5. Decisiones arquitectónicas y trade-offs

## ADR-001 - Cinco bounded contexts independientes
**Decisión:** Customer, Account, Transaction, Payment y Notification/Audit son microservicios separados.

**Justificación:** separa responsabilidades y cumple la restricción del proyecto.

**Consecuencia:** la coordinación distribuida requiere eventos y consistencia eventual.

## ADR-002 - RabbitMQ con topic exchanges
**Decisión:** usar `bank.events`, `bank.events.retry` y `bank.events.dlx`.

**Ventajas:** fan-out, routing por `eventType`, desacoplamiento y soporte de retry/DLQ.

**Coste:** mayor complejidad operativa y necesidad de idempotencia.

## ADR-003 - Saga por coreografía
**Decisión:** no existe un orquestador central. Cada servicio reacciona a hechos del dominio.

**Ventajas:** baja dependencia entre servicios y asincronía real.

**Coste:** el flujo es menos visible; se mitiga con `correlationId`, auditoría y diagramas de secuencia.

## ADR-004 - Base de datos por servicio
**Decisión:** cinco bases PostgreSQL, sin BD compartida.

**Consecuencia:** no existe transacción ACID global. La compensación reemplaza el rollback distribuido.

## ADR-005 - Gateway como borde, no como dominio
El Gateway valida token/roles, aplica ownership y publica el comando inicial. No decide fondos, pagos ni estados de la Saga.

## ADR-006 - Account y Payment en NestJS en la implementación final
La documentación final refleja el código integrado: Account y Payment son servicios NestJS con TypeORM y `amqplib`. La capa de seguridad bancaria se concentra en Gateway/Customer, por lo que estos servicios internos no implementan JWT propio.

## ADR-007 - PostgreSQL externo a kind
Las bases se ejecutan fuera del cluster para cumplir el enunciado. Los pods alcanzan el Docker host mediante una IP detectada dinámicamente.

## ADR-008 - MailHog para demostración
El correo se envía por SMTP real hacia MailHog en desarrollo. Esto permite demostrar activación sin depender de credenciales de un proveedor externo.

## Decisiones de Fase 2 (nube, CI/CD e infraestructura)

## ADR-009 - Google Cloud Platform como proveedor
**Decisión:** desplegar producción en GCP (región `us-central1`).

**Ventajas:** GKE es el Kubernetes administrado más cercano a Kubernetes estándar (los mismos manifiestos de kind sirven con un overlay). Un cluster **zonal** no paga la gestión del plano de control (capa gratuita), y los créditos de prueba cubren Cloud SQL y los nodos durante el semestre. Terraform tiene un provider oficial y maduro (`hashicorp/google`).

**Coste / alternativas:** AWS (EKS) cobra el plano de control por hora y exige más piezas de red (subredes públicas/privadas, NAT, IAM para nodos). Azure (AKS) tiene plano de control gratuito, pero el equipo no tenía experiencia con él. Quedarse en GCP ata la infraestructura a recursos `google_*`; los manifiestos de Kubernetes sí son portables.

## ADR-010 - GitHub Actions como CI/CD y GHCR como registry
**Decisión:** pipelines en GitHub Actions (`.github/workflows/`) e imágenes en GitHub Container Registry (`ghcr.io/<owner>/bank-usac/<servicio>`).

**Ventajas:** el código ya está en GitHub, así que no hay otro servicio que operar ni credenciales que compartir: los workflows publican en GHCR con el `GITHUB_TOKEN`. Los runners traen Docker y permiten levantar un cluster kind efímero para el smoke test. Workflows reutilizables (`reusable-node-ci.yml`, `reusable-kind-smoke.yml`) evitan repetir pasos entre servicios. La caché de capas `type=gha` no necesita almacenamiento propio.

**Coste / alternativas:** GitLab CI o Jenkins exigían migrar el repositorio o mantener un servidor. Artifact Registry de GCP sería más cercano a GKE, pero obligaría a dar credenciales de GCP a todos los workflows de CI; con GHCR, GKE descarga las imágenes con un token de solo lectura (`GHCR_PULL_TOKEN`). Los minutos de Actions son limitados: se mitiga con el build selectivo (ADR-013).

## ADR-011 - GKE Standard zonal en la misma VPC que las bases de datos
**Decisión:** cluster `bank-usac-gke` Standard zonal (`us-central1-a`), VPC-native en `bank-usac-vpc`, node pool `e2-medium` con autoscaler de 1 a 3 nodos (`infrastructure/terraform/gke.tf`).

**Ventajas:** el peering de Cloud SQL **no es transitivo**: un cluster en otra VPC no llegaría a las IP privadas de las bases. En la misma VPC, los pods (rango `gke-pods`) alcanzan Cloud SQL sin exponerlo a Internet. El autoscaler de nodos complementa al HPA (80 % CPU, hasta 5 réplicas por servicio).

**Coste / alternativas:** un cluster zonal no es tolerante a la caída de la zona; uno regional triplica los nodos y el costo. Autopilot cobra por pod y restringe algunos ajustes (tipos de nodo, `metrics-server` propio). Para un proyecto académico con demo en una sola zona, zonal es suficiente.

## ADR-012 - Bases de datos en Cloud SQL, fuera del cluster
**Decisión:** cinco instancias Cloud SQL PostgreSQL 17 (`db-f1-micro`), una por microservicio, con IP privada en `bank-usac-vpc` (`infrastructure/terraform/cloudsql.tf`). En desarrollo, las mismas cinco bases corren en Docker Compose, también fuera del cluster (ADR-007).

**Ventajas:** cada instancia es una máquina virtual administrada por Google (tier `db-f1-micro`) dedicada a un servicio: se cumple "una base de datos por microservicio" (ADR-004) y "bases fuera del cluster" sin compartir motor ni disco. Google se encarga de parches, reinicios y almacenamiento; Terraform crea instancias, bases y usuarios de forma reproducible.

**Coste / alternativas:** la alternativa era levantar PostgreSQL en VMs de Compute Engine (una por servicio, o una VM con cinco bases). Da más control (versión, configuración, acceso SSH) pero obliga a mantener scripts de instalación, parches y respaldos a mano. Cinco instancias Cloud SQL cuestan más que una sola VM; se acepta por el aislamiento entre servicios. Los respaldos están desactivados (`backup_configuration.enabled = false`) porque los datos son de demostración.

## ADR-013 - Monorepo con build y despliegue selectivo
**Decisión:** un solo repositorio con `apps/<servicio>/` (código + `Dockerfile`), `k8s/<servicio>/` (manifiestos) y un workflow de CI por integrante; `cd-dev.yml` construye solo los servicios que cambiaron. Ver [Estructura del monorepo](../04-despliegue/04-ci-cd.md#estructura-del-monorepo).

**Ventajas:** un cambio de contrato de eventos y los servicios que lo usan se revisan en un mismo PR. El build selectivo mantiene el pipeline rápido: cada commit de `develop` tiene las 7 imágenes con el mismo tag, pero solo se recompilan las que cambiaron.

**Coste / alternativas:** un repositorio por servicio aísla permisos y pipelines, pero exige versionar y sincronizar los contratos entre repos. En el monorepo hay que filtrar por rutas (`paths`, `dorny/paths-filter`) para no construir todo en cada push.

## ADR-014 - Kustomize con overlays por ambiente
**Decisión:** `k8s/base` + `components/autoscaling` + `overlays/{dev,prod}`, sin Helm.

**Ventajas:** los mismos YAML que usa el despliegue local con kind se reutilizan en `dev` y `prod`; cada overlay solo cambia namespace, imágenes, configuración de DB y tipo de Service. `kubectl` trae Kustomize, así que no hay otra herramienta que instalar en los runners.

**Coste / alternativas:** Helm permite plantillas y rollback por release (`helm rollback`), pero agrega una capa de plantillas para solo dos ambientes. El rollback se hace con `kubectl rollout undo` o redesplegando la versión anterior (ver [CI/CD](../04-despliegue/04-ci-cd.md#rollback)).

## ADR-015 - Frontend de producción en Cloud Run con proxy nginx
**Decisión:** el frontend de producción corre fuera del cluster, en Cloud Run (`bank-usac-frontend`). La imagen usa nginx: sirve la SPA y reenvía `/api` al LoadBalancer del Gateway (`API_UPSTREAM`). `cd-prod.yml` copia `frontend:vX.Y.Z` de GHCR a Artifact Registry y hace `gcloud run deploy`; Terraform (`frontend.tf`) crea el registro, la identidad del servicio y los permisos.

**Ventajas:** Cloud Run es un servicio de despliegue rápido: HTTPS y dominio propios, escala a cero y cada despliegue crea una revisión nueva que recibe el tráfico cuando está lista (sin downtime y con rollback por revisión). El proxy deja la API en el mismo origen, así el navegador no bloquea llamadas HTTP desde una página HTTPS (contenido mixto) y no depende de CORS. La imagen no lleva compilada la IP del Gateway: el pipeline la lee del LoadBalancer en cada despliegue, así que la misma imagen probada en la release llega a producción.

**Coste / alternativas:** una VM de Compute Engine con el contenedor evita Artifact Registry, pero hay que mantener el sistema operativo, abrir SSH al pipeline y resolver HTTPS a mano. Cloud Run no descarga de GHCR, por eso la imagen se copia a Artifact Registry (mismo tag, sin recompilar). El tramo de Cloud Run al Gateway es HTTP por la IP pública del LoadBalancer; para un entorno real se usaría un Ingress con certificado.
