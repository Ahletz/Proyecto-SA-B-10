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

    @Column
    private Integer version;

    @Column(nullable = false)
    private String correlationId;

    @Column(columnDefinition = "TEXT")
    private String payload;

    private OffsetDateTime eventTimestamp;

    @Column(nullable = false)
    private OffsetDateTime processedAt;

    public ProcessedEvent() {}

    public ProcessedEvent(String eventId, String eventType, Integer version, String correlationId,
                          String payload, OffsetDateTime eventTimestamp, OffsetDateTime processedAt) {
        this.eventId = eventId;
        this.eventType = eventType;
        this.version = version;
        this.correlationId = correlationId;
        this.payload = payload;
        this.eventTimestamp = eventTimestamp;
        this.processedAt = processedAt;
    }

    public String getEventId() { return eventId; }
    public String getEventType() { return eventType; }
    public Integer getVersion() { return version; }
    public String getCorrelationId() { return correlationId; }
    public String getPayload() { return payload; }
    public OffsetDateTime getEventTimestamp() { return eventTimestamp; }
    public OffsetDateTime getProcessedAt() { return processedAt; }
}
