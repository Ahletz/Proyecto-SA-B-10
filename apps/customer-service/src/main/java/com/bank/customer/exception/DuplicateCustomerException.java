package com.bank.customer.exception;

/**
 * Email o username ya registrados.
 * NOTA: el catálogo común de códigos no tiene un valor específico para "ya existe";
 * se mapea a VALIDATION_ERROR con status 409. Confirmar con el equipo si conviene
 * agregar un código propio (ej. CUSTOMER_ALREADY_EXISTS) al catálogo compartido.
 */
public class DuplicateCustomerException extends RuntimeException {
    public DuplicateCustomerException(String message) {
        super(message);
    }
}
