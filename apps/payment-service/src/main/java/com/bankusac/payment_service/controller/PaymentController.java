package com.bankusac.payment_service.controller;

import com.bankusac.payment_service.model.Payment;
import com.bankusac.payment_service.service.PaymentService;
import org.springframework.web.bind.annotation.*;

// la ventanilla por donde entran las peticiones HTTP para pagos
@RestController
@RequestMapping("/api/payments")
public class PaymentController {

    private final PaymentService paymentService;

    public PaymentController(PaymentService paymentService) {
        this.paymentService = paymentService;
    }

    // POST /api/payments - procesa un pago con los datos que manda el frontend
    @PostMapping
    public Payment processPayment(@RequestBody ProcessPaymentRequest request) {
        return paymentService.processPayment(request.getTransactionId(), request.getAmount());
    }
}