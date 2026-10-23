package com.bank.notification.publisher;

import com.bank.notification.model.NotificationSeverity;
import com.bank.notification.observability.Telemetry;
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

    private final Telemetry telemetry;
    public NotificationEventPublisher(
            RabbitTemplate rabbitTemplate, Telemetry telemetry) {
        this.rabbitTemplate = rabbitTemplate; this.telemetry=telemetry;
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

        telemetry.span("publish notification.classified",io.opentelemetry.context.Context.current(),correlationId,()->{
        try {
            String body =
                objectMapper.writeValueAsString(envelope);

            rabbitTemplate.invoke(operations -> {
            operations.convertAndSend(
                EXCHANGE,
                "notification.classified",
                body,
                amqpMessage -> {
                    telemetry.headers().forEach((k,v)->amqpMessage.getMessageProperties().setHeader(k,v));
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
            operations.waitForConfirmsOrDie(5000); return null;
            });

        } catch (JsonProcessingException exception) {
            throw new IllegalStateException(
                "No fue posible serializar notification.classified",
                exception
            );
        }
        return null;
        });
    }
}
