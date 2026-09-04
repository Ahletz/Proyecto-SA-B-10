package com.bankusac.account_service.listener;

import com.bankusac.account_service.config.RabbitMQConfig;
import com.bankusac.account_service.events.BankEvent;
import com.bankusac.account_service.events.PaymentApprovedPayload;
import com.bankusac.account_service.service.AccountService;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

@Component
public class PaymentApprovedListener {

    private final AccountService accountService;

    public PaymentApprovedListener(AccountService accountService) {
        this.accountService = accountService;
    }

    @RabbitListener(queues = RabbitMQConfig.PAYMENT_APPROVED_QUEUE)
    public void handle(BankEvent<PaymentApprovedPayload> event) {
        accountService.handlePaymentApproved(
                event.getEventId(),
                event.getPayload().getTransactionId(),
                event.getCorrelationId()
        );
    }
}