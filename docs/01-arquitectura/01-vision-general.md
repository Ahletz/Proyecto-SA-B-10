# Visión general de arquitectura

## Objetivo
Bank USAC implementa un sistema bancario desacoplado y observable, desplegado en Google Cloud (GKE, Cloud SQL y Cloud Run) y reproducible en local con Docker Compose o kind. La solución se organiza en cinco bounded contexts con persistencia independiente, un flujo de transferencias distribuido por eventos y depósitos interbancarios con un banco pareja.

## Restricciones estructurales
- exactamente cinco microservicios de dominio;
- API Gateway como único punto de entrada del backend;
- comunicación inter-microservicio asíncrona por RabbitMQ;
- una base PostgreSQL por microservicio, sin compartir tablas ni consultas SQL cruzadas;
- bases externas al cluster Kubernetes (Docker Compose en desarrollo, Cloud SQL en producción);
- frontend desacoplado que consume únicamente el Gateway;
- Saga por coreografía, con compensación e idempotencia;
- observabilidad de punta a punta: una transferencia es una sola traza, con métricas, logs JSON y alertas por SLO.

## Stack real
- **Spring Boot:** Customer Service y Notification & Audit Service.
- **NestJS + TypeORM:** Account, Transaction, Payment y API Gateway.
- **React + TypeScript:** frontend (Cloud Run con nginx en producción).
- **RabbitMQ:** exchange principal `bank.events`, retry `bank.events.retry` y dead-letter `bank.events.dlx`.
- **PostgreSQL 17:** cinco bases independientes (Docker Compose en desarrollo, Cloud SQL en producción).
- **Kubernetes:** GKE en producción (namespaces `prod` y `observability`) y kind en desarrollo, con Kustomize y HPA.
- **Observabilidad:** OpenTelemetry (SDK en cada servicio), OTel Collector, Prometheus, Tempo, Loki y Grafana.
- **Interbancario:** contrato OpenAPI del curso hacia el banco pareja (BANK13); `interbank-mock` (BANK99) para pruebas y fallos controlados.
- **MailHog:** correo de activación y notificación (SMTP de demostración).
- **CI/CD:** GitHub Actions, imágenes en GHCR y Terraform para la infraestructura.

## C4 Nivel 1
![Contexto](../assets/diagramas/c4-context.png)

## C4 Nivel 2
![Contenedores](../assets/diagramas/c4-container-fase3.png)

## C4 Nivel 3
- [Customer Service](../assets/diagramas/c4-component-customer.png)
- [Account Service](../assets/diagramas/c4-component-account.png)
- [Transaction Service](../assets/diagramas/c4-component-transaction.png)
- [Payment Service](../assets/diagramas/c4-component-payment.png)
- [Notification & Audit Service](../assets/diagramas/c4-component-notification-audit.png)

## Principio de comunicación
El Gateway puede realizar llamadas HTTP de borde al servicio propietario para operaciones request/response, por ejemplo registro, perfil, cuentas, consulta de pagos o consulta de estado. La transferencia distribuida no usa llamadas HTTP entre los cinco microservicios: Gateway publica `transaction.transfer.requested` (o `transaction.interbank.requested` para un depósito a otro banco) y el resto del proceso avanza por eventos. Hacia el banco pareja, solo Payment habla por HTTP, según el contrato del curso.

El contexto de traza (`traceparent`) viaja en el header HTTP, en los headers AMQP de cada evento y hacia el otro banco, de modo que cada operación queda en una sola traza ([observabilidad](../observabilidad/convenciones.md)).
