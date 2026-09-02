package com.bankusac.payment_service.listener;

import com.bankusac.payment_service.config.RabbitMQConfig;
import com.bankusac.payment_service.events.BankEvent;
import com.bankusac.payment_service.events.FundsReservedPayload;
import com.bankusac.payment_service.service.PaymentService;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

@Component
public class FundsReservedListener {

    private final PaymentService paymentService;

    public FundsReservedListener(PaymentService paymentService) {
        this.paymentService = paymentService;
    }

    @RabbitListener(queues = RabbitMQConfig.FUNDS_RESERVED_QUEUE)
    public void handle(BankEvent<FundsReservedPayload> event) {
        paymentService.handleFundsReserved(
                event.getEventId(),
                event.getPayload().getTransactionId(),
                event.getPayload().getAmount(),
                event.getCorrelationId()
        );
    }
}