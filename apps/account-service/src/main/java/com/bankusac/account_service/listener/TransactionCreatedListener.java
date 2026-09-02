package com.bankusac.account_service.listener;

import com.bankusac.account_service.config.RabbitMQConfig;
import com.bankusac.account_service.events.BankEvent;
import com.bankusac.account_service.events.TransactionCreatedPayload;
import com.bankusac.account_service.service.AccountService;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

@Component
public class TransactionCreatedListener {

    private final AccountService accountService;

    public TransactionCreatedListener(AccountService accountService) {
        this.accountService = accountService;
    }

    @RabbitListener(queues = RabbitMQConfig.TRANSACTION_CREATED_QUEUE)
    public void handle(BankEvent<TransactionCreatedPayload> event) {
        TransactionCreatedPayload payload = event.getPayload();
        accountService.reserveFunds(
                event.getEventId(),
                payload.getTransactionId(),
                payload.getSourceAccount(),
                payload.getTargetAccount(),
                payload.getAmount(),
                event.getCorrelationId()
        );
    }
}