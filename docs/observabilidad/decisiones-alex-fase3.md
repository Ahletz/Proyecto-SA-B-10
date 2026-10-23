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

## Consulta histórica y alertas
- API compatible: sin `paged=true` conserva la lista existente; con `paged=true` devuelve items/page/size/total/totalPages. Filtros por correlationId/traceId/servicio/nivel se ejecutan en DB, con página máxima de 200. Los registros antiguos se saneán también al leerlos y no reciben traceId inventado.
- Cambio mínimo en Gateway (dominio de Nufio): reenvío de filtros permitidos, conservando ADMIN, y campo traceId de la transferencia interna. Es indispensable para exponer la consulta y mostrar la traza exigida por el enunciado; Account, Payment y Transaction no se modifican.
- Frontend usa paginación de servidor y conserva compatibilidad del panel de notificaciones. La transferencia interna muestra el traceId como la interbancaria existente.
- Alertmanager recibe las reglas Prometheus y llama a un endpoint interno autenticado. El token solo vive en Secrets; el pipeline reutiliza/genera uno sin publicarlo y lo instala en observability/prod. NetworkPolicy permite únicamente ese origen adicional. Sin token el receptor falla cerrado (503); una credencial incorrecta recibe 401.
- Alertas duplicadas se identifican por fingerprint/nombre/inicio/estado; el historial y la entrega comparten el inbox/outbox. Las resoluciones generan su propio registro. El despliegue de la aplicación a producción continúa por release/main; integrar a develop no acredita que el receptor nuevo ya esté activo en prod.

## Cierre y hallazgos del escenario local
- Se añade gauge `bank.customer.kyc.current` consultando la base propia: representa clientes actualmente VERIFIED/REJECTED; el contador anterior conserva la historia de transiciones. Así un cliente que cambie de estado no se presenta como dos clientes actuales.
- El dashboard KYC muestra el percentil del histograma acumulado desde el inicio de las réplicas, explícito en su descripción, porque las verificaciones pueden ser poco frecuentes. Los contadores de eventos usan rate para throughput.
- Readiness de Notification depende de aplicación/DB y no del broker: auditoría consultable y recepción de alertas siguen disponibles durante su caída. Liveness permanece independiente. El consumidor se reconecta; outbox reintenta.
- Los fallos técnicos se registran dentro de su span con tipo de excepción, correlationId y traceId; se excluye el texto crudo. Se enlaza la petición administrativa KYC con el contexto del ciclo cuando pertenecen a trazas distintas.
- En las pruebas Java se ejecutan copias inmutables de los JAR para que recompilar no altere un proceso activo. El stack local y credenciales de prueba se mantienen fuera del repositorio.

- La población KYC se consulta desde cada réplica, por lo que el dashboard toma el máximo por ambiente/estado antes de sumar ambientes; sumar réplicas duplicaría los clientes con HPA.
