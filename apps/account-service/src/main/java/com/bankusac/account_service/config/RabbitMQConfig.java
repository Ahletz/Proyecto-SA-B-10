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

    // traductor que convierte JSON <-> objetos Java automaticamente para RabbitMQ
    // registramos el modulo de fechas para que sepa manejar Instant
    @Bean
    public org.springframework.amqp.support.converter.MessageConverter jsonMessageConverter() {
        com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        mapper.registerModule(new com.fasterxml.jackson.datatype.jsr310.JavaTimeModule());
        return new org.springframework.amqp.support.converter.Jackson2JsonMessageConverter(mapper);
    }

    // le dice a RabbitTemplate que use el traductor JSON al publicar mensajes
    @Bean
    public org.springframework.amqp.rabbit.core.RabbitTemplate rabbitTemplate(
            org.springframework.amqp.rabbit.connection.ConnectionFactory connectionFactory,
            org.springframework.amqp.support.converter.MessageConverter jsonMessageConverter) {
        org.springframework.amqp.rabbit.core.RabbitTemplate template =
                new org.springframework.amqp.rabbit.core.RabbitTemplate(connectionFactory);
        template.setMessageConverter(jsonMessageConverter);
        return template;
    }
}