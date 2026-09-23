# 18. Checklist de calificación

## Requisitos mínimos
- [ ] exactamente 5 microservicios;
- [ ] API Gateway operativo;
- [ ] RabbitMQ real y comunicación inter-servicio asíncrona;
- [ ] Kubernetes local funcional;
- [ ] 5 bases independientes y externas al cluster;
- [ ] monorepo y documentación Markdown;
- [ ] entrega institucional en fecha.

## Diseño y documentación
- [ ] modelo de dominio y bounded contexts;
- [ ] contratos de eventos y correlationId;
- [ ] C4 Nivel 1;
- [ ] C4 Nivel 2;
- [ ] C4 Nivel 3 de servicios principales/finales;
- [ ] UML Deployment;
- [ ] secuencia de transferencia;
- [ ] secuencia de creación de cuenta;
- [ ] UML casos de uso;
- [ ] SLI/SLO/SLA;
- [ ] ADR y trade-offs;
- [ ] diagramas coinciden con código final.

## Implementación
- [ ] Customer: identidad, activación email y JWT;
- [ ] Account: MONETARY/SAVINGS, saldo/reserva y desactivación;
- [ ] Transaction: registro y estados de Saga;
- [ ] Payment separado y event-driven;
- [ ] Notification/Audit desacoplado;
- [ ] Gateway sin lógica bancaria;
- [ ] idempotencia;
- [ ] retry + DLQ;
- [ ] `correlationId` end-to-end;
- [ ] frontend con roles;
- [ ] Dockerfiles y manifiestos Kubernetes.

## Evidencia funcional
- [ ] happy path -> `COMPLETED`;
- [ ] fondos insuficientes -> `FAILED`;
- [ ] rechazo posterior a reserva -> `COMPENSATED`;
- [ ] saldo restaurado;
- [ ] ADMIN puede auditoría;
- [ ] CASHIER puede pagos y no auditoría;
- [ ] correo de activación visible en MailHog;
- [ ] RabbitMQ muestra exchanges/queues/bindings.
