package com.bank.customer.service;

import com.bank.customer.dto.LoginRequest;
import com.bank.customer.dto.RegisterRequest;
import com.bank.customer.exception.InvalidCredentialsException;
import com.bank.customer.model.Customer;
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
    private CustomerRepository repo; private EventPublisher publisher; private PasswordEncoder encoder; private CustomerService service;
    @BeforeEach void setup(){ repo=mock(CustomerRepository.class); publisher=mock(EventPublisher.class); encoder=mock(PasswordEncoder.class); service=new CustomerService(repo,publisher,encoder); }

    @Test void registerCreatesIdentityAndPublishesEvent(){
        var req=new RegisterRequest("cliente@test.com","cliente1","secret123","Cliente Prueba","DOC-1","photo.png", LocalDate.of(1995,1,1),"Guatemala");
        when(repo.findByEmail(req.email())).thenReturn(Optional.empty()); when(repo.findByDocumentNumber(req.documentNumber())).thenReturn(Optional.empty()); when(repo.findByUsername(req.username())).thenReturn(Optional.empty()); when(encoder.encode(req.password())).thenReturn("hash");
        when(repo.save(any(Customer.class))).thenAnswer(i->{ Customer c=i.getArgument(0); ReflectionTestUtils.setField(c,"id",12L); return c; });
        Map<String,Object> out=service.register(req,"corr-123");
        assertEquals("CUST-12",out.get("customerId")); assertEquals("cliente1",out.get("username")); assertNotNull(out.get("activationToken")); verify(publisher).publish(eq("customer.registered"),anyMap(),eq("corr-123"));
    }

    @Test void loginRejectsInactive(){
        Customer c=customer("PENDING_ACTIVATION"); when(repo.findByUsername("cliente1")).thenReturn(Optional.of(c)); when(encoder.matches("secret123","hash")).thenReturn(true);
        assertThrows(InvalidCredentialsException.class,()->service.login(new LoginRequest("cliente1","secret123")));
    }

    @Test void loginReturnsJwtForActive(){
        Customer c=customer("ACTIVE"); ReflectionTestUtils.setField(c,"id",1L); when(repo.findByUsername("cliente1")).thenReturn(Optional.of(c)); when(encoder.matches("secret123","hash")).thenReturn(true);
        Map<String,Object> out=service.login(new LoginRequest("cliente1","secret123")); assertNotNull(out.get("token")); assertEquals("CLIENT",out.get("role"));
    }

    private Customer customer(String status){ Customer c=new Customer(); c.setEmail("cliente@test.com"); c.setUsername("cliente1"); c.setPassword("hash"); c.setStatus(status); c.setRole("CLIENT"); c.setIdentityStatus("VALIDATED"); c.setFullName("Cliente Prueba"); c.setDocumentNumber("DOC-1"); c.setDocumentPhoto("photo.png"); c.setBirthDate(LocalDate.of(1995,1,1)); c.setAddress("Guatemala"); return c; }
}
