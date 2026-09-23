# 22. Guion de sustentación

## ¿Por qué es una arquitectura de microservicios?
Porque existen cinco servicios desplegables de forma independiente, con bounded context y base propia. No comparten esquema ni llamadas HTTP de negocio entre sí.

## ¿Cómo demuestra la asincronía?
RabbitMQ contiene exchanges reales, colas durables y bindings por routing key. La transferencia avanza por `transaction.transfer.requested`, `transaction.created`, `account.funds.reserved`, `payment.approved/rejected`, `account.transfer.completed/funds.released` y estados finales de Transaction.

## ¿El Gateway está orquestando la Saga?
No. El Gateway solo autentica, verifica ownership del origen, crea `correlationId`, publica el comando y responde 202. No espera ni decide los pasos posteriores.

## ¿Por qué se usa Saga?
No existe una transacción ACID que abarque cinco bases. Cada servicio hace commit local; ante rechazo posterior a reserva se ejecuta la compensación `account.funds.released` y Transaction termina `COMPENSATED`.

## ¿Cómo evitan doble débito por mensajes duplicados?
Cada consumidor con efecto persistente registra `eventId` en `processed_events`. Si el ID ya fue procesado, no ejecuta nuevamente la operación.

## ¿Qué pasa si un consumidor falla?
El mensaje se publica en `bank.events.retry`, espera en una cola TTL y vuelve a `bank.events`. Tras 3 reintentos se mueve a `bank.events.dlx` y su DLQ.

## ¿Para qué sirve correlationId?
Identifica una operación de negocio completa. Todos los eventos de la transferencia conservan el mismo valor y Notification/Audit permite reconstruir la secuencia.

## ¿Dónde viven las bases en Kubernetes?
Fuera de kind. Corren en Docker host en 5433-5437; los manifiestos reciben la IP del host mediante `start-k8s.sh`.

## ¿La autorización depende del frontend?
No. El frontend protege navegación, pero el control real está en `JwtGuard`, `RolesGuard` y las validaciones de ownership del Gateway.

## ¿Qué diferencia hay entre FAILED y COMPENSATED?
`FAILED` ocurre cuando el proceso se rechaza antes de que exista un efecto que revertir, por ejemplo fondos insuficientes. `COMPENSATED` implica que hubo una reserva previa y luego una acción compensatoria liberó esos fondos.
