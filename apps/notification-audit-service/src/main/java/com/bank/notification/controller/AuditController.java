package com.bank.notification.controller;

import com.bank.notification.model.ProcessedEvent;
import com.bank.notification.repository.ProcessedEventRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/audit")
public class AuditController {

    private final ProcessedEventRepository repository;
    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

    public AuditController(ProcessedEventRepository repository) {
        this.repository = repository;
    }

    @GetMapping("/events")
    public ResponseEntity<List<AuditEventResponse>> getEvents() {
        List<AuditEventResponse> events = repository.findTop200ByOrderByProcessedAtDesc()
                .stream()
                .map(this::toResponse)
                .toList();
        return ResponseEntity.ok(events);
    }

    private AuditEventResponse toResponse(ProcessedEvent event) {
        Map<String, Object> payload;
        try {
            payload = objectMapper.readValue(event.getPayload(), Map.class);
        } catch (Exception exception) {
            payload = Map.of();
        }

        return new AuditEventResponse(
                event.getEventId(),
                event.getEventType(),
                event.getVersion(),
                event.getCorrelationId(),
                event.getEventTimestamp(),
                event.getProcessedAt(),
                payload
        );
    }

    public record AuditEventResponse(
            String eventId,
            String eventType,
            Integer version,
            String correlationId,
            java.time.OffsetDateTime eventTimestamp,
            java.time.OffsetDateTime processedAt,
            Map<String, Object> payload
    ) {}
}
