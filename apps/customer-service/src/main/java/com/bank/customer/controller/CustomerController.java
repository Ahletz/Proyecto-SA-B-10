package com.bank.customer.controller;

import com.bank.customer.dto.*;
import com.bank.customer.service.CustomerService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/customers")
public class CustomerController {
    private final CustomerService service;
    public CustomerController(CustomerService service) { this.service = service; }

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody @Valid RegisterRequest req,
        @RequestHeader(value="X-Correlation-Id", required=false) String correlationId) {
        return ResponseEntity.ok(service.register(req, correlationId));
    }
    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody @Valid LoginRequest req) { return ResponseEntity.ok(service.login(req)); }
    @GetMapping("/activate/{token}")
    public ResponseEntity<?> activate(@PathVariable String token,
        @RequestHeader(value="X-Correlation-Id", required=false) String correlationId) {
        service.activate(token, correlationId); return ResponseEntity.ok(java.util.Map.of("status","activated"));
    }
    @GetMapping("/me")
    public ResponseEntity<?> me(Authentication auth) { return ResponseEntity.ok(service.getCurrentCustomer(auth.getName())); }
    @PutMapping("/me")
    public ResponseEntity<?> update(@RequestBody @Valid UpdateCustomerRequest req, Authentication auth,
        @RequestHeader(value="X-Correlation-Id", required=false) String correlationId) {
        return ResponseEntity.ok(service.updateCustomer(auth.getName(), req, correlationId));
    }
}
