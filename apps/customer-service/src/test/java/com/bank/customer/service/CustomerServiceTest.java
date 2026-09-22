package com.bank.customer.service;

import com.bank.customer.dto.LoginRequest;
import com.bank.customer.dto.RegisterRequest;
import com.bank.customer.dto.UpdateKycStatusRequest;
import com.bank.customer.exception.InvalidCredentialsException;
import com.bank.customer.exception.ValidationException;
import com.bank.customer.model.Customer;
import com.bank.customer.model.KycStatus;
import com.bank.customer.publisher.EventPublisher;
import com.bank.customer.repository.CustomerRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDate;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class CustomerServiceTest {

    private CustomerRepository repo;
    private EventPublisher publisher;
    private PasswordEncoder encoder;
    private CustomerService service;

    @BeforeEach
    void setup() {
        repo = mock(CustomerRepository.class);
        publisher = mock(EventPublisher.class);
        encoder = mock(PasswordEncoder.class);

        service = new CustomerService(
            repo,
            publisher,
            encoder
        );
    }

    @Test
    void registerCreatesIdentityAndPublishesEvent() {
        var req = new RegisterRequest(
            "cliente@test.com",
            "cliente1",
            "secret123",
            "Cliente Prueba",
            "DOC-1",
            "photo.png",
            LocalDate.of(1995, 1, 1),
            "Guatemala"
        );

        when(repo.findByEmail(req.email()))
            .thenReturn(Optional.empty());

        when(repo.findByDocumentNumber(req.documentNumber()))
            .thenReturn(Optional.empty());

        when(repo.findByUsername(req.username()))
            .thenReturn(Optional.empty());

        when(encoder.encode(req.password()))
            .thenReturn("hash");

        when(repo.save(any(Customer.class)))
            .thenAnswer(invocation -> {
                Customer customer = invocation.getArgument(0);
                ReflectionTestUtils.setField(customer, "id", 12L);
                return customer;
            });

        Map<String,Object> out = service.register(
            req,
            "corr-123"
        );

        assertEquals(
            "CUST-12",
            out.get("customerId")
        );

        assertEquals(
            "cliente1",
            out.get("username")
        );

        assertNotNull(
            out.get("activationToken")
        );

        verify(repo).save(
            argThat(customer ->
                customer.getKycStatus() == KycStatus.PENDING
            )
        );

        verify(publisher).publish(
            eq("customer.registered"),
            anyMap(),
            eq("corr-123")
        );
    }

    @Test
    void loginRejectsInactive() {
        Customer customer = customer(
            "PENDING_ACTIVATION"
        );

        when(repo.findByUsername("cliente1"))
            .thenReturn(Optional.of(customer));

        when(encoder.matches(
            "secret123",
            "hash"
        )).thenReturn(true);

        assertThrows(
            InvalidCredentialsException.class,
            () -> service.login(
                new LoginRequest(
                    "cliente1",
                    "secret123"
                )
            )
        );
    }

    @Test
    void loginReturnsJwtForActive() {
        Customer customer = customer("ACTIVE");

        ReflectionTestUtils.setField(
            customer,
            "id",
            1L
        );

        when(repo.findByUsername("cliente1"))
            .thenReturn(Optional.of(customer));

        when(encoder.matches(
            "secret123",
            "hash"
        )).thenReturn(true);

        Map<String,Object> out =
            service.login(
                new LoginRequest(
                    "cliente1",
                    "secret123"
                )
            );

        assertNotNull(
            out.get("token")
        );

        assertEquals(
            "CLIENT",
            out.get("role")
        );
    }

    @Test
    void updateKycStatusFromPendingToVerified() {
        Customer customer = customer("ACTIVE");

        ReflectionTestUtils.setField(
            customer,
            "id",
            12L
        );

        customer.setKycStatus(
            KycStatus.PENDING
        );

        when(repo.findById(12L))
            .thenReturn(Optional.of(customer));

        Map<String,Object> result =
            service.updateKycStatus(
                "CUST-12",
                new UpdateKycStatusRequest(
                    "VERIFIED"
                ),
                "corr-kyc-001"
            );

        assertEquals(
            KycStatus.VERIFIED,
            customer.getKycStatus()
        );

        assertEquals(
            KycStatus.VERIFIED,
            result.get("kycStatus")
        );

        verify(repo).save(customer);

        verify(publisher).publish(
            eq("customer.kyc.status.changed"),
            argThat(payload ->
                "CUST-12".equals(
                    payload.get("customerId")
                )
                &&
                "PENDING".equals(
                    payload.get("estadoAnterior")
                )
                &&
                "VERIFIED".equals(
                    payload.get("estadoNuevo")
                )
            ),
            eq("corr-kyc-001")
        );
    }

    @Test
    void updateKycStatusFromPendingToRejected() {
        Customer customer = customer("ACTIVE");

        ReflectionTestUtils.setField(
            customer,
            "id",
            15L
        );

        customer.setKycStatus(
            KycStatus.PENDING
        );

        when(repo.findById(15L))
            .thenReturn(Optional.of(customer));

        Map<String,Object> result =
            service.updateKycStatus(
                "CUST-15",
                new UpdateKycStatusRequest(
                    "REJECTED"
                ),
                "corr-kyc-002"
            );

        assertEquals(
            KycStatus.REJECTED,
            customer.getKycStatus()
        );

        assertEquals(
            KycStatus.REJECTED,
            result.get("kycStatus")
        );

        verify(publisher).publish(
            eq("customer.kyc.status.changed"),
            anyMap(),
            eq("corr-kyc-002")
        );
    }

    @Test
    void repeatedKycStatusDoesNotPublishDuplicateEvent() {
        Customer customer = customer("ACTIVE");

        ReflectionTestUtils.setField(
            customer,
            "id",
            20L
        );

        customer.setKycStatus(
            KycStatus.VERIFIED
        );

        when(repo.findById(20L))
            .thenReturn(Optional.of(customer));

        Map<String,Object> result =
            service.updateKycStatus(
                "CUST-20",
                new UpdateKycStatusRequest(
                    "VERIFIED"
                ),
                "corr-kyc-003"
            );

        assertEquals(
            KycStatus.VERIFIED,
            result.get("kycStatus")
        );

        verify(repo, never())
            .save(any(Customer.class));

        verify(publisher, never())
            .publish(
                eq("customer.kyc.status.changed"),
                anyMap(),
                anyString()
            );
    }

    @Test
    void invalidKycStatusIsRejected() {
        Customer customer = customer("ACTIVE");

        ReflectionTestUtils.setField(
            customer,
            "id",
            30L
        );

        when(repo.findById(30L))
            .thenReturn(Optional.of(customer));

        ValidationException exception =
            assertThrows(
                ValidationException.class,
                () -> service.updateKycStatus(
                    "CUST-30",
                    new UpdateKycStatusRequest(
                        "INVALID_STATUS"
                    ),
                    "corr-kyc-004"
                )
            );

        assertTrue(
            exception.getMessage()
                .contains("Estado KYC inválido")
        );

        verify(repo, never())
            .save(any(Customer.class));

        verify(publisher, never())
            .publish(
                eq("customer.kyc.status.changed"),
                anyMap(),
                anyString()
            );
    }

    @Test
    void invalidCustomerIdFormatIsRejected() {
        assertThrows(
            ValidationException.class,
            () -> service.updateKycStatus(
                "INVALID-ID",
                new UpdateKycStatusRequest(
                    "VERIFIED"
                ),
                "corr-kyc-005"
            )
        );

        verify(repo, never())
            .findById(anyLong());

        verify(publisher, never())
            .publish(
                anyString(),
                anyMap(),
                anyString()
            );
    }

    private Customer customer(String status) {
        Customer customer = new Customer();

        customer.setEmail(
            "cliente@test.com"
        );

        customer.setUsername(
            "cliente1"
        );

        customer.setPassword(
            "hash"
        );

        customer.setStatus(status);
        customer.setRole("CLIENT");

        customer.setIdentityStatus(
            "VALIDATED"
        );

        customer.setKycStatus(
            KycStatus.PENDING
        );

        customer.setFullName(
            "Cliente Prueba"
        );

        customer.setDocumentNumber(
            "DOC-1"
        );

        customer.setDocumentPhoto(
            "photo.png"
        );

        customer.setBirthDate(
            LocalDate.of(
                1995,
                1,
                1
            )
        );

        customer.setAddress(
            "Guatemala"
        );

        return customer;
    }
}
