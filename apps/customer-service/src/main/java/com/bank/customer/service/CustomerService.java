package com.bank.customer.service;

import com.bank.customer.dto.*;
import com.bank.customer.exception.*;
import com.bank.customer.model.Customer;
import com.bank.customer.publisher.EventPublisher;
import com.bank.customer.repository.CustomerRepository;
import com.bank.customer.util.JwtUtil;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.text.Normalizer;
import java.time.LocalDate;
import java.time.Period;
import java.util.*;

@Service
public class CustomerService {
    private final CustomerRepository repo;
    private final EventPublisher publisher;
    private final PasswordEncoder passwordEncoder;

    public CustomerService(CustomerRepository repo, EventPublisher publisher, PasswordEncoder passwordEncoder) {
        this.repo = repo; this.publisher = publisher; this.passwordEncoder = passwordEncoder;
    }

    @Transactional
    public Map<String,Object> register(RegisterRequest req, String correlationId) {
        if (Period.between(req.birthDate(), LocalDate.now()).getYears() < 18)
            throw new ValidationException("El cliente debe ser mayor de edad");
        if (!req.documentNumber().matches("[A-Za-z0-9-]{5,50}")) throw new ValidationException("Formato de documento inválido");
        if (req.documentPhoto().length() < 5) throw new ValidationException("La evidencia fotográfica del documento es requerida");
        if (repo.findByEmail(req.email()).isPresent()) throw new DuplicateCustomerException("El email ya está registrado");
        if (repo.findByDocumentNumber(req.documentNumber()).isPresent()) throw new DuplicateCustomerException("El documento ya está registrado");

        String username = (req.username() == null || req.username().isBlank())
            ? generateUniqueUsername(req.fullName()) : req.username().trim().toLowerCase(Locale.ROOT);
        if (repo.findByUsername(username).isPresent()) throw new DuplicateCustomerException("El username ya está registrado");

        Customer c = new Customer();
        c.setEmail(req.email().trim().toLowerCase(Locale.ROOT));
        c.setUsername(username);
        c.setPassword(passwordEncoder.encode(req.password()));
        c.setStatus("PENDING_ACTIVATION");
        c.setRole("CLIENT");
        c.setIdentityStatus("VALIDATED");
        c.setFullName(req.fullName().trim());
        c.setDocumentNumber(req.documentNumber().trim());
        c.setDocumentPhoto(req.documentPhoto());
        c.setBirthDate(req.birthDate());
        c.setAddress(req.address().trim());
        c.setActivationToken(UUID.randomUUID().toString());
        repo.save(c);

        Map<String,Object> payload = new LinkedHashMap<>();
        payload.put("customerId", "CUST-" + c.getId());
        payload.put("email", c.getEmail());
        payload.put("username", c.getUsername());
        payload.put("fullName", c.getFullName());
        payload.put("role", c.getRole());
        payload.put("identityStatus", c.getIdentityStatus());
        payload.put("status", c.getStatus());
        payload.put("activationToken", c.getActivationToken());
        publisher.publish("customer.registered", payload, correlationId);

        return Map.of("status", "ok", "customerId", "CUST-" + c.getId(),
            "username", c.getUsername(), "activationToken", c.getActivationToken());
    }

    public Map<String,Object> login(LoginRequest req) {
        Customer c = repo.findByUsername(req.username()).orElseThrow(() -> new InvalidCredentialsException("Usuario o contraseña inválidos"));
        if (!passwordEncoder.matches(req.password(), c.getPassword())) throw new InvalidCredentialsException("Usuario o contraseña inválidos");
        if (!"ACTIVE".equals(c.getStatus())) throw new InvalidCredentialsException("La cuenta aún no está activada");
        return Map.of("token", JwtUtil.createToken(c), "role", c.getRole(), "customerId", "CUST-" + c.getId(), "username", c.getUsername());
    }

    public Map<String,Object> getCurrentCustomer(String username) { return toResponse(find(username)); }

    @Transactional
    public void activate(String token, String correlationId) {
        Customer c = repo.findByActivationToken(token).orElseThrow(() -> new InvalidActivationTokenException("Token de activación inválido o ya usado"));
        c.setStatus("ACTIVE"); c.setActivationToken(null); repo.save(c);
        publisher.publish("customer.activated", Map.of("customerId", "CUST-" + c.getId(), "username", c.getUsername(), "role", c.getRole(), "status", "ACTIVE"), correlationId);
    }

    @Transactional
    public Map<String,Object> updateCustomer(String username, UpdateCustomerRequest req, String correlationId) {
        Customer c = find(username); List<String> fields = new ArrayList<>();
        if (req.email()!=null && !req.email().isBlank() && !req.email().equalsIgnoreCase(c.getEmail())) {
            if (repo.findByEmail(req.email()).isPresent()) throw new DuplicateCustomerException("El email ya está registrado");
            c.setEmail(req.email().toLowerCase(Locale.ROOT)); fields.add("email");
        }
        if (req.fullName()!=null && !req.fullName().isBlank()) { c.setFullName(req.fullName()); fields.add("fullName"); }
        if (req.address()!=null && !req.address().isBlank()) { c.setAddress(req.address()); fields.add("address"); }
        if (req.documentPhoto()!=null && !req.documentPhoto().isBlank()) { c.setDocumentPhoto(req.documentPhoto()); fields.add("documentPhoto"); }
        if (fields.isEmpty()) throw new ValidationException("No se envió ningún campo para actualizar");
        repo.save(c);
        publisher.publish("customer.updated", Map.of("customerId", "CUST-" + c.getId(), "updatedFields", fields), correlationId);
        return toResponse(c);
    }

    private Customer find(String username) { return repo.findByUsername(username).orElseThrow(() -> new ValidationException("Cliente no encontrado")); }
    private Map<String,Object> toResponse(Customer c) {
        Map<String,Object> r = new LinkedHashMap<>();
        r.put("customerId", "CUST-" + c.getId()); r.put("username", c.getUsername()); r.put("email", c.getEmail());
        r.put("fullName", c.getFullName()); r.put("documentNumber", c.getDocumentNumber()); r.put("documentPhoto", c.getDocumentPhoto());
        r.put("birthDate", c.getBirthDate()); r.put("address", c.getAddress()); r.put("role", c.getRole()); r.put("identityStatus", c.getIdentityStatus()); r.put("status", c.getStatus()); r.put("registeredAt", c.getCreatedAt());
        return r;
    }
    private String generateUniqueUsername(String fullName) {
        String base = Normalizer.normalize(fullName, Normalizer.Form.NFD).replaceAll("\\p{M}", "")
            .toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9 ]", "").trim().replaceAll("\\s+", ".");
        if (base.length() > 40) base = base.substring(0,40);
        String candidate = base; int i=1;
        while (repo.findByUsername(candidate).isPresent()) candidate = base + i++;
        return candidate;
    }
}
