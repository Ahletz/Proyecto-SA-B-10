package com.bank.notification.config;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RabbitConfig {

    public static final String EXCHANGE_NAME = "bank.events";
    public static final String DLQ_EXCHANGE_NAME = "dlx.bank.events";
    public static final String QUEUE_NAME = "svc.notification.dev.customer";
    public static final String DLQ_NAME = "svc.notification.dev.customer.dlq";

    @Bean
    public TopicExchange bankEventsExchange() {
        return new TopicExchange(EXCHANGE_NAME, true, false);
    }

    @Bean
    public TopicExchange bankDlqExchange() {
        return new TopicExchange(DLQ_EXCHANGE_NAME, true, false);
    }

    @Bean
    public Queue customerQueue() {
        return new Queue(QUEUE_NAME, true, false, false,
                java.util.Map.of(
                        "x-dead-letter-exchange", DLQ_EXCHANGE_NAME,
                        "x-dead-letter-routing-key", DLQ_NAME
                ));
    }

    @Bean
    public Queue customerDlq() {
        return new Queue(DLQ_NAME, true, false, false);
    }

    @Bean
    public Binding customerBinding() {
        return BindingBuilder.bind(customerQueue()).to(bankEventsExchange()).with("customer.*");
    }

    @Bean
    public Binding customerDlqBinding() {
        return BindingBuilder.bind(customerDlq()).to(bankDlqExchange()).with(DLQ_NAME);
    }
}
