package com.bank.customer.controller;

import com.bank.customer.dto.LoginRequest;
import com.bank.customer.dto.RegisterRequest;
import com.bank.customer.model.Customer;
import com.bank.customer.service.CustomerService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/customers")
public class CustomerController {

    private final CustomerService service;

    public CustomerController(CustomerService service) {
        this.service = service;
    }

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody @jakarta.validation.Valid RegisterRequest req, @RequestHeader(value = "X-Correlation-Id", required = false) String correlationId) {
        var result = service.register(req, correlationId);
        return ResponseEntity.ok(result);
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody @jakarta.validation.Valid LoginRequest req) {
        var token = service.login(req);
        return ResponseEntity.ok(token);
    }

    @PostMapping("/activate/{customerId}")
    public ResponseEntity<?> activate(@PathVariable String customerId, @RequestHeader(value = "X-Correlation-Id", required = false) String correlationId) {
        service.activate(customerId, correlationId);
        return ResponseEntity.ok().build();
    }

}
