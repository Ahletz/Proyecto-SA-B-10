package com.bankusac.account_service.controller;

import com.bankusac.account_service.model.AccountType;
import java.math.BigDecimal;
import java.util.UUID;

// lo que el frontend envia para crear una cuenta
public class CreateAccountRequest {
    private UUID customerId;
    private AccountType accountType;
    private BigDecimal initialBalance;

    public UUID getCustomerId() {
        return customerId;
    }

    public void setCustomerId(UUID customerId) {
        this.customerId = customerId;
    }

    public AccountType getAccountType() {
        return accountType;
    }

    public void setAccountType(AccountType accountType) {
        this.accountType = accountType;
    }

    public BigDecimal getInitialBalance() {
        return initialBalance;
    }

    public void setInitialBalance(BigDecimal initialBalance) {
        this.initialBalance = initialBalance;
    }
}
