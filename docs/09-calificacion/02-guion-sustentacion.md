# Guion de sustentación

## ¿Por qué es una arquitectura de microservicios?
Porque existen cinco servicios desplegables de forma independiente, con bounded context y base propia. No comparten esquema ni llamadas HTTP de negocio entre sí.

## ¿Cómo demuestra la asincronía?
RabbitMQ contiene exchanges reales, colas durables y bindings por routing key. La transferencia interna avanza por `transaction.transfer.requested`, `transaction.created`, `account.funds.reserved`, `payment.approved/rejected`, `account.transfer.completed/funds.released` y estados finales de Transaction.

## ¿El Gateway está orquestando la Saga?
No. El Gateway solo autentica, verifica ownership del origen, crea `correlationId`, publica el comando (`transaction.transfer.requested` o `transaction.interbank.requested`) y responde 202. No espera ni decide los pasos posteriores.

## ¿Por qué se usa Saga?
No existe una transacción ACID que abarque cinco bases. Cada servicio hace commit local; ante rechazo posterior a reserva se ejecuta la compensación `account.funds.released` y Transaction termina `COMPENSATED`.

## ¿Cómo evitan doble débito por mensajes duplicados?
Cada consumidor con efecto persistente registra `eventId` en `processed_events`. Si el ID ya fue procesado, no ejecuta nuevamente la operación.

## ¿Qué pasa si un consumidor falla?
El mensaje se publica en `bank.events.retry`, espera en una cola TTL y vuelve a `bank.events`. Tras 3 reintentos se mueve a `bank.events.dlx` y su DLQ.

## ¿Para qué sirve correlationId?
Identifica una operación de negocio completa. Todos los eventos de la transferencia conservan el mismo valor y Notification/Audit permite reconstruir la secuencia.

## ¿Dónde viven las bases en Kubernetes?
Fuera del cluster. En desarrollo corren en Docker host (5433-5437; los manifiestos reciben la IP del host mediante `start-k8s.sh`) y en producción son cinco instancias Cloud SQL con IP privada en la misma VPC que GKE.

## ¿La autorización depende del frontend?
No. El frontend protege navegación, pero el control real está en `JwtGuard`, `RolesGuard` y las validaciones de ownership del Gateway.

## ¿Qué diferencia hay entre FAILED y COMPENSATED?
`FAILED` ocurre cuando el proceso se rechaza antes de que exista un efecto que revertir, por ejemplo fondos insuficientes. `COMPENSATED` implica que hubo una reserva previa y luego una acción compensatoria liberó esos fondos.

## ¿Cómo se ve una transferencia de punta a punta?
Como una sola traza en Tempo. El Gateway abre la traza y el `traceparent` viaja en los headers AMQP de cada evento, así que Transaction, Account y Payment agregan sus spans. Cada span lleva `bank.correlation_id` y los logs JSON en Loki llevan el mismo `traceId`, enlazados desde la traza.

## ¿Qué SLO miden y qué pasa cuando se incumplen?
99.9 % de operaciones sin error técnico en 30 días, p95 < 5 s y 99.95 % de eventos sin efecto duplicado ([SLO](../sre/slo.md)). Solo `outcome="technical_error"` consume el presupuesto de error; un rechazo de negocio no. Las alertas `SloBurnRateFast` y `SloBurnRateSlow` avisan del consumo del presupuesto y cada una tiene su runbook en `observability/runbooks/`.

## ¿Cómo evitan duplicar o perder dinero en un depósito a otro banco?
El `interbankTransferId` viaja como `Idempotency-Key`: el mismo id con el mismo contenido no acredita dos veces y con otro contenido responde `409`. Se reserva monto y comisión antes de llamar al otro banco y el débito solo se confirma con el callback `ACCEPTED`. Si no hay respuesta antes de `expiresAt`, Payment consulta y cancela con el otro banco y la reserva se mantiene hasta conocer el resultado; solo entonces se libera (`REVERSED`).

## ¿Cómo prueban fallos sin dañar el banco del otro grupo?
Con simuladores propios: `/api/admin/payment-simulation` degrada el procesador de pagos de Payment e `interbank-mock` (BANK99) simula un banco que rechaza, no responde o está caído. Los resultados están en los [postmortems](../postmortems/).

## ¿Cómo se despliega la observabilidad?
Con `deploy-observability.yml` (`kubectl apply -k observability`) en cada cambio de `observability/`. Dashboards, reglas de alerta y runbooks son archivos versionados; no hay pasos manuales salvo los Secrets.
