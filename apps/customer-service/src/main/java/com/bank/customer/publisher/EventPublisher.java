package com.bank.customer.publisher;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Component
public class EventPublisher {

    private final RabbitTemplate rabbit;
    private final ObjectMapper mapper = new ObjectMapper();

    public EventPublisher(RabbitTemplate rabbit) {
        this.rabbit = rabbit;
    }

    public void publish(String eventType, Map<String,Object> payload, String correlationId) {
        Map<String,Object> envelope = new HashMap<>();
        envelope.put("eventId", UUID.randomUUID().toString());
        envelope.put("eventType", eventType);
        envelope.put("version", 1);
        envelope.put("timestamp", Instant.now().toString());
        envelope.put("correlationId", correlationId == null ? UUID.randomUUID().toString() : correlationId);
        envelope.put("payload", payload);

        try {
            String body = mapper.writeValueAsString(envelope);
            String routingKey = eventType; // simple mapping
            rabbit.convertAndSend("bank.events", routingKey, body, message -> {
                message.getMessageProperties().setHeader("eventId", envelope.get("eventId"));
                message.getMessageProperties().setHeader("correlationId", envelope.get("correlationId"));
                message.getMessageProperties().setContentType(org.springframework.amqp.core.MessageProperties.CONTENT_TYPE_JSON);
                return message;
            });
        } catch (JsonProcessingException e) {
            throw new RuntimeException(e);
        }
    }
}
