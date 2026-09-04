package com.bankusac.account_service.service;

import com.bankusac.account_service.config.RabbitMQConfig;
import com.bankusac.account_service.events.BankEvent;
import com.bankusac.account_service.events.FundsReservedPayload;
import com.bankusac.account_service.exception.BankException;
import com.bankusac.account_service.exception.ErrorCode;
import com.bankusac.account_service.model.Account;
import com.bankusac.account_service.model.AccountStatus;
import com.bankusac.account_service.model.AccountType;
import com.bankusac.account_service.model.ProcessedEvent;
import com.bankusac.account_service.repository.AccountRepository;
import com.bankusac.account_service.repository.ProcessedEventRepository;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Service
public class AccountService {

    private final AccountRepository accountRepository;
    private final RabbitTemplate rabbitTemplate;
    private final ProcessedEventRepository processedEventRepository;

    private static final BigDecimal LIMITE_BALANCE_INACTIVA = new BigDecimal("50.00");
    private static final int MESES_INACTIVIDAD = 6;

    public AccountService(AccountRepository accountRepository, RabbitTemplate rabbitTemplate, ProcessedEventRepository processedEventRepository) {
        this.accountRepository = accountRepository;
        this.rabbitTemplate = rabbitTemplate;
        this.processedEventRepository = processedEventRepository;
    }

    public Account createAccount(UUID customerId, AccountType accountType, BigDecimal initialBalance) {
        Account account = new Account(customerId, accountType, initialBalance);
        return accountRepository.save(account);
    }

    // devuelve todas las cuentas de un cliente
    public java.util.List<Account> getAccountsByCustomer(UUID customerId) {
        return accountRepository.findByCustomerId(customerId);
    }

    public BigDecimal getAvailableBalance(UUID accountId) {
        Account account = accountRepository.findById(accountId)
                .orElseThrow(() -> new BankException(ErrorCode.ACCOUNT_NOT_FOUND, "cuenta no encontrada"));
        return account.getBalance().subtract(account.getReservedAmount());
    }

    // aparta fondos y guarda la transaccion pendiente para usarla despues en payment.approved/rejected
    public void reserveFunds(String incomingEventId, UUID transactionId, UUID accountId, UUID targetAccountId, BigDecimal amount, String correlationId) {
        if (processedEventRepository.existsById(incomingEventId)) {
            return;
        }

        Account account = accountRepository.findById(accountId)
                .orElseThrow(() -> new BankException(ErrorCode.ACCOUNT_NOT_FOUND, "cuenta no encontrada"));

        BigDecimal disponible = account.getBalance().subtract(account.getReservedAmount());

        if (disponible.compareTo(amount) < 0) {
            throw new BankException(ErrorCode.INSUFFICIENT_FUNDS, "fondos insuficientes");
        }

        account.setReservedAmount(account.getReservedAmount().add(amount));
        // guardamos referencia para cuando llegue la respuesta de payment
        account.setPendingTransactionId(transactionId);
        account.setPendingTargetAccount(targetAccountId);
        accountRepository.save(account);

        FundsReservedPayload payload = new FundsReservedPayload(transactionId, accountId, targetAccountId, amount);
        BankEvent<FundsReservedPayload> event = new BankEvent<>("account.funds.reserved", correlationId, payload);
        rabbitTemplate.convertAndSend(RabbitMQConfig.BANK_EXCHANGE, "account.funds.reserved", event);

        processedEventRepository.save(new ProcessedEvent(incomingEventId, "transaction.created"));
    }

    public void releaseFunds(UUID accountId, BigDecimal amount) {
        Account account = accountRepository.findById(accountId)
                .orElseThrow(() -> new BankException(ErrorCode.ACCOUNT_NOT_FOUND, "cuenta no encontrada"));

        account.setReservedAmount(account.getReservedAmount().subtract(amount));
        accountRepository.save(account);
    }

    public void applyTransfer(UUID sourceAccountId, UUID targetAccountId, BigDecimal amount) {
        Account source = accountRepository.findById(sourceAccountId)
                .orElseThrow(() -> new BankException(ErrorCode.ACCOUNT_NOT_FOUND, "cuenta origen no encontrada"));
        Account target = accountRepository.findById(targetAccountId)
                .orElseThrow(() -> new BankException(ErrorCode.ACCOUNT_NOT_FOUND, "cuenta destino no encontrada"));

        source.setBalance(source.getBalance().subtract(amount));
        source.setReservedAmount(source.getReservedAmount().subtract(amount));
        target.setBalance(target.getBalance().add(amount));

        accountRepository.save(source);
        accountRepository.save(target);
    }

    // se ejecuta cuando payment aprueba la operacion: aplica la transferencia de verdad
    public void handlePaymentApproved(String incomingEventId, UUID transactionId, String correlationId) {
        if (processedEventRepository.existsById(incomingEventId)) {
            return;
        }

        Account source = accountRepository.findAll().stream()
                .filter(a -> transactionId.equals(a.getPendingTransactionId()))
                .findFirst()
                .orElseThrow(() -> new BankException(ErrorCode.ACCOUNT_NOT_FOUND, "no se encontro cuenta con esa transaccion pendiente"));

        UUID targetAccountId = source.getPendingTargetAccount();
        BigDecimal amount = source.getReservedAmount();

        applyTransfer(source.getAccountId(), targetAccountId, amount);

        source.setPendingTransactionId(null);
        source.setPendingTargetAccount(null);
        accountRepository.save(source);

        processedEventRepository.save(new ProcessedEvent(incomingEventId, "payment.approved"));
    }

    // se ejecuta cuando payment rechaza la operacion: libera los fondos reservados (compensacion)
    public void handlePaymentRejected(String incomingEventId, UUID transactionId, String correlationId) {
        if (processedEventRepository.existsById(incomingEventId)) {
            return;
        }

        Account source = accountRepository.findAll().stream()
                .filter(a -> transactionId.equals(a.getPendingTransactionId()))
                .findFirst()
                .orElseThrow(() -> new BankException(ErrorCode.ACCOUNT_NOT_FOUND, "no se encontro cuenta con esa transaccion pendiente"));

        BigDecimal amount = source.getReservedAmount();
        releaseFunds(source.getAccountId(), amount);

        source.setPendingTransactionId(null);
        source.setPendingTargetAccount(null);
        accountRepository.save(source);

        processedEventRepository.save(new ProcessedEvent(incomingEventId, "payment.rejected"));
    }

    public void desactivarSiAplica(UUID accountId) {
        Account account = accountRepository.findById(accountId)
                .orElseThrow(() -> new BankException(ErrorCode.ACCOUNT_NOT_FOUND, "cuenta no encontrada"));

        if (account.getStatus() == AccountStatus.INACTIVE) {
            return;
        }

        boolean balanceBajo = account.getBalance().compareTo(LIMITE_BALANCE_INACTIVA) < 0;
        boolean sinActividad = account.getLastActivityDate()
                .isBefore(LocalDateTime.now().minusMonths(MESES_INACTIVIDAD));

        if (balanceBajo && sinActividad) {
            account.setStatus(AccountStatus.INACTIVE);
            accountRepository.save(account);
        }
    }
}