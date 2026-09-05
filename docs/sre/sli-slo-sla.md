# SLI, SLO y SLA

## SLI
- disponibilidad del Gateway: porcentaje de probes `/health` exitosos;
- tasa de éxito de comandos aceptados por RabbitMQ;
- latencia de aceptación de transferencia en Gateway;
- tiempo end-to-end desde `transaction.transfer.requested` hasta estado terminal;
- porcentaje de eventos procesados sin DLQ;
- duplicados descartados por `eventId`;
- cobertura de trazabilidad: eventos con `correlationId` válido.

## SLO
| Indicador | Objetivo |
|---|---|
| Gateway disponible | >= 99.5% durante ventana de demostración/operación |
| aceptación HTTP p95 | < 500 ms |
| transferencia end-to-end p95 local | < 5 s en happy path |
| eventos con correlationId | 100% |
| evento duplicado que genera doble efecto | 0% |
| mensajes perdidos tras error manejable | 0%; deben terminar en retry o DLQ |

## SLA académico propuesto
Durante una sesión de evaluación de 2 horas: disponibilidad >= 99%, sin pérdida de transferencias aceptadas y recuperación/reinicio de un pod <= 2 minutos. La SLA es una propuesta contractual para el contexto académico; los SLO son objetivos internos más estrictos.
