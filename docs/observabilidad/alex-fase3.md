# Customer y Notification & Audit — Fase 3 de Alex

Implementación secuencial sobre develop mediante ramas feature, PR y CI. Acuerdos y razones en [decisiones](decisiones-alex-fase3.md). PR integrados: [Customer #70](https://github.com/Ahletz/Proyecto-SA-B-10/pull/70), [Notification #71](https://github.com/Ahletz/Proyecto-SA-B-10/pull/71), [auditoría/alertas #72](https://github.com/Ahletz/Proyecto-SA-B-10/pull/72). El cierre se publica en `feature/fase3-dashboard-evidencia-alex`.

## Customer

OTel SDK en aplicación, spans HTTP/publicación/negocio y contexto W3C. Customer persiste el correlationId y contexto del registro para relacionar operaciones posteriores de KYC, con link a la petición administrativa actual. No deja un span abierto durante la espera. El bloqueo KYC serializa transiciones y los cambios repetidos no vuelven a emitir eventos ni medir.

| Métrica Prometheus | Tipo | Significado |
|---|---|---|
| `bank_customer_kyc_current{status}` | gauge | Clientes actuales VERIFIED/REJECTED, consultados de su base |
| `bank_customer_kyc_total{status}` | contador | Transiciones confirmadas a VERIFIED/REJECTED |
| `bank_customer_kyc_verification_duration_seconds` | histograma | Creación a primera verificación, una vez |
| `bank_operations_total{operation,outcome}` | contador | Operaciones por éxito/rechazo/error técnico |
| `bank_operation_duration_seconds` | histograma | Duración de negocio |
| `http_server_request_duration_seconds` | histograma | Latencia HTTP por ruta normalizada y status |

Los ids no son etiquetas. Logs JSON con redacción, contexto, servicio, ambiente y versión; sin SQL ni excepciones crudas. La migración `customer/002_add_lifecycle_observability.sql` es aditiva. El `ddl-auto:update` existente sigue activo; no se cambió esa política del equipo.

## Auditoría y entrega

La transacción de ingestión inserta con `ON CONFLICT DO NOTHING`, guarda una proyección saneada y crea tareas outbox con identidad estable. Solo entonces Rabbit recibe ACK. El worker usa SKIP LOCKED y publisher confirms para eventos; SMTP se reintenta por separado y purga datos operativos tras entregar. Tras diez fallos una tarea queda FAILED para intervención. SMTP conserva semántica al menos una vez, no exactamente una vez.

Se reciben `customer.#`, `transaction.#`, `account.#`, `payment.#` e `interbank.#`. `account.anomaly.detected` genera WARNING y una notificación con contacto proyectado por eventos; si no hay contacto histórico usa el canal operativo configurado. No se introduce HTTP a Customer. `notification.classified` no se consume en la misma cola, evitando bucles.

La tabla operativa outbox puede contener temporalmente email/token necesarios para la entrega; no se expone por API ni logs. La auditoría usa una lista permitida, también al leer registros históricos. Los datos de contacto se mantienen con eventos recientes, sin sobrescribirlos con eventos anteriores.

## Consulta por Gateway

Solo ADMIN, conservando la autorización anterior:

```text
GET /api/audit/events?correlationId=...&traceId=...&service=customer-service&level=WARNING&page=0&size=20&paged=true
```

Todos los filtros se combinan en DB. `page` empieza en 0; `size` está entre 1 y 200. Sin `paged=true` conserva la lista compatible. Con él devuelve `items`, `page`, `size`, `total`, `totalPages`. `q` busca evento/correlationId/origen. Los campos nuevos son `traceId`, `spanId` y `serviceName`; traceId/spanId permanecen null en históricos sin traza. El frontend usa paginación real y muestra los dos identificadores. El Gateway también devuelve traceId en la aceptación de una transferencia interna.

## Alertas y dashboard

Prometheus → Alertmanager → `POST /internal/alerts/slo` de Notification. Bearer desde Secret, fallo cerrado sin configuración, deduplicación por alerta/inicio/estado y recepción de resoluciones. La regla, el webhook, la entrega y la auditoría se probaron en local. La NetworkPolicy solo añade el origen Alertmanager/namespace observability.

El workflow de observabilidad reutiliza/genera un token y lo instala en ambos namespaces sin imprimirlo. El receptor de la **aplicación productiva** requiere la promoción normal por release/main; integrar a develop no significa que ese código ya esté ejecutándose en prod. No se modifica main desde este trabajo.

`bank-customer-audit.json` contiene población KYC, p95 observado, throughput, duplicados y logs de los seis componentes con filtros. Usa el datasource Loki/Tempo existente para abrir una traza desde su log. Se registra en Kustomize. El p95 KYC usa las observaciones acumuladas desde el inicio de las réplicas, indicado en el panel, por su baja frecuencia.

## Diagramas y evidencia

![Customer](../assets/diagramas/c4-component-customer.png)

![Notification](../assets/diagramas/c4-component-notification-audit.png)

[Postmortem local del broker](../postmortems/2026-10-23-alex-broker-local.md), [evidencia](../pruebas/evidencia-alex-2026-10-23/), [reproducción](../../tests/observability/README.md), [runbook de entrega](../../observability/runbooks/notification-delivery.md).

Validación relacionada: Customer 13 pruebas, Notification 19, Gateway 33 y Frontend 7; builds/type-check/lint y manifests renderizados. Se verificaron ciclo KYC, AMQP, idempotencia, correos reales en MailHog, historial de más de 200 eventos, autenticación/deduplicación de alertas y lectura de trazas/logs. La evidencia local no sustituye comprobar GKE, HPA y banco pareja.

El histograma mide la primera verificación observada por esta instrumentación; no reconstruye fechas KYC históricas que el sistema anterior no guardó. El gauge sí consulta la población actual completa. Las solicitudes iniciales de transferencia se atribuyen a api-gateway; los demás eventos se atribuyen al servicio dueño del contrato, conservando `origin` por compatibilidad.
