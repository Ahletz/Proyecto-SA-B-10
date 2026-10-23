package com.bank.notification.repository;
import com.bank.notification.model.CustomerContact;
import org.springframework.data.jpa.repository.JpaRepository;
public interface CustomerContactRepository extends JpaRepository<CustomerContact,String> {}
