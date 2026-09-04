package com.bankusac.account_service.events;

import java.math.BigDecimal;
import java.util.UUID;

// el contenido del evento transaction.created que produce Transaction Service
public class TransactionCreatedPayload {

    private UUID transactionId;
    private UUID sourceAccount;
    private UUID targetAccount;
    private BigDecimal amount;
    private String status;

    public TransactionCreatedPayload() {
    }

    public UUID getTransactionId() {
        return transactionId;
    }

    public void setTransactionId(UUID transactionId) {
        this.transactionId = transactionId;
    }

    public UUID getSourceAccount() {
        return sourceAccount;
    }

    public void setSourceAccount(UUID sourceAccount) {
        this.sourceAccount = sourceAccount;
    }

    public UUID getTargetAccount() {
        return targetAccount;
    }

    public void setTargetAccount(UUID targetAccount) {
        this.targetAccount = targetAccount;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public void setAmount(BigDecimal amount) {
        this.amount = amount;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }
}