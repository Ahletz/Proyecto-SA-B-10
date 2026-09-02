package com.bankusac.account_service.events;

import java.math.BigDecimal;
import java.util.UUID;

// el contenido especifico del evento account.funds.reserved
// segun el contrato acordado con el equipo
public class FundsReservedPayload {

    private UUID transactionId;
    private UUID sourceAccount;
    private UUID targetAccount;
    private BigDecimal amount;

    public FundsReservedPayload() {
    }

    public FundsReservedPayload(UUID transactionId, UUID sourceAccount, UUID targetAccount, BigDecimal amount) {
        this.transactionId = transactionId;
        this.sourceAccount = sourceAccount;
        this.targetAccount = targetAccount;
        this.amount = amount;
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
}