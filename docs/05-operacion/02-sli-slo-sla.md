# 14. SLI, SLO y SLA

Estos valores son objetivos académicos propuestos para evaluar el comportamiento del sistema local; no representan un contrato de producción.

## SLI
1. disponibilidad del Gateway (`/health`);
2. readiness agregado (`/health/ready`);
3. latencia HTTP de aceptación de transferencia;
4. tiempo end-to-end hasta estado terminal;
5. porcentaje de eventos procesados sin DLQ;
6. duplicados que producen efecto repetido;
7. porcentaje de eventos de Saga con `correlationId` válido.

## SLO
| Indicador | Objetivo |
|---|---:|
| Gateway disponible durante evaluación | >= 99.5% |
| aceptación HTTP p95 | < 500 ms |
| transferencia happy path p95 local | < 5 s |
| eventos de Saga con correlationId | 100% |
| doble efecto por evento duplicado | 0% |
| mensaje manejable perdido | 0% |
| recuperación de un pod reiniciado | < 2 min |

## SLA académico
Durante una ventana de demostración de 2 horas:
- disponibilidad del punto de entrada >= 99%;
- ninguna transferencia aceptada debe perderse silenciosamente;
- fallos manejables deben terminar en retry, DLQ o estado terminal de Saga;
- la trazabilidad debe permitir reconstruir una transferencia por `correlationId`.

## Medición
- `curl` y healthchecks;
- timestamps de auditoría;
- RabbitMQ Management;
- logs de pods;
- smoke tests E2E.
