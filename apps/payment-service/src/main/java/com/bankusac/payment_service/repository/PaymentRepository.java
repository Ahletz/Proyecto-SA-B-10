package com.bankusac.payment_service.repository;

import com.bankusac.payment_service.model.Payment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.UUID;

// el bibliotecario que habla con la base de datos por nosotros
@Repository
public interface PaymentRepository extends JpaRepository<Payment, UUID> {

}