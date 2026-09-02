package com.bank.notification.consumer;

import com.bank.notification.model.ProcessedEvent;
import com.bank.notification.repository.ProcessedEventRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;

@Component
public class CustomerEventListener {

    private static final Logger log = LoggerFactory.getLogger(CustomerEventListener.class);

    private final ProcessedEventRepository repository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public CustomerEventListener(ProcessedEventRepository repository) {
        this.repository = repository;
    }

    @RabbitListener(queues = "svc.notification.dev.customer")
    public void onMessage(String message) {
        try {
            JsonNode root = objectMapper.readTree(message);
            String eventId = root.path("eventId").asText();
            String eventType = root.path("eventType").asText();
            String correlationId = root.path("correlationId").asText();

            if (eventId == null || eventId.isBlank()) {
                throw new IllegalArgumentException("eventId requerido");
            }

            if (repository.existsById(eventId)) {
                log.info("Evento duplicado ignorado: {}", eventId);
                return;
            }

            repository.save(new ProcessedEvent(eventId, eventType, correlationId, OffsetDateTime.now()));
            log.info("Evento recibido: {} | correlationId={} | payload={}", eventType, correlationId, root.path("payload"));
        } catch (Exception e) {
            log.error("Error procesando mensaje de customer: {}", e.getMessage(), e);
            throw new RuntimeException("Error al procesar evento del customer", e);
        }
    }
}
