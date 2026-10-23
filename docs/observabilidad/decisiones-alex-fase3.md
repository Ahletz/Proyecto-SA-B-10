# Decisiones de Alex — Fase 3

Acuerdo del usuario: feature → push → PR → CI aprobado → merge a develop. Implementación secuencial; cambios compartidos solo para conectar los requisitos de Customer/Notification. Validación local aislada; evidencia cloud pendiente de acceso.

## Customer
- SDK OpenTelemetry dentro de la aplicación y API para spans/métricas: sin agente externo ni dependencia en servicios de compañeros. Un filtro HTTP y publicador AMQP propagan W3C.
- Un correlationId de ciclo de vida se guarda en Customer. El contexto del registro se restaura en la operación KYC; no se deja un span abierto durante horas. Los clientes históricos adquieren contexto en su siguiente cambio. Los eventos existentes mantienen nombre/envelope.
- Contador `bank.customer.kyc` por transición confirmada VERIFIED/REJECTED. Histograma `bank.customer.kyc.verification.duration` en segundos hasta la primera verificación, una sola vez; sin ids como labels. La emisión espera al commit.
- Logs JSON por stdout, correlación por MDC y campos de versión/ambiente. Se omiten excepciones crudas y se redactan datos sensibles; SQL desactivado. El token de activación permanece en el evento operativo para compatibilidad, pero Notification deberá excluirlo de auditoría.
- Migración SQL aditiva, compatible con el `ddl-auto:update` existente; no se cambia la infraestructura de datos de otros dominios.
- Pruebas y PR se registran al validar cada bloque. Las pruebas cloud no se consideran ejecutadas por haber pasado CI.

## Notification y auditoría durable
- Inbox PostgreSQL con `ON CONFLICT DO NOTHING`: inserción de auditoría y tareas de entrega en una sola transacción. El ACK de Rabbit ocurre después del commit; una reentrega no crea más tareas.
- Outbox con selección `FOR UPDATE SKIP LOCKED`, reintentos y estado FAILED tras diez intentos; SMTP y publicación quedan fuera del camino de auditoría. Los ids de tareas son determinísticos y los mensajes AMQP clasificados conservan eventId determinístico y publisher confirms.
- SMTP es entrega al menos una vez: una caída después de enviar y antes de confirmar en DB aún puede repetir el correo. Se incluye NotificationId para reconocerlo; no se afirma exactamente una vez para SMTP.
- Proyección local de contactos desde eventos Customer; ningún HTTP entre dominios. Los payloads del historial son una lista permitida sin tokens/correos/fotografías. Datos operativos de activación quedan solo en outbox y se purgan al entregar.
- Dos consumidores, prefetch 20 y un worker; revisar throughput con el pool de cuatro conexiones. `interbank.#` se añade al mismo servicio, sin crear un sexto microservicio ni consumir `notification.classified` en bucle.
