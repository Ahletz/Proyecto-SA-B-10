# 12. Aislamiento de red con NetworkPolicy

La política `backend-ingress-policy` selecciona los cinco microservicios de dominio:
- customer-service;
- account-service;
- transaction-service;
- payment-service;
- notification-audit-service.

Su ingress se permite desde pods con label:
- `app: api-gateway`;
- `app: rabbitmq`.

Esto refuerza la topología prevista: el tráfico HTTP externo entra por Gateway y la interacción asíncrona llega desde RabbitMQ. Frontend no debe hablar directamente con servicios de dominio.

## Verificación
```bash
kubectl get networkpolicy -n bank-usac
kubectl describe networkpolicy backend-ingress-policy -n bank-usac
```

La política actual restringe **Ingress**. No define una política Egress global.
