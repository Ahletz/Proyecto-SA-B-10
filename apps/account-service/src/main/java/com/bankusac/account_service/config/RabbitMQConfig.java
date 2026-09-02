package com.bankusac.account_service.config;

import org.springframework.amqp.core.TopicExchange;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

// aqui se define el tablon de anuncios (exchange) que usa account service
// para publicar sus eventos, cualquier microservicio se puede suscribir
@Configuration
public class RabbitMQConfig {

    public static final String BANK_EXCHANGE = "bank.events";

    @Bean
    public TopicExchange bankExchange() {
        return new TopicExchange(BANK_EXCHANGE);
    }
}