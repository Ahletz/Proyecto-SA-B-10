package com.bankusac.account_service.events;

import java.util.UUID;

public class PaymentApprovedPayload {
    private UUID transactionId;
    private String status;

    public PaymentApprovedPayload() {
    }

    public UUID getTransactionId() {
        return transactionId;
    }

    public void setTransactionId(UUID transactionId) {
        this.transactionId = transactionId;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }
}