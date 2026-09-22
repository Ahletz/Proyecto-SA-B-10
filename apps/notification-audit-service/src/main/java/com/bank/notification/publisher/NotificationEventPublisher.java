package com.bank.notification.publisher;

import com.bank.notification.model.NotificationSeverity;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@Component
public class NotificationEventPublisher {

    private static final String EXCHANGE = "bank.events";

    private final RabbitTemplate rabbitTemplate;
    private final ObjectMapper objectMapper =
        new ObjectMapper().findAndRegisterModules();

    public NotificationEventPublisher(
            RabbitTemplate rabbitTemplate) {
        this.rabbitTemplate = rabbitTemplate;
    }

    public void publishClassified(
            String sourceEventId,
            NotificationSeverity severity,
            String origin,
            String message,
            String correlationId) {

        /*
         * El eventId se genera de forma determinística a partir
         * del evento original. Si RabbitMQ provoca un retry,
         * notification.classified conservará el mismo eventId.
         */
        String classifiedEventId =
            UUID.nameUUIDFromBytes(
                ("notification.classified:" + sourceEventId)
                    .getBytes(StandardCharsets.UTF_8)
            ).toString();

        Map<String,Object> payload =
            new LinkedHashMap<>();

        payload.put("eventId", sourceEventId);
        payload.put("severidad", severity.name());
        payload.put("origen", origin);
        payload.put("mensaje", message);

        Map<String,Object> envelope =
            new LinkedHashMap<>();

        envelope.put("eventId", classifiedEventId);
        envelope.put(
            "eventType",
            "notification.classified"
        );
        envelope.put("version", 1);
        envelope.put(
            "timestamp",
            Instant.now().toString()
        );
        envelope.put(
            "correlationId",
            correlationId
        );
        envelope.put(
            "causationId",
            sourceEventId
        );
        envelope.put("payload", payload);

        try {
            String body =
                objectMapper.writeValueAsString(envelope);

            rabbitTemplate.convertAndSend(
                EXCHANGE,
                "notification.classified",
                body,
                amqpMessage -> {
                    amqpMessage
                        .getMessageProperties()
                        .setHeader(
                            "eventId",
                            classifiedEventId
                        );

                    amqpMessage
                        .getMessageProperties()
                        .setHeader(
                            "correlationId",
                            correlationId
                        );

                    amqpMessage
                        .getMessageProperties()
                        .setContentType(
                            "application/json"
                        );

                    return amqpMessage;
                }
            );

        } catch (JsonProcessingException exception) {
            throw new IllegalStateException(
                "No fue posible serializar notification.classified",
                exception
            );
        }
    }
}
