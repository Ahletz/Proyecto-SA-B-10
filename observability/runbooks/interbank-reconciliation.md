# Runbook: InterbankReconciliationMismatch

**Alerta:** la conciliación (`bank_interbank_reconciliation_mismatches_total`) comparó nuestras transferencias del día con las del banco socio y encontró diferencias.

## Diagnóstico
1. Logs de Payment: Loki `{service_name="payment-service"} | json | event="interbank.reconciliation_mismatch"`; incluyen el `interbankTransferId` y el tipo de diferencia.
2. Comparar el estado en `interbank_transfers` (Payment) con `interbank_operations` (Account) para ese id.
3. Casos típicos: aceptación tardía del socio (`late_accepted`), reversa pendiente, evento `account.interbank.*` perdido.
4. Revisar RabbitMQ: colas con mensajes sin consumir o en dead-letter.

## Mitigación
- Evento perdido: republicar vía el outbox (`pending_event`); los eventIds son deterministas, reprocesar es idempotente.
- Aceptación tardía: ejecutar la reversa (`interbank_reversals`) y verificar que Account acredite o devuelva una sola vez.
- Dinero inconsistente que no se resuelve solo: congelar y escalar; no editar saldos a mano sin registro en auditoría.

## Verificación
La siguiente conciliación termina sin diferencias y el contador deja de crecer.
