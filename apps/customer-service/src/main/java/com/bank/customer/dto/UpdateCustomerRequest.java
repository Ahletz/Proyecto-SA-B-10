package com.bank.customer.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Size;

// Ambos campos son opcionales: se manda solo lo que se quiere cambiar.
// El servicio valida que venga al menos uno.
public record UpdateCustomerRequest(
        @Email String email,
        @Size(min = 3, max = 50) String username
) {}
