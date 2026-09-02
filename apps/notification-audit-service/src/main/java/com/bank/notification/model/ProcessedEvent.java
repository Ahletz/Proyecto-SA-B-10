package com.bank.notification.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;

@Entity
@Table(name = "processed_events")
public class ProcessedEvent {

    @Id
    @Column(nullable = false, unique = true)
    private String eventId;

    @Column(nullable = false)
    private String eventType;

    @Column(nullable = false)
    private String correlationId;

    @Column(nullable = false)
    private OffsetDateTime processedAt;

    public ProcessedEvent() {}

    public ProcessedEvent(String eventId, String eventType, String correlationId, OffsetDateTime processedAt) {
        this.eventId = eventId;
        this.eventType = eventType;
        this.correlationId = correlationId;
        this.processedAt = processedAt;
    }

    public String getEventId() { return eventId; }
    public String getEventType() { return eventType; }
    public String getCorrelationId() { return correlationId; }
    public OffsetDateTime getProcessedAt() { return processedAt; }
}
