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