package com.bank.notification.config;

import com.bank.notification.consumer.CustomerEventListener;
import org.springframework.amqp.core.*;
import org.springframework.amqp.rabbit.config.RetryInterceptorBuilder;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.listener.SimpleMessageListenerContainer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RabbitConfig {
    public static final String EXCHANGE="bank.events", DLX="bank.events.dlx", QUEUE="notification-audit.events", DLQ="notification-audit.events.dlq";
    @Bean TopicExchange eventsExchange(){return new TopicExchange(EXCHANGE,true,false);}
    @Bean TopicExchange deadLetterExchange(){return new TopicExchange(DLX,true,false);}
    @Bean Queue auditQueue(){return QueueBuilder.durable(QUEUE).deadLetterExchange(DLX).deadLetterRoutingKey("notification.audit.failed").build();}
    @Bean Queue auditDlq(){return QueueBuilder.durable(DLQ).build();}
    @Bean Binding dlqBinding(){return BindingBuilder.bind(auditDlq()).to(deadLetterExchange()).with("notification.audit.failed");}
    @Bean Binding customerBinding(){return BindingBuilder.bind(auditQueue()).to(eventsExchange()).with("customer.#");}
    @Bean Binding transactionBinding(){return BindingBuilder.bind(auditQueue()).to(eventsExchange()).with("transaction.#");}
    @Bean Binding accountBinding(){return BindingBuilder.bind(auditQueue()).to(eventsExchange()).with("account.#");}
    @Bean Binding paymentBinding(){return BindingBuilder.bind(auditQueue()).to(eventsExchange()).with("payment.#");}
    @Bean SimpleMessageListenerContainer auditMessageListenerContainer(ConnectionFactory cf, CustomerEventListener listener){
        SimpleMessageListenerContainer c=new SimpleMessageListenerContainer(cf);c.setQueues(auditQueue());c.setMessageListener(m->listener.onMessage(m.getBody()));c.setDefaultRequeueRejected(false);
        c.setAdviceChain(RetryInterceptorBuilder.stateless().maxRetries(3).backOffOptions(1000,2.0,10000).build());return c;
    }
}
