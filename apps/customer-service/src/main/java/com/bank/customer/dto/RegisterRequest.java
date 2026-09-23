package com.bank.customer.dto;

import jakarta.validation.constraints.*;
import java.time.LocalDate;

public record RegisterRequest(
    @NotBlank @Email String email,
    @Size(min = 3, max = 50) String username,
    @NotBlank @Size(min = 6, max = 100) String password,
    @NotBlank @Size(min = 3, max = 150) String fullName,
    @NotBlank @Size(min = 5, max = 50) String documentNumber,
    @NotBlank String documentPhoto,
    @NotNull @Past LocalDate birthDate,
    @NotBlank @Size(min = 5, max = 500) String address
) {}
