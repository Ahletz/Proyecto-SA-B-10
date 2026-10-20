# Runbook: ServiceUnavailable

**Alerta:** un deployment del namespace `prod` sin réplicas disponibles durante 2 min.

## Diagnóstico
```
kubectl -n prod get pods
kubectl -n prod describe pod -l app=<servicio>
kubectl -n prod logs deploy/<servicio> --previous --tail=100
```
Causas habituales: `CrashLoopBackOff` por RabbitMQ/DB no disponibles (el servicio sale a propósito si pierde RabbitMQ y reinicia), `ImagePullBackOff`, `OOMKilled`, Secret faltante (`bank-db-secret`, `bank-shared-secret`), nodo sin recursos.

## Mitigación
1. Restaurar la dependencia (RabbitMQ, Cloud SQL) o el Secret faltante.
2. Revertir el último despliegue si introdujo el fallo.
3. `kubectl -n prod rollout restart deploy/<servicio>`.

## Verificación
`kube_deployment_status_replicas_available` ≥ 1 y `/health` responde 200.

## Escalamiento
Más de 10 min de indisponibilidad: avisar al equipo; cuenta contra el SLO y requiere postmortem.
