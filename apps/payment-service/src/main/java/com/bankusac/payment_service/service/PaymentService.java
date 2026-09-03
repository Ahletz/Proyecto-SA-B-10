package com.bankusac.payment_service.service;

import com.bankusac.payment_service.config.RabbitMQConfig;
import com.bankusac.payment_service.events.BankEvent;
import com.bankusac.payment_service.events.PaymentApprovedPayload;
import com.bankusac.payment_service.events.PaymentRejectedPayload;
import com.bankusac.payment_service.model.Payment;
import com.bankusac.payment_service.model.PaymentStatus;
import com.bankusac.payment_service.model.ProcessedEvent;
import com.bankusac.payment_service.repository.PaymentRepository;
import com.bankusac.payment_service.repository.ProcessedEventRepository;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.UUID;

@Service
public class PaymentService {

    private final PaymentRepository paymentRepository;
    private final ProcessedEventRepository processedEventRepository;
    private final RabbitTemplate rabbitTemplate;

    public PaymentService(PaymentRepository paymentRepository, ProcessedEventRepository processedEventRepository, RabbitTemplate rabbitTemplate) {
        this.paymentRepository = paymentRepository;
        this.processedEventRepository = processedEventRepository;
        this.rabbitTemplate = rabbitTemplate;
    }

    // metodo de prueba manual, se mantiene para el controller existente
    public Payment processPayment(UUID transactionId, BigDecimal amount) {
        Payment payment = new Payment(transactionId, amount);

        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            payment.setStatus(PaymentStatus.REJECTED);
            payment.setReason("PAYMENT_VALIDATION_FAILED");
        } else {
            payment.setStatus(PaymentStatus.APPROVED);
        }

        return paymentRepository.save(payment);
    }

    // devuelve todos los pagos registrados
    public java.util.List<Payment> getAllPayments() {
        return paymentRepository.findAllByOrderByPaymentIdDesc();
    }

    // se ejecuta cuando llega account.funds.reserved
    // valida la operacion y publica payment.approved o payment.rejected
    public void handleFundsReserved(String incomingEventId, UUID transactionId, BigDecimal amount, String correlationId) {
        if (processedEventRepository.existsById(incomingEventId)) {
            return;
        }

        Payment payment = new Payment(transactionId, amount);

        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            payment.setStatus(PaymentStatus.REJECTED);
            payment.setReason("PAYMENT_VALIDATION_FAILED");
            paymentRepository.save(payment);

            PaymentRejectedPayload payload = new PaymentRejectedPayload(transactionId, "REJECTED", "PAYMENT_VALIDATION_FAILED");
            BankEvent<PaymentRejectedPayload> event = new BankEvent<>("payment.rejected", correlationId, payload);
            rabbitTemplate.convertAndSend(RabbitMQConfig.BANK_EXCHANGE, "payment.rejected", event);
        } else {
            payment.setStatus(PaymentStatus.APPROVED);
            paymentRepository.save(payment);

            PaymentApprovedPayload payload = new PaymentApprovedPayload(transactionId, "APPROVED");
            BankEvent<PaymentApprovedPayload> event = new BankEvent<>("payment.approved", correlationId, payload);
            rabbitTemplate.convertAndSend(RabbitMQConfig.BANK_EXCHANGE, "payment.approved", event);
        }

        processedEventRepository.save(new ProcessedEvent(incomingEventId, "account.funds.reserved"));
    }
}