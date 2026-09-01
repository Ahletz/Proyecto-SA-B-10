package com.bankusac.account_service.service;

import com.bankusac.account_service.model.Account;
import com.bankusac.account_service.model.AccountType;
import com.bankusac.account_service.repository.AccountRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.UUID;

// aqui va la logica de negocio de las cuentas
// el service usa el repository para guardar y leer, pero decide las reglas
@Service
public class AccountService {

    private final AccountRepository accountRepository;

    // spring nos da el repository automaticamente aqui, no lo creamos nosotros
    public AccountService(AccountRepository accountRepository) {
        this.accountRepository = accountRepository;
    }

    // crea una cuenta nueva para un cliente
    public Account createAccount(UUID customerId, AccountType accountType, BigDecimal initialBalance) {
        Account account = new Account(customerId, accountType, initialBalance);
        return accountRepository.save(account);
    }

    // devuelve el saldo disponible real, restando lo que esta reservado
    public BigDecimal getAvailableBalance(UUID accountId) {
        Account account = accountRepository.findById(accountId)
                .orElseThrow(() -> new RuntimeException("cuenta no encontrada"));
        return account.getBalance().subtract(account.getReservedAmount());
    }
}
