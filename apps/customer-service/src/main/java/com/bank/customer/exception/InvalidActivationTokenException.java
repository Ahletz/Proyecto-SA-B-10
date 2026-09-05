package com.bank.customer.exception;

// Token de activación inválido, ya usado, o inexistente.
// NOTA: igual que en los otros casos, no hay código dedicado en el catálogo común;
// se mapea a VALIDATION_ERROR con status 400.
public class InvalidActivationTokenException extends RuntimeException {
    public InvalidActivationTokenException(String message) {
        super(message);
    }
}
