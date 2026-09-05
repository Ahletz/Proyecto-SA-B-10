# Bank USAC — Documento técnico

Bank USAC implementa una arquitectura de **exactamente cinco microservicios** con responsabilidades diferenciadas, un API Gateway como único punto de entrada externo, RabbitMQ como broker, una base PostgreSQL independiente por microservicio y despliegue local en Docker Compose y Kubernetes (kind).

## Componentes

| Componente | Responsabilidad | Persistencia |
|---|---|---|
| Customer Service | identidad, registro, activación, roles y JWT | `bank_customer` |
| Account Service | cuentas monetarias/ahorro, saldo, reservas y desactivación | `bank_account` |
| Transaction Service | estado de transferencias y Saga | `bank_transaction` |
| Payment Service | validación y registro de pagos | `bank_payment` |
| Notification & Audit Service | correo, auditoría e historial distribuido | `bank_notification` |
| API Gateway | entrada, autenticación/autorización de borde, routing y publicación de comandos | sin BD |
| Frontend | UI para Cliente, Cajero receptor y Administrador | navegador |
| RabbitMQ | eventos asíncronos | broker |

## Principio de asincronía

Los cinco microservicios **no se invocan entre sí por HTTP**. Toda interacción inter-servicio ocurre mediante `bank.events` y eventos con `eventId` y `correlationId`. El Gateway es infraestructura de borde y puede enrutar una petición HTTP hacia un servicio para operaciones request/response de entrada; esa llamada no constituye comunicación entre dos microservicios.

## Flujo principal

1. El cliente envía una transferencia al Gateway.
2. El Gateway publica `transaction.transfer.requested`.
3. Transaction persiste `PENDING` y publica `transaction.created`.
4. Account reserva fondos y publica `account.funds.reserved` o rechazo.
5. Payment valida y publica `payment.approved` o `payment.rejected`.
6. Account aplica débito/crédito o libera la reserva.
7. Transaction finaliza `COMPLETED`, `FAILED` o `COMPENSATED`.
8. Notification & Audit consume todos los eventos relevantes, envía correos de activación/recepción de transferencias y mantiene trazabilidad.

Consulte `architecture/`, `events/`, `saga/`, `sre/`, `use-cases/`, `deployment/`, `testing/` y `manual/`.
