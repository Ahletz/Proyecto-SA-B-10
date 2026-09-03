package com.bankusac.account_service.controller;

import com.bankusac.account_service.model.Account;
import com.bankusac.account_service.service.AccountService;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/accounts")
public class AccountController {

    private final AccountService accountService;

    public AccountController(AccountService accountService) {
        this.accountService = accountService;
    }

    @PostMapping
    public Account createAccount(@RequestBody CreateAccountRequest request) {
        return accountService.createAccount(
                request.getCustomerId(),
                request.getAccountType(),
                request.getInitialBalance()
        );
    }

    @GetMapping("/{id}/balance")
    public BigDecimal getBalance(@PathVariable UUID id) {
        return accountService.getAvailableBalance(id);
    }

    // GET /api/accounts/customer/{customerId} - lista las cuentas de un cliente
    @GetMapping("/customer/{customerId}")
    public List<Account> getAccountsByCustomer(@PathVariable UUID customerId) {
        return accountService.getAccountsByCustomer(customerId);
    }
}