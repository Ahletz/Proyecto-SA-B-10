# 21. Matriz requisito - evidencia

| Requisito | Evidencia documental | Evidencia ejecutable |
|---|---|---|
| 5 microservicios | C4 L2 / visión general | `find apps ...` / `kubectl get pods` |
| Gateway único | C4 L2 / API Gateway | `curl :30080/health/ready` |
| Asincronía real | topología RabbitMQ / Saga | `rabbitmqctl list_bindings` |
| Kubernetes | UML Deployment | `kubectl get pods -n bank-usac` |
| 5 BD independientes | Data ownership | `docker compose ps *-db` |
| BD externas al cluster | Deployment | ausencia de Postgres pods |
| Customer/JWT/email | auth flow / manual | registro + MailHog + login |
| Account | C4 L3 Account | cuentas Q1500/Q100 + saldos |
| Transaction/Saga | Saga y secuencia | smoke `COMPLETED/FAILED/COMPENSATED` |
| Payment separado | C4 L3 Payment | auditoría `payment.approved/rejected` |
| Notification/Audit | C4 L3 Notification | `/api/audit/events` y MailHog |
| Idempotencia | resiliencia | `processed_events` / evento duplicado |
| Retry/DLQ | retry flow | exchanges/queues `.retry/.dlq` |
| correlationId | observabilidad | auditoría con misma correlación |
| Roles | casos de uso | role smoke + UI |
| Network isolation | NetworkPolicy | `kubectl describe networkpolicy` |
| Documentación | este árbol | Markdown + PNG + drawio |
