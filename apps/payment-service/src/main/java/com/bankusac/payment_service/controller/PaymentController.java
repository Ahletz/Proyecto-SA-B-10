package com.bankusac.payment_service.controller;

import com.bankusac.payment_service.model.Payment;
import com.bankusac.payment_service.service.PaymentService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/payments")
public class PaymentController {

    private final PaymentService paymentService;

    public PaymentController(PaymentService paymentService) {
        this.paymentService = paymentService;
    }

    @PostMapping
    public Payment processPayment(@RequestBody ProcessPaymentRequest request) {
        return paymentService.processPayment(request.getTransactionId(), request.getAmount());
    }

    // GET /api/payments - lista el historial de pagos
    @GetMapping
    public List<Payment> getAllPayments() {
        return paymentService.getAllPayments();
    }
}