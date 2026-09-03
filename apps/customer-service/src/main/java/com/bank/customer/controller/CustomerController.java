package com.bank.customer.controller;

import com.bank.customer.dto.LoginRequest;
import com.bank.customer.dto.RegisterRequest;
import com.bank.customer.dto.UpdateCustomerRequest;
import com.bank.customer.service.CustomerService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/customers")
public class CustomerController {

    private final CustomerService service;

    public CustomerController(CustomerService service) {
        this.service = service;
    }

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody @jakarta.validation.Valid RegisterRequest req,
                                       @RequestHeader(value = "X-Correlation-Id", required = false) String correlationId) {
        var result = service.register(req, correlationId);
        return ResponseEntity.ok(result);
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody @jakarta.validation.Valid LoginRequest req) {
        var token = service.login(req);
        return ResponseEntity.ok(token);
    }

    // Antes era /activate/{customerId}. Ahora recibe el token real que se manda
    // por correo (o que devuelve /register mientras no exista el envío de correo).
    @PostMapping("/activate/{token}")
    public ResponseEntity<?> activate(@PathVariable String token,
                                       @RequestHeader(value = "X-Correlation-Id", required = false) String correlationId) {
        service.activate(token, correlationId);
        return ResponseEntity.ok().build();
    }

    // Endpoint nuevo: actualizar cliente autenticado (email y/o username).
    // El cliente se identifica por el JWT, no por un ID en la URL.
    @GetMapping("/me")
    public ResponseEntity<?> getMe(Authentication authentication) {
        var result = service.getCurrentCustomer(authentication.getName());
        return ResponseEntity.ok(result);
    }

    @PutMapping("/me")
    public ResponseEntity<?> updateMe(@RequestBody @jakarta.validation.Valid UpdateCustomerRequest req,
                                       Authentication authentication,
                                       @RequestHeader(value = "X-Correlation-Id", required = false) String correlationId) {
        var result = service.updateCustomer(authentication.getName(), req, correlationId);
        return ResponseEntity.ok(result);
    }
}
