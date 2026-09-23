# 5. Decisiones arquitectónicas y trade-offs

## ADR-001 - Cinco bounded contexts independientes
**Decisión:** Customer, Account, Transaction, Payment y Notification/Audit son microservicios separados.

**Justificación:** separa responsabilidades y cumple la restricción del proyecto.

**Consecuencia:** la coordinación distribuida requiere eventos y consistencia eventual.

## ADR-002 - RabbitMQ con topic exchanges
**Decisión:** usar `bank.events`, `bank.events.retry` y `bank.events.dlx`.

**Ventajas:** fan-out, routing por `eventType`, desacoplamiento y soporte de retry/DLQ.

**Coste:** mayor complejidad operativa y necesidad de idempotencia.

## ADR-003 - Saga por coreografía
**Decisión:** no existe un orquestador central. Cada servicio reacciona a hechos del dominio.

**Ventajas:** baja dependencia entre servicios y asincronía real.

**Coste:** el flujo es menos visible; se mitiga con `correlationId`, auditoría y diagramas de secuencia.

## ADR-004 - Base de datos por servicio
**Decisión:** cinco bases PostgreSQL, sin BD compartida.

**Consecuencia:** no existe transacción ACID global. La compensación reemplaza el rollback distribuido.

## ADR-005 - Gateway como borde, no como dominio
El Gateway valida token/roles, aplica ownership y publica el comando inicial. No decide fondos, pagos ni estados de la Saga.

## ADR-006 - Account y Payment en NestJS en la implementación final
La documentación final refleja el código integrado: Account y Payment son servicios NestJS con TypeORM y `amqplib`. La capa de seguridad bancaria se concentra en Gateway/Customer, por lo que estos servicios internos no implementan JWT propio.

## ADR-007 - PostgreSQL externo a kind
Las bases se ejecutan fuera del cluster para cumplir el enunciado. Los pods alcanzan el Docker host mediante una IP detectada dinámicamente.

## ADR-008 - MailHog para demostración
El correo se envía por SMTP real hacia MailHog en desarrollo. Esto permite demostrar activación sin depender de credenciales de un proveedor externo.
