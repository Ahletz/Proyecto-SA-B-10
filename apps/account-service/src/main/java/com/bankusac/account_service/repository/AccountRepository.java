package com.bankusac.account_service.repository;

import com.bankusac.account_service.model.Account;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface AccountRepository extends JpaRepository<Account, UUID> {

    // busca todas las cuentas de un cliente
    List<Account> findByCustomerId(UUID customerId);
}