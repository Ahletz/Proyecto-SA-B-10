package com.bankusac.account_service.listener;

import com.bankusac.account_service.config.RabbitMQConfig;
import com.bankusac.account_service.events.BankEvent;
import com.bankusac.account_service.events.PaymentRejectedPayload;
import com.bankusac.account_service.service.AccountService;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

@Component
public class PaymentRejectedListener {

    private final AccountService accountService;

    public PaymentRejectedListener(AccountService accountService) {
        this.accountService = accountService;
    }

    @RabbitListener(queues = RabbitMQConfig.PAYMENT_REJECTED_QUEUE)
    public void handle(BankEvent<PaymentRejectedPayload> event) {
        accountService.handlePaymentRejected(
                event.getEventId(),
                event.getPayload().getTransactionId(),
                event.getCorrelationId()
        );
    }
}