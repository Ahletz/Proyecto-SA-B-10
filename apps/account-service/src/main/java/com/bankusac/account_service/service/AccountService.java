package com.bankusac.account_service.service;

import com.bankusac.account_service.config.RabbitMQConfig;
import com.bankusac.account_service.events.BankEvent;
import com.bankusac.account_service.events.FundsReservedPayload;
import com.bankusac.account_service.model.Account;
import com.bankusac.account_service.model.AccountStatus;
import com.bankusac.account_service.model.AccountType;
import com.bankusac.account_service.repository.AccountRepository;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Service;
import com.bankusac.account_service.exception.BankException;
import com.bankusac.account_service.exception.ErrorCode;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

// aqui va la logica de negocio de las cuentas
// el service usa el repository para guardar y leer, pero decide las reglas
@Service
public class AccountService {

    private final AccountRepository accountRepository;
    private final RabbitTemplate rabbitTemplate;

    // limite de saldo para considerar una cuenta candidata a desactivarse
    private static final BigDecimal LIMITE_BALANCE_INACTIVA = new BigDecimal("50.00");

    // meses sin actividad para poder desactivar la cuenta
    private static final int MESES_INACTIVIDAD = 6;

    // spring nos da el repository y el rabbitTemplate automaticamente aqui
    public AccountService(AccountRepository accountRepository, RabbitTemplate rabbitTemplate) {
        this.accountRepository = accountRepository;
        this.rabbitTemplate = rabbitTemplate;
    }

    // crea una cuenta nueva para un cliente
    public Account createAccount(UUID customerId, AccountType accountType, BigDecimal initialBalance) {
        Account account = new Account(customerId, accountType, initialBalance);
        return accountRepository.save(account);
    }

    // devuelve el saldo disponible real, restando lo que esta reservado
    public BigDecimal getAvailableBalance(UUID accountId) {
        Account account = accountRepository.findById(accountId)
                .orElseThrow(() -> new BankException(ErrorCode.ACCOUNT_NOT_FOUND, "cuenta no encontrada"));
        return account.getBalance().subtract(account.getReservedAmount());
    }

        // aparta fondos de la cuenta para una transferencia, sin restarlos del balance todavia
    // se usa cuando llega el evento transaction.created
    // ahora tambien publica account.funds.reserved para que Payment Service lo escuche
    public void reserveFunds(UUID transactionId, UUID accountId, UUID targetAccountId, BigDecimal amount, String correlationId) {
        Account account = accountRepository.findById(accountId)
                .orElseThrow(() -> new BankException(ErrorCode.ACCOUNT_NOT_FOUND, "cuenta no encontrada"));

        BigDecimal disponible = account.getBalance().subtract(account.getReservedAmount());

        // si no alcanza el saldo disponible, no se puede reservar
        if (disponible.compareTo(amount) < 0) {
            throw new BankException(ErrorCode.INSUFFICIENT_FUNDS, "fondos insuficientes");
        }

        // suma el monto al cajon de reservado
        account.setReservedAmount(account.getReservedAmount().add(amount));
        accountRepository.save(account);

        // arma el payload y el evento, y lo publica al broker
        FundsReservedPayload payload = new FundsReservedPayload(transactionId, accountId, targetAccountId, amount);
        BankEvent<FundsReservedPayload> event = new BankEvent<>("account.funds.reserved", correlationId, payload);

        rabbitTemplate.convertAndSend(RabbitMQConfig.BANK_EXCHANGE, "account.funds.reserved", event);
    }

    // libera fondos reservados cuando algo fallo despues, sin haber movido el balance real
    // se usa en la compensacion de la saga
    public void releaseFunds(UUID accountId, BigDecimal amount) {
        Account account = accountRepository.findById(accountId)
                .orElseThrow(() -> new BankException(ErrorCode.ACCOUNT_NOT_FOUND, "cuenta no encontrada"));

        // resta el monto del cajon de reservado, ya no esta apartado
        account.setReservedAmount(account.getReservedAmount().subtract(amount));
        accountRepository.save(account);
    }

    // aplica la transferencia de verdad, cuando payment ya aprobo la operacion
    // se usa cuando llega el evento payment.approved
    public void applyTransfer(UUID sourceAccountId, UUID targetAccountId, BigDecimal amount) {
        Account source = accountRepository.findById(sourceAccountId)
        .orElseThrow(() -> new BankException(ErrorCode.ACCOUNT_NOT_FOUND, "cuenta origen no encontrada"));
        Account target = accountRepository.findById(targetAccountId)
        .orElseThrow(() -> new BankException(ErrorCode.ACCOUNT_NOT_FOUND, "cuenta destino no encontrada"));

        // a la cuenta origen: le baja el balance real y le quita lo reservado
        source.setBalance(source.getBalance().subtract(amount));
        source.setReservedAmount(source.getReservedAmount().subtract(amount));

        // a la cuenta destino: le suma el balance
        target.setBalance(target.getBalance().add(amount));

        accountRepository.save(source);
        accountRepository.save(target);
    }

    // revisa una cuenta y la desactiva si tiene poco saldo y lleva mucho tiempo sin uso
    // regla del enunciado: balance menor a Q50 y 6 meses sin actividad
    public void desactivarSiAplica(UUID accountId) {
        Account account = accountRepository.findById(accountId)
                .orElseThrow(() -> new BankException(ErrorCode.ACCOUNT_NOT_FOUND, "cuenta no encontrada"));

        // si ya esta inactiva, no hay nada que hacer
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