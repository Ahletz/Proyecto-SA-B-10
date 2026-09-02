package com.bank.customer.service;

import com.bank.customer.dto.LoginRequest;
import com.bank.customer.dto.RegisterRequest;
import com.bank.customer.exception.DuplicateCustomerException;
import com.bank.customer.exception.InvalidCredentialsException;
import com.bank.customer.model.Customer;
import com.bank.customer.publisher.EventPublisher;
import com.bank.customer.repository.CustomerRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

@Service
public class CustomerService {

    private final CustomerRepository repo;
    private final EventPublisher publisher;
    private final org.springframework.security.crypto.password.PasswordEncoder passwordEncoder;

    public CustomerService(CustomerRepository repo, EventPublisher publisher,
                            org.springframework.security.crypto.password.PasswordEncoder passwordEncoder) {
        this.repo = repo;
        this.publisher = publisher;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional
    public Map<String, Object> register(RegisterRequest req, String correlationId) {
        boolean emailTaken = repo.findByEmail(req.email()).isPresent();
        boolean usernameTaken = repo.findByUsername(req.username()).isPresent();

        if (emailTaken || usernameTaken) {
            Map<String, Object> payload = new HashMap<>();
            payload.put("email", req.email());
            payload.put("reason", "VALIDATION_ERROR");
            // Se sigue publicando el evento de rechazo para que Notification/Audit
            // registre el intento, aunque ahora el HTTP responda con error real (409).
            publisher.publish("customer.registration.rejected", payload, correlationId);

            String field = emailTaken ? "email" : "username";
            throw new DuplicateCustomerException("El " + field + " ya está registrado");
        }

        String hashed = passwordEncoder.encode(req.password());
        Customer c = new Customer(req.email(), req.username(), hashed, "PENDING_ACTIVATION");
        repo.save(c);

        Map<String, Object> payload = new HashMap<>();
        payload.put("customerId", "CUST-" + c.getId());
        payload.put("email", c.getEmail());
        payload.put("username", c.getUsername());
        payload.put("status", c.getStatus());

        publisher.publish("customer.registered", payload, correlationId);

        return Map.of("status", "ok", "customerId", "CUST-" + c.getId());
    }

    public Map<String, String> login(LoginRequest req) {
        Optional<Customer> opt = repo.findByUsername(req.username());
        if (opt.isPresent() && passwordEncoder.matches(req.password(), opt.get().getPassword())) {
            String token = com.bank.customer.util.JwtUtil.createToken(opt.get().getUsername());
            return Map.of("token", token);
        }
        throw new InvalidCredentialsException("Usuario o contraseña inválidos");
    }

    @Transactional
    public void activate(String customerId, String correlationId) {
        Long id = Long.parseLong(customerId.replace("CUST-", ""));
        Customer c = repo.findById(id).orElseThrow();
        c.setStatus("ACTIVE");
        repo.save(c);

        Map<String, Object> payload = new HashMap<>();
        payload.put("customerId", customerId);
        payload.put("username", c.getUsername());
        payload.put("status", "ACTIVE");
        publisher.publish("customer.activated", payload, correlationId);
    }
}
