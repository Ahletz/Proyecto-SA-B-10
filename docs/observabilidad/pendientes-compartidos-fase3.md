# Pendientes compartidos para cerrar Fase 3

Corte: 23 de octubre de 2026. Revisión de los tres enunciados, el plan de reparto, OpenAPI y el código integrado en develop. Los documentos son requisitos que contrastar; no acreditan ejecución. Este listado no modifica los dominios de Ale ni Nufio.

## Prioridad antes de la entrega

| Pendiente y responsables sugeridos | Evidencia / diferencia con el enunciado | Cierre comprobable |
|---|---|---|
| HTTP interno Payment → Account — Ale, coordinación Nufio | `apps/payment-service/src/interbank/interbank.service.ts`, `cancelAtAccount()`, usa fetch interno. Fase 3 p. 11 conserva broker obligatorio dentro del banco. La excepción HTTP es el banco externo. La NetworkPolicy de Account tampoco habilita este origen. | Sustituir la coordinación por broker manteniendo decisión atómica, idempotencia y respuestas del OpenAPI; probar timeout/cancelación y carrera con aceptación. |
| Concurrencia interbancaria — Ale | `apps/account-service/src/account/interbank.service.ts`, `debit()`/`release()`, bloquean la operación pero leen la cuenta sin bloqueo. Es un riesgo observado en código, no pérdida de saldos demostrada en producción. | Prueba PostgreSQL con operaciones distintas sobre una misma cuenta; bloqueo o actualización atómica y aserciones de saldo/reserva. |
| Banco pareja y escenario externo obligatorio — Ale/Nufio + equipo | `docs/interbank/acuerdo-integracion.md` conserva pendientes BANK08/BANK13. Existen mock BANK99 y rutas; faltan evidencia conjunta y postmortem del escenario externo de Fase 3 p. 10. | Usar mock propio para fallos, sin degradar el banco ajeno. Capturar carga, alerta, recuperación, saldos y trazas en ambos bancos para pruebas conjuntas. |
| SLO y error budget coherentes — equipo | `docs/sre/slo.md`: 99 %/98 %/2 s; `docs/05-operacion/02-sli-slo-sla.md`: 99.5 %/500 ms; reglas: 99.9 %/5 s. Las recording rules agrupan por servicio y mezclan ambientes. | Acordar cada SLI, ventana, errores incluidos y objetivo. Separar dev/prod, alinear reglas, dashboard, catálogo y postmortems. No cambiar objetivos para ocultar fallos. |

## Validación y evidencia que faltan

| Pendiente y responsables sugeridos | Estado actual y comprobación necesaria |
|---|---|
| Promoción y validación cloud — equipo; Alex valida sus servicios | El código de Alex se integra a develop con CI; la promoción productiva requiere release/main. El pipeline de observabilidad puede aplicar configuración antes de que prod tenga el receptor nuevo. Comprobar versiones desplegadas, Secret compartido, entrega Alertmanager→Notification, stdout→Loki, OTLP→Tempo/Prometheus, filtros y enlace de traza. Esta máquina no tiene contexto kubectl para certificarlo. |
| HPA, backlog y tres escenarios completos — equipo | El postmortem local de Alex incluye medidas/capturas reales y drenaje 88/88. No reemplaza pruebas de HPA, saldos/Saga, backlog productivo ni el escenario externo. Los postmortems anteriores aún deben contrastarse con sus capturas/series; contar tres archivos no demuestra tres escenarios completos. |
| Workers diferidos — Ale/Nufio | Payment no persiste el contexto W3C original para todas las operaciones de sus workers. El mismo correlationId no demuestra continuidad de traceId. Capturar reintento/callback/reverso diferido y persistir/restaurar contexto o links si la prueba revela ruptura. |
| Métricas de Account y anomalías con HPA — Ale | Revisar contador de movimientos con tipo de cuenta y débito/crédito exigido por el PDF, sin accountId como label. La ventana de anomalías es por proceso: validar su comportamiento con varias réplicas o usar estado compartido. |

## Diferencias de infraestructura y documentación

- **Stack de observabilidad:** el despliegue usa Kustomize automatizado. El enunciado menciona Terraform/Helm. ADR-014 explica la decisión, pero no prueba aceptación del auxiliar: obtenerla o alinear implementación. Responsable sugerido: Ale/equipo.
- **Bases Fase 2:** Terraform usa Cloud SQL externo al clúster; el PDF exige VM. ADR-012 es una justificación interna, no una aprobación externa: comprobar aceptación antes de proponer una migración. Responsable sugerido: Ale/equipo.
- **Plan de reparto desactualizado:** propuestas de buscar correo por HTTP o inyectar fallos al banco pareja contradicen las restricciones. La implementación de Alex obtiene contactos mediante eventos y prueba solo su broker aislado. El cronograma detallado marca 23/24 de octubre mientras SMART menciona 30: confirmar la fecha vigente en UEDI.
- **CI con numeración histórica:** Customer/Notification/Frontend están en `integrante1-ci.yml`; Account/Payment en `integrante2-ci.yml`. Guiarse por rutas/jobs; el nombre no coincide con el reparto actual.

## Brechas de Alex que ya se atendieron

OTel y contexto AMQP en Java, logs JSON saneados, métricas/población KYC, correlación durable, inbox/outbox, anomalía WARNING con entrega, auditoría paginada/filtrable sin secretos, traceId en frontend, Alertmanager autenticado, dashboard/C4/runbook y postmortem local con evidencia. Ver [implementación y límites](alex-fase3.md) y [postmortem](../postmortems/2026-10-23-alex-broker-local.md). SMTP mantiene entrega al menos una vez; no se promete exactamente una vez. La evidencia cloud y la integración del banco completo siguen abiertas.
