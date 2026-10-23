package com.bank.customer.repository;

import com.bank.customer.model.Customer;
import com.bank.customer.model.KycStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface CustomerRepository extends JpaRepository<Customer, Long> {
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select c from Customer c where c.id = :id")
    Optional<Customer> findForKyc(@org.springframework.data.repository.query.Param("id") Long id);
    Optional<Customer> findByEmail(String email);
    Optional<Customer> findByUsername(String username);
    Optional<Customer> findByActivationToken(String activationToken);
    Optional<Customer> findByDocumentNumber(String documentNumber);
    long countByKycStatus(KycStatus status);
    List<Customer> findByKycStatusOrderByIdAsc(KycStatus kycStatus);
}
