package com.bank.customer.service;

import com.bank.customer.dto.LoginRequest;
import com.bank.customer.dto.RegisterRequest;
import com.bank.customer.dto.UpdateCustomerRequest;
import com.bank.customer.exception.DuplicateCustomerException;
import com.bank.customer.exception.InvalidActivationTokenException;
import com.bank.customer.exception.InvalidCredentialsException;
import com.bank.customer.exception.ValidationException;
import com.bank.customer.model.Customer;
import com.bank.customer.publisher.EventPublisher;
import com.bank.customer.repository.CustomerRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

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
            publisher.publish("customer.registration.rejected", payload, correlationId);

            String field = emailTaken ? "email" : "username";
            throw new DuplicateCustomerException("El " + field + " ya está registrado");
        }

        String hashed = passwordEncoder.encode(req.password());
        String activationToken = UUID.randomUUID().toString();

        Customer c = new Customer(req.email(), req.username(), hashed, "PENDING_ACTIVATION");
        c.setActivationToken(activationToken);
        repo.save(c);

        Map<String, Object> payload = new HashMap<>();
        payload.put("customerId", "CUST-" + c.getId());
        payload.put("email", c.getEmail());
        payload.put("username", c.getUsername());
        payload.put("status", c.getStatus());
        // Notification & Audit necesita el token para armar el link del correo de activación.
        payload.put("activationToken", activationToken);

        publisher.publish("customer.registered", payload, correlationId);

        // NOTA temporal: devolvemos el activationToken en la respuesta HTTP solo para
        // poder probar el flujo mientras no exista un servicio de correo real.
        // Cuando Notification & Audit envíe el correo de verdad, este campo debería
        // quitarse de aquí (el cliente lo recibiría únicamente por email).
        return Map.of(
                "status", "ok",
                "customerId", "CUST-" + c.getId(),
                "activationToken", activationToken
        );
    }

    public Map<String, String> login(LoginRequest req) {
        Optional<Customer> opt = repo.findByUsername(req.username());
        if (opt.isEmpty()) {
            throw new InvalidCredentialsException("Usuario o contraseña inválidos");
        }

        Customer customer = opt.get();
        if (!passwordEncoder.matches(req.password(), customer.getPassword())) {
            throw new InvalidCredentialsException("Usuario o contraseña inválidos");
        }

        if (!"ACTIVE".equalsIgnoreCase(customer.getStatus())) {
            throw new InvalidCredentialsException("La cuenta aún no está activada");
        }

        String token = com.bank.customer.util.JwtUtil.createToken(customer.getUsername());
        return Map.of("token", token);
    }

    @Transactional
    public void activate(String activationToken, String correlationId) {
        Customer c = repo.findByActivationToken(activationToken)
                .orElseThrow(() -> new InvalidActivationTokenException("Token de activación inválido o ya usado"));

        if ("ACTIVE".equalsIgnoreCase(c.getStatus())) {
            throw new InvalidActivationTokenException("La cuenta ya está activada");
        }

        c.setStatus("ACTIVE");
        c.setActivationToken(null);
        repo.save(c);

        Map<String, Object> payload = new HashMap<>();
        payload.put("customerId", "CUST-" + c.getId());
        payload.put("username", c.getUsername());
        payload.put("status", "ACTIVE");
        publisher.publish("customer.activated", payload, correlationId);
    }

    @Transactional
    public Map<String, Object> updateCustomer(String username, UpdateCustomerRequest req, String correlationId) {
        Customer c = repo.findByUsername(username)
                .orElseThrow(() -> new ValidationException("Cliente no encontrado"));

        List<String> updatedFields = new ArrayList<>();

        if (req.email() != null && !req.email().isBlank() && !req.email().equals(c.getEmail())) {
            if (repo.findByEmail(req.email()).isPresent()) {
                throw new DuplicateCustomerException("El email ya está registrado");
            }
            c.setEmail(req.email());
            updatedFields.add("email");
        }

        if (req.username() != null && !req.username().isBlank() && !req.username().equals(c.getUsername())) {
            if (repo.findByUsername(req.username()).isPresent()) {
                throw new DuplicateCustomerException("El username ya está en uso");
            }
            c.setUsername(req.username());
            updatedFields.add("username");
        }

        if (updatedFields.isEmpty()) {
            throw new ValidationException("No se envió ningún campo para actualizar");
        }

        repo.save(c);

        Map<String, Object> payload = new HashMap<>();
        payload.put("customerId", "CUST-" + c.getId());
        payload.put("updatedFields", updatedFields);
        publisher.publish("customer.updated", payload, correlationId);

        return Map.of(
                "status", "ok",
                "customerId", "CUST-" + c.getId(),
                "updatedFields", updatedFields
        );
    }
}
