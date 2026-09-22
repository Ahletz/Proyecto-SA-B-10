package com.bank.notification.service;

import com.bank.notification.model.NotificationSeverity;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Service;

import java.util.Locale;

@Service
public class EventClassificationService {

    public ClassificationResult classify(String eventType, JsonNode payload) {
        String origin = extractOrigin(eventType);

        return switch (eventType) {
            case "customer.kyc.status.changed" ->
                classifyKyc(payload, origin);

            case "payment.result.simulated" ->
                classifyPayment(payload, origin);

            case "transaction.status.changed" ->
                classifyTransaction(payload, origin);

            case "account.created" ->
                new ClassificationResult(
                    NotificationSeverity.INFO,
                    origin,
                    "Cuenta " + value(payload, "accountId", "desconocida")
                        + " creada para el cliente "
                        + value(payload, "customerId", "desconocido")
                );

            case "customer.registered" ->
                new ClassificationResult(
                    NotificationSeverity.INFO,
                    origin,
                    "Cliente " + value(payload, "customerId", "desconocido")
                        + " registrado"
                );

            case "customer.activated" ->
                new ClassificationResult(
                    NotificationSeverity.INFO,
                    origin,
                    "Cliente " + value(payload, "customerId", "desconocido")
                        + " activado"
                );

            case "transaction.transfer.requested" ->
                new ClassificationResult(
                    NotificationSeverity.INFO,
                    origin,
                    "Solicitud de transferencia recibida"
                );

            default -> classifyGeneric(eventType, origin);
        };
    }

    private ClassificationResult classifyKyc(
            JsonNode payload,
            String origin) {

        String status = value(
            payload,
            "estadoNuevo",
            "UNKNOWN"
        ).toUpperCase(Locale.ROOT);

        NotificationSeverity severity =
            "REJECTED".equals(status)
                ? NotificationSeverity.WARNING
                : NotificationSeverity.INFO;

        return new ClassificationResult(
            severity,
            origin,
            "KYC del cliente "
                + value(payload, "customerId", "desconocido")
                + " actualizado a "
                + status
        );
    }

    private ClassificationResult classifyPayment(
            JsonNode payload,
            String origin) {

        String result = value(
            payload,
            "resultado",
            "UNKNOWN"
        ).toUpperCase(Locale.ROOT);

        NotificationSeverity severity = switch (result) {
            case "FAILURE" -> NotificationSeverity.ERROR;
            case "TIMEOUT" -> NotificationSeverity.WARNING;
            default -> NotificationSeverity.INFO;
        };

        return new ClassificationResult(
            severity,
            origin,
            "Resultado de pago "
                + value(payload, "paymentId", "desconocido")
                + ": "
                + result
        );
    }

    private ClassificationResult classifyTransaction(
            JsonNode payload,
            String origin) {

        String status = value(
            payload,
            "estado",
            "UNKNOWN"
        ).toUpperCase(Locale.ROOT);

        NotificationSeverity severity =
            "FAILED".equals(status)
                ? NotificationSeverity.ERROR
                : NotificationSeverity.INFO;

        return new ClassificationResult(
            severity,
            origin,
            "Transacción "
                + value(payload, "transactionId", "desconocida")
                + " cambió a "
                + status
        );
    }

    private ClassificationResult classifyGeneric(
            String eventType,
            String origin) {

        String normalized =
            eventType.toLowerCase(Locale.ROOT);

        NotificationSeverity severity =
            normalized.endsWith(".failed")
                || normalized.endsWith(".error")
                ? NotificationSeverity.ERROR
                : NotificationSeverity.INFO;

        return new ClassificationResult(
            severity,
            origin,
            "Evento " + eventType + " procesado"
        );
    }

    private String extractOrigin(String eventType) {
        int index = eventType.indexOf('.');

        return index > 0
            ? eventType.substring(0, index)
            : eventType;
    }

    private String value(
            JsonNode payload,
            String field,
            String fallback) {

        if (payload == null
                || payload.path(field).isMissingNode()
                || payload.path(field).isNull()) {
            return fallback;
        }

        String value = payload.path(field).asText();

        return value == null || value.isBlank()
            ? fallback
            : value;
    }
}
