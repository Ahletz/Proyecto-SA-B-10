package com.bank.notification.model;

import jakarta.persistence.*;

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

    /*
     * Se mantienen nullable para permitir migrar
     * eventos históricos de Fase 1.
     * Todo evento nuevo sí recibe estos valores.
     */
    @Enumerated(EnumType.STRING)
    @Column(length = 20)
    private NotificationSeverity severity;

    @Column(length = 100)
    private String origin;

    @Column(
        name = "classification_message",
        columnDefinition = "TEXT"
    )
    private String classificationMessage;

    public ProcessedEvent() {}

    public ProcessedEvent(
            String eventId,
            String eventType,
            Integer version,
            String correlationId,
            String payload,
            OffsetDateTime eventTimestamp,
            OffsetDateTime processedAt,
            NotificationSeverity severity,
            String origin,
            String classificationMessage) {

        this.eventId = eventId;
        this.eventType = eventType;
        this.version = version;
        this.correlationId = correlationId;
        this.payload = payload;
        this.eventTimestamp = eventTimestamp;
        this.processedAt = processedAt;
        this.severity = severity;
        this.origin = origin;
        this.classificationMessage =
            classificationMessage;
    }

    public String getEventId() {
        return eventId;
    }

    public String getEventType() {
        return eventType;
    }

    public Integer getVersion() {
        return version;
    }

    public String getCorrelationId() {
        return correlationId;
    }

    public String getPayload() {
        return payload;
    }

    public OffsetDateTime getEventTimestamp() {
        return eventTimestamp;
    }

    public OffsetDateTime getProcessedAt() {
        return processedAt;
    }

    public NotificationSeverity getSeverity() {
        return severity;
    }

    public String getOrigin() {
        return origin;
    }

    public String getClassificationMessage() {
        return classificationMessage;
    }
}
