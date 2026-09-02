package com.bank.customer.exception;

// Se mapea al código de razón acordado: VALIDATION_ERROR
public class ValidationException extends RuntimeException {
    public ValidationException(String message) {
        super(message);
    }
}
