package com.bankusac.account_service.controller;

import com.bankusac.account_service.model.Account;
import com.bankusac.account_service.service.AccountService;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.UUID;

// la ventanilla por donde entran las peticiones HTTP para cuentas
@RestController
@RequestMapping("/api/accounts")
public class AccountController {

    private final AccountService accountService;

    public AccountController(AccountService accountService) {
        this.accountService = accountService;
    }

    // POST /api/accounts - crea una cuenta nueva con los datos que manda el frontend
    @PostMapping
    public Account createAccount(@RequestBody CreateAccountRequest request) {
        return accountService.createAccount(
                request.getCustomerId(),
                request.getAccountType(),
                request.getInitialBalance()
        );
    }

    // GET /api/accounts/{id}/balance - consulta el saldo disponible de una cuenta
    @GetMapping("/{id}/balance")
    public BigDecimal getBalance(@PathVariable UUID id) {
        return accountService.getAvailableBalance(id);
    }
}