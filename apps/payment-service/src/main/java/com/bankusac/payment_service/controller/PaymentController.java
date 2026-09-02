package com.bankusac.payment_service.controller;

import com.bankusac.payment_service.model.Payment;
import com.bankusac.payment_service.service.PaymentService;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.UUID;

// la ventanilla por donde entran las peticiones HTTP para pagos
@RestController
@RequestMapping("/api/payments")
public class PaymentController {

    private final PaymentService paymentService;

    public PaymentController(PaymentService paymentService) {
        this.paymentService = paymentService;
    }

    // POST /api/payments - procesa un pago de prueba
    @PostMapping
    public Payment processPayment() {
        UUID transactionIdDePrueba = UUID.randomUUID();
        return paymentService.processPayment(transactionIdDePrueba, new BigDecimal("500.00"));
    }
}
