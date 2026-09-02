package com.bankusac.account_service.config;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RabbitMQConfig {

    public static final String BANK_EXCHANGE = "bank.events";
    public static final String TRANSACTION_CREATED_QUEUE = "account-service.transaction.created";
    public static final String PAYMENT_APPROVED_QUEUE = "account-service.payment.approved";
    public static final String PAYMENT_REJECTED_QUEUE = "account-service.payment.rejected";

    @Bean
    public TopicExchange bankExchange() {
        return new TopicExchange(BANK_EXCHANGE);
    }

    @Bean
    public Queue transactionCreatedQueue() {
        return new Queue(TRANSACTION_CREATED_QUEUE);
    }

    @Bean
    public Queue paymentApprovedQueue() {
        return new Queue(PAYMENT_APPROVED_QUEUE);
    }

    @Bean
    public Queue paymentRejectedQueue() {
        return new Queue(PAYMENT_REJECTED_QUEUE);
    }

    @Bean
    public Binding transactionCreatedBinding(Queue transactionCreatedQueue, TopicExchange bankExchange) {
        return BindingBuilder.bind(transactionCreatedQueue).to(bankExchange).with("transaction.created");
    }

    @Bean
    public Binding paymentApprovedBinding(Queue paymentApprovedQueue, TopicExchange bankExchange) {
        return BindingBuilder.bind(paymentApprovedQueue).to(bankExchange).with("payment.approved");
    }

    @Bean
    public Binding paymentRejectedBinding(Queue paymentRejectedQueue, TopicExchange bankExchange) {
        return BindingBuilder.bind(paymentRejectedQueue).to(bankExchange).with("payment.rejected");
    }
}