package com.bank.customer.exception;

import java.time.Instant;

/**
 * Formato estándar de error HTTP para Customer Service.
 * El campo "reason" usa el catálogo común de códigos acordado por el equipo:
 * VALIDATION_ERROR, DUPLICATE_EVENT, INTERNAL_ERROR (ver HojaRuta1.md / docs/events).
 */
public record ErrorResponse(
        String correlationId,
        String reason,
        String message,
        Instant timestamp
) {
    public static ErrorResponse of(String correlationId, String reason, String message) {
        return new ErrorResponse(correlationId, reason, message, Instant.now());
    }
}
