package com.bankusac.payment_service.repository;

import com.bankusac.payment_service.model.Payment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface PaymentRepository extends JpaRepository<Payment, UUID> {

    // lista todos los pagos, ordenados del mas reciente al mas antiguo
    List<Payment> findAllByOrderByPaymentIdDesc();
}