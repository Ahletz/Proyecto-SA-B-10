# Checklist de calificación y evidencia

Use este archivo durante la revisión final y marque cada elemento solo después de comprobarlo.

## Requisitos mínimos
- [ ] Exactamente 5 microservicios diferenciados.
- [ ] API Gateway único punto de entrada.
- [ ] Comunicación inter-microservicio 100% asíncrona por RabbitMQ.
- [ ] Kubernetes local funcional.
- [ ] Una BD por microservicio, externa al cluster.
- [ ] Monorepo con nomenclatura requerida.
- [ ] Documentación Markdown en repositorio.
- [ ] Entrega UEDI en fecha.

## Documentación y diseño
- [ ] Documento técnico y manual.
- [ ] Modelo de dominio y bounded contexts.
- [ ] Eventos, payloads, topics y correlationId.
- [ ] Casos de uso para ADMIN/CASHIER/CLIENT.
- [ ] C4 L1.
- [ ] C4 L2.
- [ ] C4 L3.
- [ ] UML Deployment.
- [ ] Secuencia transferencia.
- [ ] Secuencia creación de cuenta.
- [ ] UML casos de uso.
- [ ] SLI/SLO/SLA.
- [ ] ADR y trade-offs.

## Implementación y despliegue
- [ ] Customer: identidad, activación email, JWT.
- [ ] Account: MONETARY/SAVINGS, saldo, desactivación.
- [ ] Transaction: transferencia, rechazo, registro.
- [ ] Payment separado.
- [ ] Notification/Audit desacoplado.
- [ ] Gateway sin lógica bancaria.
- [ ] RabbitMQ real.
- [ ] Saga happy path + fallo + compensación.
- [ ] Idempotencia + retry + correlationId.
- [ ] 5 BD independientes.
- [ ] Dockerfiles y Kubernetes.
- [ ] Frontend funcional con 3 roles.

## Penalizaciones a evitar
- [ ] No existe HTTP directo entre los 5 microservicios.
- [ ] Ningún servicio consulta más de una BD.
- [ ] Ninguna BD es compartida.
- [ ] Los diagramas coinciden con el código final.
- [ ] RabbitMQ no está simulado.
- [ ] El cluster Kubernetes se muestra funcionando.
