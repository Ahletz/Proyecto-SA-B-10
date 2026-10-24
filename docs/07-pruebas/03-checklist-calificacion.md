# Checklist de calificación

Casillas para el día de la calificación. La evidencia de cada punto está en la [matriz requisito-evidencia](../09-calificacion/01-matriz-requisito-evidencia.md).

## Requisitos para optar (8.1; un "No" deja la nota en 0)
- [ ] sistema desplegado y accesible en la nube (GKE `prod` y Cloud Run);
- [ ] OpenTelemetry en el código de los 5 servicios y el Gateway (trazas y métricas);
- [ ] `traceId` y `correlationId` propagados entre servicios y a través del broker;
- [ ] logging centralizado en Loki con ingestión de logs;
- [ ] logs JSON con timestamp, servicio, nivel, `correlationId` y `traceId`, sin datos sensibles;
- [ ] dashboards de métricas y logs en Grafana;
- [ ] métricas SRE: latencia en percentiles, error rate, throughput, consumer lag y disponibilidad;
- [ ] trazas y métricas integradas a la Saga de transferencia;
- [ ] funcionalidades de observabilidad en los 5 servicios;
- [ ] fallos controlados (timeouts, errores y retrasos);
- [ ] asincronía y desacoplamiento intactos (sin HTTP entre los 5 microservicios);
- [ ] documentación, diagramas y métricas actualizados;
- [ ] flujo end-to-end observable con trazas y logs;
- [ ] Collector, Prometheus, Tempo, Loki y Grafana desplegados por pipeline, sin pasos manuales;
- [ ] SLO medidos y al menos 4 alertas configuradas (hay 7);
- [ ] al menos 3 postmortems de escenarios de fallo;
- [ ] depósitos con el banco pareja: idempotencia, compensación, protocolo de timeout y conciliación;
- [ ] entrega en UEDI en la fecha;
- [ ] commit antes de la fecha de entrega y auxiliar agregado como colaborador.

## Arquitectura (Fases 1 y 2)
- [ ] exactamente 5 microservicios y un API Gateway operativo;
- [ ] RabbitMQ real y comunicación inter-servicio asíncrona;
- [ ] 5 bases independientes y externas al cluster (Cloud SQL en prod);
- [ ] Kubernetes con HPA, probes y NetworkPolicy;
- [ ] monorepo y documentación Markdown.

## Diseño y documentación
- [ ] modelo de dominio y bounded contexts;
- [ ] contratos de eventos, `correlationId` y `traceparent`;
- [ ] C4 nivel 1, 2 y 3 (con el stack de observabilidad y el banco pareja);
- [ ] diagrama de despliegue de Fase 3;
- [ ] secuencias de transferencia, creación de cuenta y depósito interbancario;
- [ ] casos de uso;
- [ ] SLI, SLO y SLA coherentes con las reglas, el dashboard y los runbooks;
- [ ] catálogo de métricas y runbooks por alerta;
- [ ] ADR con trade-offs (costo, retención, cardinalidad);
- [ ] diagramas coinciden con el código final.

## Implementación
- [ ] Customer: identidad, activación por correo, JWT y KYC;
- [ ] Account: `MONETARY`/`SAVINGS`, saldo, reserva, desactivación, anomalías y operaciones interbancarias;
- [ ] Transaction: estados de la Saga interna e `interbankState`;
- [ ] Payment separado y event-driven, único conector con el banco pareja;
- [ ] Notification/Audit desacoplado, con auditoría filtrable y outbox;
- [ ] Gateway sin lógica bancaria, con `X-Api-Key` por banco para `/interbank/v1`;
- [ ] idempotencia, retry y DLQ;
- [ ] frontend con roles y página *Otro banco*;
- [ ] Dockerfiles, Kustomize y workflows de CI/CD.

## Evidencia funcional
- [ ] happy path -> `COMPLETED` y una sola traza en Tempo;
- [ ] fondos insuficientes -> `FAILED`;
- [ ] rechazo posterior a reserva -> `COMPENSATED` y saldo restaurado;
- [ ] depósito saliente aceptado y consulta de su estado;
- [ ] depósito entrante idempotente (reenvío sin doble crédito);
- [ ] timeout interbancario: `TIMEOUT` -> consulta -> cancelación -> `REVERSED`;
- [ ] mismo `traceId` en ambos bancos;
- [ ] alerta disparada durante una prueba (`SloBurnRateFast`) con su runbook;
- [ ] HPA y compensaciones visibles en los dashboards;
- [ ] ADMIN puede auditoría; CASHIER puede pagos y no auditoría;
- [ ] correo de activación visible en MailHog;
- [ ] RabbitMQ muestra exchanges, colas y bindings.
