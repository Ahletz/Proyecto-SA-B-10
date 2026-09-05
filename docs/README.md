# Bank USAC - Documentación técnica final

Esta carpeta documenta la implementación final de **Bank USAC Fase I** y está alineada con el código integrado en el repositorio. La arquitectura cumple con la restricción de **exactamente cinco microservicios**, un **API Gateway** como punto de entrada, comunicación asíncrona mediante **RabbitMQ**, una **base PostgreSQL independiente por microservicio** y despliegue local en **Docker Compose** y **Kubernetes con kind**.

## Arquitectura final

| Componente | Tecnología | Puerto interno | Responsabilidad | Persistencia |
|---|---|---:|---|---|
| Customer Service | Spring Boot | 8081 | registro, identidad, activación, perfil, JWT | `bank_customer` |
| Account Service | NestJS + TypeORM | 3004 | cuentas, saldos, reservas y desactivación | `bank_account` |
| Transaction Service | NestJS + TypeORM | 3003 | ciclo de vida de la transferencia y Saga | `bank_transaction` |
| Payment Service | NestJS + TypeORM | 3005 | validación y registro independiente del pago | `bank_payment` |
| Notification & Audit Service | Spring Boot | 8082 | correo, auditoría y trazabilidad | `bank_notification` |
| API Gateway | NestJS | 8080 | JWT, roles, routing de borde y publicación del comando de transferencia | sin BD |
| Frontend | React + TypeScript | 3000 | interfaz CLIENT/CASHIER/ADMIN | navegador |
| RabbitMQ | RabbitMQ 4 | 5672 | broker `bank.events`, retry y DLX | broker |
| MailHog | MailHog | 1025/8025 | SMTP de demostración | sin BD |

> **Regla clave:** los cinco microservicios no se llaman entre sí mediante HTTP. La interacción distribuida de negocio se realiza por eventos RabbitMQ. El HTTP entre Gateway y un servicio es tráfico de borde para request/response del usuario; el Gateway no ejecuta lógica bancaria ni orquesta la Saga.

## Índice para calificación

1. [Arquitectura y diseño](01-arquitectura/01-vision-general.md)
2. [Modelo de dominio y bounded contexts](01-arquitectura/02-modelo-dominio.md)
3. [API Gateway y seguridad](01-arquitectura/03-api-gateway-seguridad.md)
4. [Persistencia y data ownership](01-arquitectura/04-persistencia-data-ownership.md)
5. [Decisiones arquitectónicas](01-arquitectura/05-decisiones-arquitectura.md)
6. [Catálogo de diagramas](01-arquitectura/06-catalogo-diagramas.md)
7. [Contratos de eventos](02-eventos/01-contratos-eventos.md)
8. [Topología RabbitMQ](02-eventos/02-topologia-rabbitmq.md)
9. [Saga de transferencia](03-saga/01-saga-transferencia.md)
10. [Docker Compose](04-despliegue/01-docker-compose.md)
11. [Kubernetes kind](04-despliegue/02-kubernetes-kind.md)
12. [NetworkPolicy](04-despliegue/03-network-policy.md)
13. [Resiliencia y observabilidad](05-operacion/01-resiliencia-observabilidad.md)
14. [SLI, SLO y SLA](05-operacion/02-sli-slo-sla.md)
15. [Casos de uso](06-casos-uso/01-casos-de-uso.md)
16. [Pruebas](07-pruebas/01-estrategia-pruebas.md)
17. [Guía de demostración](07-pruebas/02-guia-demostracion.md)
18. [Checklist de calificación](07-pruebas/03-checklist-calificacion.md)
19. [Manual de usuario](08-manuales/01-manual-usuario.md)
20. [Referencia API](08-manuales/02-referencia-api.md)
21. [Matriz requisito-evidencia](09-calificacion/01-matriz-requisito-evidencia.md)
22. [Guion de sustentación](09-calificacion/02-guion-sustentacion.md)

## Diagramas principales

![C4 contexto](assets/diagramas/c4-context.png)

![C4 contenedores](assets/diagramas/c4-container.png)

![Deployment](assets/diagramas/uml-deployment.png)

![Saga](assets/diagramas/saga-success.png)
