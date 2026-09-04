package com.bankusac.account_service.exception;

// codigos de error estandar acordados con el equipo, se usan en todos los microservicios
public enum ErrorCode {
    INSUFFICIENT_FUNDS,
    ACCOUNT_NOT_FOUND,
    ACCOUNT_INACTIVE,
    VALIDATION_ERROR,
    DUPLICATE_EVENT,
    INTERNAL_ERROR
}