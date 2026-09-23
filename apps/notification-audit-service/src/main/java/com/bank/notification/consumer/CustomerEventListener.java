package com.bank.notification.consumer;

import com.bank.notification.model.ProcessedEvent;
import com.bank.notification.publisher.NotificationEventPublisher;
import com.bank.notification.repository.ProcessedEventRepository;
import com.bank.notification.service.ClassificationResult;
import com.bank.notification.service.EventClassificationService;
import com.bank.notification.service.NotificationService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;

@Component
public class CustomerEventListener {

    private static final Logger log =
        LoggerFactory.getLogger(
            CustomerEventListener.class
        );

    private final ProcessedEventRepository repository;
    private final NotificationService notifications;
    private final EventClassificationService classifier;
    private final NotificationEventPublisher publisher;

    private final ObjectMapper objectMapper =
        new ObjectMapper().findAndRegisterModules();

    public CustomerEventListener(
            ProcessedEventRepository repository,
            NotificationService notifications,
            EventClassificationService classifier,
            NotificationEventPublisher publisher) {

        this.repository = repository;
        this.notifications = notifications;
        this.classifier = classifier;
        this.publisher = publisher;
    }

    public void onMessage(byte[] message) {

        try {
            JsonNode root =
                objectMapper.readTree(message);

            String eventId =
                root.path("eventId").asText();

            String eventType =
                root.path("eventType").asText();

            String correlationId =
                root.path("correlationId").asText();

            if (eventId.isBlank()
                    || eventType.isBlank()
                    || correlationId.isBlank()) {

                throw new IllegalArgumentException(
                    "eventId, eventType y correlationId son requeridos"
                );
            }

            if (repository.existsById(eventId)) {
                log.info(
                    "Evento duplicado ignorado: {}",
                    eventId
                );
                return;
            }

            JsonNode payloadNode =
                root.path("payload");

            ClassificationResult classification =
                classifier.classify(
                    eventType,
                    payloadNode
                );

            /*
             * Notificaciones específicas heredadas
             * de Fase 1.
             */
            if ("customer.registered".equals(eventType)) {

                notifications.sendActivation(
                    payloadNode.path("email").asText(),
                    payloadNode.path("username").asText(),
                    payloadNode
                        .path("activationToken")
                        .asText()
                );

            } else if (
                "transaction.transfer.requested"
                    .equals(eventType)
            ) {

                notifications.sendTransferReceived(
                    payloadNode
                        .path("requestedEmail")
                        .asText(),
                    correlationId,
                    payloadNode
                        .path("amount")
                        .asDouble()
                );
            }

            /*
             * Publica el evento de clasificación antes
             * del registro definitivo.
             *
             * El eventId del evento derivado es
             * determinístico, por lo que un retry
             * conserva la misma identidad lógica.
             */
            publisher.publishClassified(
                eventId,
                classification.severity(),
                classification.origin(),
                classification.message(),
                correlationId
            );

            Integer version =
                root.path("version").isInt()
                    ? root.path("version").asInt()
                    : 1;

            OffsetDateTime eventTimestamp =
                parseTimestamp(
                    root.path("timestamp")
                        .asText(null)
                );

            String payload =
                payloadNode.isMissingNode()
                    ? "{}"
                    : objectMapper
                        .writeValueAsString(
                            payloadNode
                        );

            ProcessedEvent processedEvent =
                new ProcessedEvent(
                    eventId,
                    eventType,
                    version,
                    correlationId,
                    payload,
                    eventTimestamp,
                    OffsetDateTime.now(),
                    classification.severity(),
                    classification.origin(),
                    classification.message()
                );

            try {
                repository.save(processedEvent);
            } catch (
                DataIntegrityViolationException exception
            ) {
                log.info(
                    "Evento duplicado ignorado: {}",
                    eventId
                );
                return;
            }

            log.info(
                "Evento auditado: {} | severidad={} | correlationId={}",
                eventType,
                classification.severity(),
                correlationId
            );

        } catch (Exception exception) {

            log.error(
                "Error procesando evento: {}",
                exception.getMessage(),
                exception
            );

            throw new RuntimeException(
                "Error al procesar evento",
                exception
            );
        }
    }

    private OffsetDateTime parseTimestamp(
            String timestamp) {

        if (timestamp == null
                || timestamp.isBlank()) {
            return null;
        }

        try {
            return OffsetDateTime.parse(timestamp);
        } catch (
            DateTimeParseException exception
        ) {
            throw new IllegalArgumentException(
                "timestamp inválido",
                exception
            );
        }
    }
}
