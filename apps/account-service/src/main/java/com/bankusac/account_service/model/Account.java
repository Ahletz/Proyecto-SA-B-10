package com.bankusac.account_service.model;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "accounts")
public class Account {

    // id unico de la cuenta, se genera solo
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID accountId;

    // a que cliente pertenece esta cuenta
    @Column(nullable = false)
    private UUID customerId;

    // tipo de cuenta: monetaria o ahorro
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private AccountType accountType;

    // saldo actual de la cuenta, usamos BigDecimal para que no se pierdan centavos
    @Column(nullable = false)
    private BigDecimal balance;

    // dinero apartado temporalmente mientras se procesa una transferencia
    @Column(nullable = false)
    private BigDecimal reservedAmount = BigDecimal.ZERO;

    // si la cuenta esta activa o inactiva
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private AccountStatus status;

    // ultima vez que se uso la cuenta, sirve para el proceso de desactivacion por inactividad
    @Column(nullable = false)
    private LocalDateTime lastActivityDate;

    // constructor vacio, JPA lo necesita para armar el objeto desde la base de datos
    public Account() {
    }

    // constructor para crear una cuenta nueva desde el codigo
    public Account(UUID customerId, AccountType accountType, BigDecimal balance) {
        this.customerId = customerId;
        this.accountType = accountType;
        this.balance = balance;
        this.reservedAmount = BigDecimal.ZERO;
        this.status = AccountStatus.ACTIVE;
        this.lastActivityDate = LocalDateTime.now();
    }

    // getters y setters, para leer y modificar cada campo desde afuera de la clase

    public UUID getAccountId() {
        return accountId;
    }

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

    public BigDecimal getBalance() {
        return balance;
    }

    public void setBalance(BigDecimal balance) {
        this.balance = balance;
    }

    public BigDecimal getReservedAmount() {
        return reservedAmount;
    }

    public void setReservedAmount(BigDecimal reservedAmount) {
        this.reservedAmount = reservedAmount;
    }

    public AccountStatus getStatus() {
        return status;
    }

    public void setStatus(AccountStatus status) {
        this.status = status;
    }

    public LocalDateTime getLastActivityDate() {
        return lastActivityDate;
    }

    public void setLastActivityDate(LocalDateTime lastActivityDate) {
        this.lastActivityDate = lastActivityDate;
    }
}