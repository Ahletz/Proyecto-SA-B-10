package com.bankusac.payment_service.model;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "payments")
public class Payment {

    // id unico del pago, se genera solo
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID paymentId;

    // a que transaccion pertenece este pago
    @Column(nullable = false)
    private UUID transactionId;

    // monto de la operacion
    @Column(nullable = false)
    private BigDecimal amount;

    // estado del pago: aprobado o rechazado
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PaymentStatus status;

    // razon del rechazo, solo se llena si el pago fue rechazado
    private String reason;

    // constructor vacio, JPA lo necesita
    public Payment() {
    }

    // constructor para crear un pago nuevo
    public Payment(UUID transactionId, BigDecimal amount) {
        this.transactionId = transactionId;
        this.amount = amount;
        this.status = PaymentStatus.PENDING;
    }

    // getters y setters

    public UUID getPaymentId() {
        return paymentId;
    }

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

    public PaymentStatus getStatus() {
        return status;
    }

    public void setStatus(PaymentStatus status) {
        this.status = status;
    }

    public String getReason() {
        return reason;
    }

    public void setReason(String reason) {
        this.reason = reason;
    }
}