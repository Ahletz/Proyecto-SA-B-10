# Contratos de Eventos - Transferencias

## 1. Objetivo

Este documento define los contratos de eventos utilizados durante el flujo asíncrono de transferencias bancarias de Bank USAC.

Los microservicios no deben comunicarse directamente mediante HTTP. La interacción entre servicios se realizará mediante el broker de mensajería definido por el equipo.

## 2. Estructura común de eventos

Todos los eventos del flujo de transferencia utilizarán la siguiente estructura base:

    {
      "eventId": "uuid",
      "eventType": "string",
      "version": 1,
      "timestamp": "2026-08-31T18:00:00Z",
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
| correlationId | Identificador común de todo el flujo distribuido |
| payload | Datos específicos del evento |

El `correlationId` debe conservarse durante todo el flujo de una transferencia.

## 3. Eventos de Transaction Service

### transaction.transfer.requested

Representa una solicitud para realizar una transferencia.

Productor:
- API Gateway

Consumidor:
- Transaction Service

Payload:

    {
      "sourceAccount": "ACC-001",
      "targetAccount": "ACC-002",
      "amount": 500.00
    }

### transaction.created

Indica que Transaction Service registró correctamente la transacción.

Productor:
- Transaction Service

Consumidores:
- Account Service
- Notification & Audit Service

Payload:

    {
      "transactionId": "TX-001",
      "sourceAccount": "ACC-001",
      "targetAccount": "ACC-002",
      "amount": 500.00,
      "status": "PENDING"
    }

## 4. Eventos de Account Service

### account.funds.reserved

Indica que Account Service verificó los fondos y realizó una reserva para la operación.

Productor:
- Account Service

Consumidores:
- Payment Service
- Transaction Service

Payload:

    {
      "transactionId": "TX-001",
      "sourceAccount": "ACC-001",
      "targetAccount": "ACC-002",
      "amount": 500.00
    }

### account.funds.rejected

Indica que no fue posible reservar los fondos.

Productor:
- Account Service

Consumidores:
- Transaction Service
- Notification & Audit Service

Payload:

    {
      "transactionId": "TX-001",
      "reason": "INSUFFICIENT_FUNDS"
    }

## 5. Eventos de Payment Service

### payment.approved

Indica que la operación financiera fue validada correctamente.

Productor:
- Payment Service

Consumidores:
- Account Service
- Transaction Service

Payload:

    {
      "transactionId": "TX-001",
      "status": "APPROVED"
    }

### payment.rejected

Indica que la operación financiera fue rechazada.

Productor:
- Payment Service

Consumidores:
- Account Service
- Transaction Service
- Notification & Audit Service

Payload:

    {
      "transactionId": "TX-001",
      "status": "REJECTED",
      "reason": "PAYMENT_VALIDATION_FAILED"
    }

## 6. Eventos de finalización

### account.transfer.completed

Indica que Account Service aplicó correctamente la transferencia.

Productor:
- Account Service

Consumidores:
- Transaction Service
- Notification & Audit Service

Payload:

    {
      "transactionId": "TX-001",
      "sourceAccount": "ACC-001",
      "targetAccount": "ACC-002",
      "amount": 500.00
    }

### account.transfer.failed

Indica que ocurrió un error al aplicar la transferencia.

Productor:
- Account Service

Consumidores:
- Transaction Service
- Notification & Audit Service

Payload:

    {
      "transactionId": "TX-001",
      "reason": "TRANSFER_PROCESSING_ERROR"
    }

## 7. Eventos de compensación

### account.funds.released

Indica que una reserva de fondos fue liberada debido al fallo de una operación posterior.

Productor:
- Account Service

Consumidores:
- Transaction Service
- Notification & Audit Service

Payload:

    {
      "transactionId": "TX-001",
      "amount": 500.00,
      "reason": "SAGA_COMPENSATION"
    }

## 8. Eventos finales de Transaction Service

### transaction.completed

Productor:
- Transaction Service

Consumidor:
- Notification & Audit Service

Payload:

    {
      "transactionId": "TX-001",
      "status": "COMPLETED"
    }

### transaction.failed

Productor:
- Transaction Service

Consumidor:
- Notification & Audit Service

Payload:

    {
      "transactionId": "TX-001",
      "status": "FAILED",
      "reason": "string"
    }

## 9. Reglas generales

1. Ningún microservicio puede consultar la base de datos de otro servicio.
2. No se utilizará HTTP entre microservicios.
3. Todo evento debe contener `eventId`.
4. Todo evento debe contener `correlationId`.
5. Los consumidores deben implementar idempotencia utilizando `eventId`.
6. Los errores temporales podrán procesarse nuevamente mediante retries.
7. El mismo `correlationId` debe mantenerse durante todo el flujo.
8. Los contratos deberán versionarse si cambia su estructura.
