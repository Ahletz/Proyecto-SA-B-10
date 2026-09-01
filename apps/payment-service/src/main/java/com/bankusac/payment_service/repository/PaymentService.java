package com.bankusac.payment_service.service;

import com.bankusac.payment_service.model.Payment;
import com.bankusac.payment_service.model.PaymentStatus;
import com.bankusac.payment_service.repository.PaymentRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.UUID;

// aqui va la logica de negocio de los pagos
@Service
public class PaymentService {

    private final PaymentRepository paymentRepository;

    // spring nos da el repository automaticamente aqui, no lo creamos nosotros
    public PaymentService(PaymentRepository paymentRepository) {
        this.paymentRepository = paymentRepository;
    }

    // procesa un pago nuevo: lo valida y decide si se aprueba o se rechaza
    // se usa cuando llega el evento account.funds.reserved
    public Payment processPayment(UUID transactionId, BigDecimal amount) {
        Payment payment = new Payment(transactionId, amount);

        // validacion simple: el monto tiene que ser mayor a cero
        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            payment.setStatus(PaymentStatus.REJECTED);
            payment.setReason("PAYMENT_VALIDATION_FAILED");
        } else {
            payment.setStatus(PaymentStatus.APPROVED);
        }

        return paymentRepository.save(payment);
    }
}