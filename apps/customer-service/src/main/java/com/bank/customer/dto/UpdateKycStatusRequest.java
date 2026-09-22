package com.bank.customer.dto;

import jakarta.validation.constraints.NotBlank;

public record UpdateKycStatusRequest(
    @NotBlank String status
) {}
