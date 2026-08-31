# Saga de Transferencia Bancaria

## 1. Objetivo

Implementar el flujo distribuido de una transferencia bancaria mediante una Saga basada en coreografía.

No existe un coordinador central de la Saga.

Cada microservicio reacciona a eventos y publica nuevos eventos según el resultado de su operación local.

## 2. Participantes

- API Gateway
- Transaction Service
- Account Service
- Payment Service
- Notification & Audit Service
- Broker de mensajería

## 3. Flujo exitoso

### Paso 1 - Solicitud

El cliente solicita una transferencia al API Gateway.

El API Gateway publica:

`transaction.transfer.requested`

### Paso 2 - Registro de transacción

Transaction Service consume:

`transaction.transfer.requested`

Registra una nueva transacción con estado:

`PENDING`

Luego publica:

`transaction.created`

### Paso 3 - Validación y reserva de fondos

Account Service consume:

`transaction.created`

Verifica:

- existencia de cuenta origen;
- existencia de cuenta destino;
- estado de las cuentas;
- disponibilidad de fondos.

Si todo es correcto, reserva los fondos y publica:

`account.funds.reserved`

Si los fondos no son suficientes publica:

`account.funds.rejected`

### Paso 4 - Validación financiera

Payment Service consume:

`account.funds.reserved`

Valida la operación financiera.

Si es correcta publica:

`payment.approved`

Si es rechazada publica:

`payment.rejected`

### Paso 5 - Aplicación de transferencia

Account Service consume:

`payment.approved`

Aplica la transferencia entre las cuentas.

Si la operación termina correctamente publica:

`account.transfer.completed`

### Paso 6 - Finalización

Transaction Service consume:

`account.transfer.completed`

Actualiza:

`PENDING -> COMPLETED`

y publica:

`transaction.completed`

Notification & Audit Service consume el evento y registra la operación.

## 4. Flujo por fondos insuficientes

Account Service detecta que la cuenta origen no posee fondos suficientes.

Publica:

`account.funds.rejected`

Transaction Service consume el evento y cambia:

`PENDING -> FAILED`

Luego publica:

`transaction.failed`

No existe compensación porque todavía no se modificaron fondos.

## 5. Flujo con compensación

Puede ocurrir que Account Service reserve los fondos correctamente pero una operación posterior falle.

Ejemplo:

1. Account Service reserva fondos.
2. Publica `account.funds.reserved`.
3. Payment Service rechaza la operación.
4. Publica `payment.rejected`.
5. Account Service consume el rechazo.
6. Libera los fondos reservados.
7. Publica `account.funds.released`.
8. Transaction Service establece la transacción como `FAILED`.

La liberación de fondos constituye la transacción compensatoria de la Saga.

## 6. Estados de una transacción

| Estado | Descripción |
|---|---|
| PENDING | La transferencia fue registrada |
| PROCESSING | La transferencia se encuentra en procesamiento |
| COMPLETED | La transferencia finalizó correctamente |
| FAILED | La transferencia no pudo completarse |
| COMPENSATING | Se está ejecutando una compensación |
| COMPENSATED | La compensación terminó correctamente |

## 7. Correlation ID

Al comenzar el flujo debe generarse un `correlationId`.

Ejemplo:

`550e8400-e29b-41d4-a716-446655440000`

Todos los eventos generados como parte de esa transferencia deben conservar exactamente el mismo `correlationId`.

Esto permite reconstruir el recorrido de una transacción entre múltiples microservicios.

## 8. Idempotencia

Cada evento posee un `eventId` único.

Cada consumidor debe registrar los eventos procesados y evitar ejecutar nuevamente lógica de negocio cuando reciba un `eventId` que ya fue procesado.

Esto evita que un retry duplique:

- transferencias;
- reservas de fondos;
- pagos;
- notificaciones.

## 9. Retries

Los errores temporales de infraestructura podrán generar reintentos.

Ejemplos:

- conexión temporalmente perdida con la base de datos;
- broker temporalmente no disponible;
- consumidor reiniciado.

Los retries no deben generar operaciones duplicadas debido al mecanismo de idempotencia.

## 10. Flujos
![Flujo General Saga Transferencia](/docs/Img/Flujo_transferencia_entre_servicios.png)

*Figura 1.* Flujo exitoso de transferencia bancaria. Se representa el procesamiento completo de una transferencia mediante comunicación asíncrona entre API Gateway, Transaction Service, Account Service, Payment Service y Notification & Audit Service, conservando la trazabilidad mediante correlationId.

![Flujo fallo fondos insuficientes](/docs/Img/fallo_fondos_insuficientes.png)

*Figura 2.* Flujo de fallo por fondos insuficientes. Se representa el escenario en el que Account Service detecta que la cuenta origen no dispone de fondos suficientes, provocando el rechazo de la operación y el cambio de estado de la transacción a FAILED, sin realizar movimientos de saldo.

![Flujo falla posterior compensacion](/docs/Img/fallo_posterior_compensacion_saga.png)

*Figura 3.* Flujo de fallo posterior y compensación mediante Saga. Se muestra el escenario en el que, después de reservar fondos, ocurre un fallo posterior en Payment Service; Account Service libera la reserva mediante una operación compensatoria y Transaction Service finaliza la transacción con estado FAILED.