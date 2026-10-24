# Manifiestos de Kubernetes

Kustomize sin Helm. Los mismos YAML sirven para kind local, `dev` y `prod`.

| Ruta | Contenido |
|---|---|
| `config/` | Namespace, ConfigMaps y Secrets de ejemplo, versión de la aplicación (`bank-app-info`) y NetworkPolicy |
| `broker/` | RabbitMQ (con el puerto de métricas `15692`) y MailHog |
| `<servicio>/` | Deployment y Service de cada servicio: `customer-service`, `account-service`, `transaction-service`, `payment-service`, `notification-audit-service`, `api-gateway`, `frontend` e `interbank-mock` |
| `base/` | Agrupa `config`, `broker` y todos los servicios |
| `components/autoscaling/` | Requests y limits, rolling update sin cortes y HPA al 80 % de CPU |
| `overlays/dev/` | Namespace `dev` e imágenes `sha-<commit>` |
| `overlays/prod/` | Namespace `prod`, Cloud SQL, Gateway `LoadBalancer`, Ingress HTTPS para el banco pareja y simulación de fallos de Payment en 0 |

El stack de observabilidad está en [`observability/`](../observability/). Los Secrets reales (claves interbancarias, contraseñas) se crean fuera del repositorio. Detalle en [CI/CD](../docs/04-despliegue/04-ci-cd.md#manifiestos-kubernetes-kustomize) y [Despliegue](../docs/04-despliegue/07-despliegue-fase3.md).

```bash
kubectl kustomize k8s/overlays/dev    # renderiza un ambiente
```
