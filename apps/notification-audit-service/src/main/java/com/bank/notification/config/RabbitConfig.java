package com.bank.notification.config;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.rabbit.config.SimpleRabbitListenerContainerFactory;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.listener.SimpleMessageListenerContainer;
import org.springframework.amqp.support.converter.SimpleMessageConverter;
import com.bank.notification.consumer.CustomerEventListener;
import org.springframework.retry.interceptor.RetryInterceptorBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RabbitConfig {

    public static final String EXCHANGE_NAME = "bank.events";
    public static final String DLQ_EXCHANGE_NAME = "dlx.bank.events";
    public static final String QUEUE_NAME = "svc.notification.dev.audit";
    public static final String DLQ_NAME = "svc.notification.dev.audit.dlq";

    @Bean
    public TopicExchange bankEventsExchange() {
        return new TopicExchange(EXCHANGE_NAME, true, false);
    }

    @Bean
    public TopicExchange bankDlqExchange() {
        return new TopicExchange(DLQ_EXCHANGE_NAME, true, false);
    }

    @Bean
    public Queue auditQueue() {
        return new Queue(QUEUE_NAME, true, false, false,
                java.util.Map.of(
                        "x-dead-letter-exchange", DLQ_EXCHANGE_NAME,
                        "x-dead-letter-routing-key", DLQ_NAME
                ));
    }

    @Bean
    public Queue auditDlq() {
        return new Queue(DLQ_NAME, true, false, false);
    }

    @Bean
    public Binding customerBinding() {
        return BindingBuilder.bind(auditQueue()).to(bankEventsExchange()).with("customer.#");
    }

    @Bean
    public Binding transactionBinding() {
        return BindingBuilder.bind(auditQueue()).to(bankEventsExchange()).with("transaction.#");
    }

    @Bean
    public Binding accountBinding() {
        return BindingBuilder.bind(auditQueue()).to(bankEventsExchange()).with("account.#");
    }

    @Bean
    public Binding paymentBinding() {
        return BindingBuilder.bind(auditQueue()).to(bankEventsExchange()).with("payment.#");
    }

    @Bean
    public Binding customerDlqBinding() {
        return BindingBuilder.bind(auditDlq()).to(bankDlqExchange()).with(DLQ_NAME);
    }

    @Bean
    public SimpleMessageConverter simpleMessageConverter() {
        return new SimpleMessageConverter();
    }

    @Bean
    public SimpleRabbitListenerContainerFactory auditListenerContainerFactory(
            ConnectionFactory connectionFactory, SimpleMessageConverter simpleMessageConverter) {
        SimpleRabbitListenerContainerFactory factory = new SimpleRabbitListenerContainerFactory();
        factory.setConnectionFactory(connectionFactory);
        factory.setMessageConverter(simpleMessageConverter);
        return factory;
    }

    @Bean
    public SimpleMessageListenerContainer auditMessageListenerContainer(
            ConnectionFactory connectionFactory, CustomerEventListener listener) {
        SimpleMessageListenerContainer container = new SimpleMessageListenerContainer(connectionFactory);
        container.setQueues(auditQueue());
        container.setMessageListener(message -> listener.onMessage(message.getBody()));
        container.setDefaultRequeueRejected(false);
        container.setAdviceChain(RetryInterceptorBuilder.stateless()
            .maxAttempts(3)
            .backOffOptions(1000, 2.0, 10000)
            .build());
        return container;
    }
}
