# Runbook: OtelCollectorDown

**Alerta:** `up{job="otel-collector"} == 0` durante 2 minutos.

**Impacto:** las aplicaciones siguen funcionando, pero se pierden trazas, métricas de aplicación y logs OTLP mientras el Collector está caído.

## Diagnóstico

```
kubectl -n observability get pods -l app=otel-collector
kubectl -n observability describe pod -l app=otel-collector
kubectl -n observability logs deploy/otel-collector --tail=100
```

Causas habituales:
- `OOMKilled`: el Collector superó su límite de memoria (revisar `memory_limiter` en `observability/k8s/otel-collector.yaml`).
- Error de configuración tras un cambio reciente en `config.yaml` (el log lo indica al arrancar).
- Nodo sin recursos: el pod queda en `Pending` (revisar `kubectl describe` y el autoscaler del node pool).

## Mitigación

1. Si fue un cambio reciente de configuración, revertir el commit y dejar que el pipeline `deploy-observability` vuelva a aplicar.
2. Si fue memoria, subir el límite en el Deployment y volver a desplegar por el pipeline.
3. Reinicio rápido mientras tanto: `kubectl -n observability rollout restart deploy/otel-collector`.

## Verificación

`up{job="otel-collector"}` vuelve a 1 en Prometheus y aparecen trazas nuevas en Tempo.

## Escalamiento

Si el Collector no levanta en 15 minutos, avisar al equipo y registrar el incidente para el postmortem.
