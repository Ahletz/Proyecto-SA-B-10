# 17. Guía de demostración para calificación

## Orden recomendado
1. `kubectl get pods -n bank-usac` y `kubectl get svc -n bank-usac`.
2. C4 Nivel 1, C4 Nivel 2 y UML Deployment.
3. RabbitMQ: exchanges, queues y bindings.
4. Registro CLIENT desde frontend Kubernetes `http://localhost:30000`.
5. MailHog por port-forward y correo de activación.
6. Login/JWT y perfil `VALIDATED/ACTIVE`.
7. Crear `MONETARY Q1500` y `SAVINGS Q100`.
8. Transferir Q250 y mostrar `correlationId`.
9. Consultar estado `COMPLETED` y saldos Q1250/Q350.
10. Login ADMIN y mostrar auditoría con el mismo `correlationId` en todos los eventos.
11. Login CASHIER y mostrar pagos; verificar que auditoría no está autorizada.
12. Ejecutar smoke de roles y fallos de Saga.
13. Mostrar retry/DLQ, idempotencia y NetworkPolicy.

## Evidencias automatizadas
```bash
./scripts/project/smoke-k8s.sh
./scripts/project/smoke-roles-k8s.sh
./scripts/project/smoke-saga-failures-k8s.sh
```

## Frase clave sobre asincronía
> Los cinco microservicios no se invocan entre sí por HTTP para ejecutar una transferencia. El Gateway publica el comando inicial y Transaction, Account, Payment y Notification/Audit avanzan mediante eventos RabbitMQ. Las llamadas HTTP Gateway->servicio son tráfico de borde, no comunicación inter-microservicio.

## Frase clave sobre Saga
> Cada servicio ejecuta una transacción local. Si Payment rechaza después de reservar fondos, Account libera la reserva y Transaction termina `COMPENSATED`; no existe rollback distribuido ACID.

![Flujo de demo](../assets/diagramas/demo-flow.png)
