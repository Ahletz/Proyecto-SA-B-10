package com.bank.notification.model;

import jakarta.persistence.*;

import java.time.OffsetDateTime;

@Entity
@Table(name = "processed_events", indexes = {
    @Index(name="audit_correlation_idx", columnList="correlation_id,processed_at"),
    @Index(name="audit_trace_idx", columnList="trace_id,processed_at"),
    @Index(name="audit_filter_idx", columnList="service_name,severity,processed_at")
})
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

    @Column(length=32) private String traceId;
    @Column(length=16) private String spanId;
    @Column(length=100) private String serviceName;
    public String getTraceId() { return traceId; }
    public String getSpanId() { return spanId; }
    public String getServiceName() { return serviceName; }
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
