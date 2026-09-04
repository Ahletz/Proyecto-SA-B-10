package com.bankusac.account_service.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

// registro de cada evento ya procesado, para no ejecutar la logica dos veces
// si el mismo eventId llega otra vez (por un retry del broker), se ignora
@Entity
@Table(name = "processed_events")
public class ProcessedEvent {

    @Id
    private String eventId;

    @Column(nullable = false)
    private String eventType;

    @Column(nullable = false)
    private LocalDateTime processedAt;

    public ProcessedEvent() {
    }

    public ProcessedEvent(String eventId, String eventType) {
        this.eventId = eventId;
        this.eventType = eventType;
        this.processedAt = LocalDateTime.now();
    }

    public String getEventId() {
        return eventId;
    }

    public String getEventType() {
        return eventType;
    }

    public LocalDateTime getProcessedAt() {
        return processedAt;
    }
}