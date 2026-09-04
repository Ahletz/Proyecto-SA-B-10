package com.bankusac.account_service.exception;

// excepcion propia del banco, en vez de usar RuntimeException generico
// siempre trae un codigo de error de la lista acordada con el equipo
public class BankException extends RuntimeException {

    private final ErrorCode errorCode;

    public BankException(ErrorCode errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
    }

    public ErrorCode getErrorCode() {
        return errorCode;
    }
}