package com.bankusac.payment_service.config;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RabbitMQConfig {

    public static final String BANK_EXCHANGE = "bank.events";
    public static final String FUNDS_RESERVED_QUEUE = "payment-service.account.funds.reserved";

    @Bean
    public TopicExchange bankExchange() {
        return new TopicExchange(BANK_EXCHANGE);
    }

    @Bean
    public Queue fundsReservedQueue() {
        return new Queue(FUNDS_RESERVED_QUEUE);
    }

    @Bean
    public Binding fundsReservedBinding(Queue fundsReservedQueue, TopicExchange bankExchange) {
        return BindingBuilder.bind(fundsReservedQueue).to(bankExchange).with("account.funds.reserved");
    }
}