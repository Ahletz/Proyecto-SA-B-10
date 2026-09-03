package com.bankusac.payment_service.controller;

import java.math.BigDecimal;
import java.util.UUID;

// lo que el frontend envia para procesar un pago
public class ProcessPaymentRequest {
    private UUID transactionId;
    private BigDecimal amount;

    public UUID getTransactionId() {
        return transactionId;
    }

    public void setTransactionId(UUID transactionId) {
        this.transactionId = transactionId;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public void setAmount(BigDecimal amount) {
        this.amount = amount;
    }
}