package com.bank.customer.exception;

/**
 * Usuario/contraseña incorrectos en login.
 * NOTA: mismo caso que DuplicateCustomerException — se mapea a VALIDATION_ERROR
 * con status 401 por ahora, ya que el catálogo común no tiene un código dedicado
 * para fallo de autenticación. Evaluar agregar INVALID_CREDENTIALS al catálogo
 * si el equipo lo considera necesario.
 */
public class InvalidCredentialsException extends RuntimeException {
    public InvalidCredentialsException(String message) {
        super(message);
    }
}
