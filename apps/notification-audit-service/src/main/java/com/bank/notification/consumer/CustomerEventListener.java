package com.bank.notification.consumer;

import com.bank.notification.model.ProcessedEvent;
import com.bank.notification.repository.ProcessedEventRepository;
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

    private static final Logger log = LoggerFactory.getLogger(CustomerEventListener.class);

    private final ProcessedEventRepository repository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public CustomerEventListener(ProcessedEventRepository repository) {
        this.repository = repository;
    }

    public void onMessage(byte[] message) {
        try {
            JsonNode root = objectMapper.readTree(message);
            String eventId = root.path("eventId").asText();
            String eventType = root.path("eventType").asText();
            String correlationId = root.path("correlationId").asText();

            if (eventId.isBlank() || eventType.isBlank() || correlationId.isBlank()) {
                throw new IllegalArgumentException("eventId, eventType y correlationId son requeridos");
            }

            if (repository.existsById(eventId)) {
                log.info("Evento duplicado ignorado: {}", eventId);
                return;
            }

                Integer version = root.path("version").isInt() ? root.path("version").asInt() : 1;
                OffsetDateTime eventTimestamp = parseTimestamp(root.path("timestamp").asText(null));
                String payload = root.path("payload").isMissingNode()
                    ? "{}"
                    : objectMapper.writeValueAsString(root.path("payload"));

                try {
                    repository.save(new ProcessedEvent(eventId, eventType, version, correlationId, payload,
                            eventTimestamp, OffsetDateTime.now()));
                } catch (DataIntegrityViolationException exception) {
                    log.info("Evento duplicado ignorado: {}", eventId);
                    return;
                }
            log.info("Evento recibido: {} | correlationId={} | payload={}", eventType, correlationId, root.path("payload"));
        } catch (Exception e) {
            log.error("Error procesando mensaje de customer: {}", e.getMessage(), e);
            throw new RuntimeException("Error al procesar evento del customer", e);
        }
    }

    private OffsetDateTime parseTimestamp(String timestamp) {
        if (timestamp == null || timestamp.isBlank()) {
            return null;
        }

        try {
            return OffsetDateTime.parse(timestamp);
        } catch (DateTimeParseException exception) {
            throw new IllegalArgumentException("timestamp inválido", exception);
        }
    }
}
