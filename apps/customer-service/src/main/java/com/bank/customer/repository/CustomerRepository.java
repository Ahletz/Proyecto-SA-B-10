package com.bank.customer.repository;

import com.bank.customer.model.Customer;
import com.bank.customer.model.KycStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface CustomerRepository extends JpaRepository<Customer, Long> {
    Optional<Customer> findByEmail(String email);
    Optional<Customer> findByUsername(String username);
    Optional<Customer> findByActivationToken(String activationToken);
    Optional<Customer> findByDocumentNumber(String documentNumber);
    List<Customer> findByKycStatusOrderByIdAsc(KycStatus kycStatus);
}
