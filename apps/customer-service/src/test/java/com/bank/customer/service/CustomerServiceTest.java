package com.bank.customer.service;

import com.bank.customer.dto.LoginRequest;
import com.bank.customer.dto.RegisterRequest;
import com.bank.customer.exception.InvalidCredentialsException;
import com.bank.customer.model.Customer;
import com.bank.customer.publisher.EventPublisher;
import com.bank.customer.repository.CustomerRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CustomerServiceTest {

    private CustomerRepository repo;
    private EventPublisher publisher;
    private PasswordEncoder passwordEncoder;
    private CustomerService service;

    @BeforeEach
    void setUp() {
        repo = mock(CustomerRepository.class);
        publisher = mock(EventPublisher.class);
        passwordEncoder = mock(PasswordEncoder.class);
        service = new CustomerService(repo, publisher, passwordEncoder);
    }

    @Test
    void register_shouldCreateCustomerAndPublishRegisteredEvent() {
        RegisterRequest request = new RegisterRequest("cliente@test.com", "cliente1", "secret123");
        when(repo.findByEmail("cliente@test.com")).thenReturn(Optional.empty());
        when(repo.findByUsername("cliente1")).thenReturn(Optional.empty());
        when(passwordEncoder.encode("secret123")).thenReturn("hashed-password");

        Customer saved = new Customer("cliente@test.com", "cliente1", "hashed-password", "PENDING_ACTIVATION");
        saved.setActivationToken("tok-123");
        ReflectionTestUtils.setField(saved, "id", 12L);
        when(repo.save(any(Customer.class))).thenReturn(saved);

        Map<String, Object> result = service.register(request, "corr-123");

        assertEquals("ok", result.get("status"));
        assertEquals("CUST-12", result.get("customerId"));
        assertNotNull(result.get("activationToken"));

        ArgumentCaptor<Customer> customerCaptor = ArgumentCaptor.forClass(Customer.class);
        verify(repo).save(customerCaptor.capture());
        assertEquals("PENDING_ACTIVATION", customerCaptor.getValue().getStatus());
        verify(publisher).publish(eq("customer.registered"), any(Map.class), eq("corr-123"));
    }

    @Test
    void login_shouldFailWhenCustomerIsNotActive() {
        Customer customer = new Customer("cliente@test.com", "cliente1", "hashed-password", "PENDING_ACTIVATION");
        when(repo.findByUsername("cliente1")).thenReturn(Optional.of(customer));
        when(passwordEncoder.matches("secret123", "hashed-password")).thenReturn(true);

        InvalidCredentialsException ex = assertThrows(
                InvalidCredentialsException.class,
                () -> service.login(new LoginRequest("cliente1", "secret123"))
        );

        assertTrue(ex.getMessage().contains("activar") || ex.getMessage().contains("activo"));
    }

    @Test
    void login_shouldSucceedWhenCustomerIsActive() {
        Customer customer = new Customer("cliente@test.com", "cliente1", "hashed-password", "ACTIVE");
        when(repo.findByUsername("cliente1")).thenReturn(Optional.of(customer));
        when(passwordEncoder.matches("secret123", "hashed-password")).thenReturn(true);

        Map<String, String> result = service.login(new LoginRequest("cliente1", "secret123"));

        assertNotNull(result.get("token"));
        assertFalse(result.get("token").isBlank());
    }
}
