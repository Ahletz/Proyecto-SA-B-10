# Contratos de Eventos - Clientes (Customer Service)

> **Estado:** Borrador propuesto por Integrante 1. Pendiente de revisión por el equipo antes de congelarse como versión 1, siguiendo la regla del plan de distribución ("la carpeta de contratos se modifica mediante revisión de al menos otro integrante").
>
> **Actualización:** se agregó `activationToken` al payload de `customer.registered`, necesario para que Notification & Audit pueda armar el link de activación en el correo.

## 1. Objetivo

Este documento define los contratos de eventos publicados por Customer Service durante el ciclo de vida del cliente: registro, activación y actualización de datos.

Customer Service no debe comunicarse directamente mediante HTTP con otros microservicios. La interacción con Notification & Audit Service (y cualquier otro consumidor futuro) se realiza mediante el broker de mensajería definido por el equipo (RabbitMQ).

Nota de diseño: el registro y login en sí se exponen de forma síncrona a través del API Gateway (Gateway → Customer Service), ya que son operaciones de entrada al sistema. Los eventos descritos aquí son el resultado de esas operaciones, publicados para que otros servicios reaccionen de forma asíncrona (por ejemplo, envío de correo de activación o registro de auditoría).

## 2. Estructura común de eventos

Se reutiliza la misma estructura base definida en `transaction-events.md`, para mantener consistencia en todo el sistema:

    {
      "eventId": "uuid",
      "eventType": "string",
      "version": 1,
      "timestamp": "2026-09-01T18:00:00Z",
      "correlationId": "uuid",
      "payload": {}
    }

### Campos

| Campo | Descripción |
|---|---|
| eventId | Identificador único del evento |
| eventType | Nombre del evento |
| version | Versión del contrato |
| timestamp | Fecha y hora de generación |
| correlationId | Identificador común del flujo distribuido, generado por el API Gateway al recibir la solicitud inicial |
| payload | Datos específicos del evento |

El `correlationId` se recibe del API Gateway (no lo genera Customer Service) y debe conservarse en todos los eventos derivados de esa solicitud.

## 3. Eventos de Customer Service

### customer.registered

Indica que Customer Service registró correctamente un nuevo cliente, pendiente de activación.

Productor:
- Customer Service

Consumidor:
- Notification & Audit Service

Payload:

    {
      "customerId": "CUST-001",
      "email": "cliente@example.com",
      "username": "usuario1",
      "status": "PENDING_ACTIVATION",
      "activationToken": "e4e1e3b2-....-....-....-............"
    }

Notas:
- `activationToken` es de un solo uso: se invalida (se pone en null) apenas se consume en `POST /api/customers/activate/{token}`.
- Notification & Audit debe usar este campo para construir el link de activación del correo (URL exacta pendiente de acordar con el frontend, p.ej. `https://.../activar?token={activationToken}`).

### customer.registration.rejected

Indica que el registro no pudo completarse (validación fallida o datos duplicados).

Productor:
- Customer Service

Consumidor:
- Notification & Audit Service

Payload:

    {
      "email": "cliente@example.com",
      "reason": "VALIDATION_ERROR"
    }

Valores posibles de `reason`: `VALIDATION_ERROR`, `DUPLICATE_EVENT`.

### customer.activated

Indica que el cliente activó su cuenta mediante el enlace/correo de activación.

Productor:
- Customer Service

Consumidor:
- Notification & Audit Service

Payload:

    {
      "customerId": "CUST-001",
      "username": "usuario1",
      "status": "ACTIVE"
    }

### customer.updated

Indica que se actualizaron los datos de un cliente existente (email y/o username).

Productor:
- Customer Service

Consumidor:
- Notification & Audit Service

Payload:

    {
      "customerId": "CUST-001",
      "updatedFields": ["email", "username"]
    }

## 4. Códigos de razón/error utilizados en este contrato

Reutilizando el catálogo común acordado por el equipo:

- `VALIDATION_ERROR`
- `DUPLICATE_EVENT`
- `INTERNAL_ERROR`

## 5. Reglas generales

1. Customer Service no puede consultar la base de datos de otro servicio.
2. No se utilizará HTTP entre microservicios; solo el broker.
3. Todo evento debe contener `eventId`.
4. Todo evento debe contener `correlationId`, propagado desde el API Gateway.
5. Los consumidores (Notification & Audit) deben implementar idempotencia utilizando `eventId`.
6. Los errores temporales podrán procesarse nuevamente mediante retries.
7. Este contrato deberá versionarse si cambia su estructura, siguiendo la misma convención que `transaction-events.md`.
