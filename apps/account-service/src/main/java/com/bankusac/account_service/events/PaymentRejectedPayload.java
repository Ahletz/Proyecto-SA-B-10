package com.bankusac.account_service.events;

import java.util.UUID;

public class PaymentRejectedPayload {
    private UUID transactionId;
    private String status;
    private String reason;

    public PaymentRejectedPayload() {
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

    public String getReason() {
        return reason;
    }

    public void setReason(String reason) {
        this.reason = reason;
    }
}
