# Decisiones arquitectónicas y trade-offs

## ADR-001 — RabbitMQ topic exchange
Se usa `bank.events` tipo topic. Ventaja: desacoplamiento y fan-out por patrón. Coste: consistencia eventual y mayor complejidad operativa.

## ADR-002 — Saga por coreografía
Cada servicio reacciona a eventos. Evita un orquestador acoplado y satisface asincronía real. Coste: el flujo es más difícil de seguir; se mitiga con `correlationId` y auditoría.

## ADR-003 — Base independiente por microservicio
Elimina acoplamiento de datos y evita consultas cruzadas. Coste: no existen transacciones ACID globales; se usa Saga.

## ADR-004 — Gateway de borde
El Gateway valida JWT/rol, enruta entrada y publica comandos. No implementa dominio ni orquesta la Saga. El HTTP Gateway→servicio se considera tráfico de entrada de borde; entre los cinco microservicios solo existe RabbitMQ.

## ADR-005 — PostgreSQL externo a Kubernetes
En el despliegue kind, los PostgreSQL permanecen como contenedores Docker fuera del cluster y los pods usan la IP gateway del host. Cumple separación requerida. Coste: configuración local dependiente de red; `start-k8s.sh` la resuelve dinámicamente.

## ADR-006 — MailHog para notificaciones demostrables
Permite mostrar un correo real sin credenciales externas. En producción se sustituiría por SMTP/SES/SendGrid.
