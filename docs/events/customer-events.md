# Contratos de Eventos - Clientes (Customer Service)

> **Estado:** Borrador propuesto por Integrante 1. Pendiente de revisión por el equipo antes de congelarse como versión 1, siguiendo la regla del plan de distribución ("la carpeta de contratos se modifica mediante revisión de al menos otro integrante").

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

### 2.1. Metadata de mensajería (recomendado)

- **Exchange recomendado:** `bank.events` (tipo `topic`, durable)
- **Routing key (pattern):** `customer.<entity>.<action>` o `customer.<action>` — p.ej. `customer.registered` o `customer.updated`
- **Queue naming (consumidor):** `svc.<consumer>.<env>.customer` — p.ej. `svc.notification.dev.customer`
- **AMQP properties / headers:** enviar `correlationId` y `eventId` también como propiedades/mensajes headers para facilitar tracing en el broker.
- **Content-Type:** `application/json; charset=utf-8`
- **Delivery:** mensajes persistentes (delivery_mode=2), exchanges y queues durables.

Estas convenciones pueden ajustarse desde `docs/events/README.md` cuando el equipo acuerde el estándar global.

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
      "status": "PENDING_ACTIVATION"
    }

JSON Schema (v1):

    {
      "$schema": "http://json-schema.org/draft-07/schema#",
      "type": "object",
      "required": ["eventId","eventType","version","timestamp","correlationId","payload"],
      "properties": {
        "eventId": {"type":"string"},
        "eventType": {"type":"string","enum":["customer.registered"]},
        "version": {"type":"integer","minimum":1},
        "timestamp": {"type":"string","format":"date-time"},
        "correlationId": {"type":"string"},
        "payload": {
          "type":"object",
          "required":["customerId","email","username","status"],
          "properties":{
            "customerId":{"type":"string"},
            "email":{"type":"string","format":"email"},
            "username":{"type":"string"},
            "status":{"type":"string","enum":["PENDING_ACTIVATION","ACTIVE","INACTIVE"]}
          }
        }
      }
    }

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

JSON Schema (v1):

    {
      "$schema": "http://json-schema.org/draft-07/schema#",
      "type":"object",
      "required":["eventId","eventType","version","timestamp","correlationId","payload"],
      "properties":{
        "eventType":{"type":"string","enum":["customer.registration.rejected"]},
        "payload":{
          "type":"object",
          "required":["email","reason"],
          "properties":{
            "email":{"type":"string","format":"email"},
            "reason":{"type":"string","enum":["VALIDATION_ERROR","DUPLICATE_EVENT","INTERNAL_ERROR"]}
          }
        }
      }
    }

Valores posibles de `reason`: `VALIDATION_ERROR`, `DUPLICATE_EVENT`.

### customer.activated

Indica que el cliente activó su cuenta mediante el enlace/correo de activación, en su primer login.

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

JSON Schema (v1):

    {
      "$schema": "http://json-schema.org/draft-07/schema#",
      "type":"object",
      "required":["eventId","eventType","version","timestamp","correlationId","payload"],
      "properties":{
        "eventType":{"type":"string","enum":["customer.activated"]},
        "payload":{
          "type":"object",
          "required":["customerId","username","status"],
          "properties":{
            "customerId":{"type":"string"},
            "username":{"type":"string"},
            "status":{"type":"string","enum":["ACTIVE"]}
          }
        }
      }
    }

### customer.updated

Indica que se actualizaron los datos de un cliente existente.

Productor:
- Customer Service

Consumidor:
- Notification & Audit Service

Payload:

    {
      "customerId": "CUST-001",
      "updatedFields": ["email", "username"]
    }

JSON Schema (v1):

    {
      "$schema":"http://json-schema.org/draft-07/schema#",
      "type":"object",
      "required":["eventId","eventType","version","timestamp","correlationId","payload"],
      "properties":{
        "eventType":{"type":"string","enum":["customer.updated"]},
        "payload":{
          "type":"object",
          "required":["customerId","updatedFields"],
          "properties":{
            "customerId":{"type":"string"},
            "updatedFields":{"type":"array","items":{"type":"string"}}
          }
        }
      }
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
5. Los consumidores (Notification & Audit) deben implementar idempotencia utilizando `eventId` y/o una tabla de procesamiento de eventos para evitar efectos duplicados.
6. Se recomienda implementar un mecanismo de retry exponencial con backoff y una Dead Letter Queue (DLQ) por cada consumidor para mensajes no procesables.
7. Los eventos deben versionarse cuando cambie la estructura del `payload`. Incrementar la propiedad `version` y documentar la migración.
8. Cualquier cambio en este documento debe pasar por revisión de al menos otro integrante antes de marcarse como `v1`.