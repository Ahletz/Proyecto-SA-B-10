package com.bank.customer.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Size;

public record UpdateCustomerRequest(
    @Email String email,
    @Size(min = 3, max = 150) String fullName,
    @Size(min = 5, max = 500) String address,
    String documentPhoto
) {}
